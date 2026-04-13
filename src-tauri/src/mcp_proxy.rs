// src-tauri/src/mcp_proxy.rs
//
// Lazy rmcp connection pool. Proxies MCP protocol calls (resource reads,
// tool calls, tool listing, resource listing) to HTTP MCP servers, keeping
// all network I/O in Rust so the browser never touches the MCP endpoints
// (no CORS issues).

use std::collections::HashMap;
use std::time::Instant;

use rmcp::{
    RoleClient,
    model::{CallToolRequestParams, PaginatedRequestParams, ReadResourceRequestParams, ResourceContents},
    serve_client,
    service::RunningService,
    transport::StreamableHttpClientTransport,
};
use tokio::sync::RwLock;

use crate::hermes_config::{McpTransport, read_mcp_servers};

// ── Constants ─────────────────────────────────────────────────────────

const MAX_POOL_SIZE: usize = 20;
const MAX_PAYLOAD_BYTES: usize = 1024 * 1024; // 1 MB

// ── Pool Entry ────────────────────────────────────────────────────────

/// One live MCP client connection.
type McpClient = RunningService<RoleClient, ()>;

pub(crate) struct PoolEntry {
    client: McpClient,
    connected_at: Instant,
}

// ── Pool ──────────────────────────────────────────────────────────────

pub struct McpPool {
    /// server_name → live client entry (public so proxy fns can read it via pool.read())
    pub clients: HashMap<String, PoolEntry>,
}

impl McpPool {
    pub fn new() -> Self {
        Self {
            clients: HashMap::new(),
        }
    }
}

impl Default for McpPool {
    fn default() -> Self {
        Self::new()
    }
}

/// Tauri managed state: an RwLock over the pool.
pub struct McpPoolState(pub RwLock<McpPool>);

impl McpPoolState {
    pub fn new() -> Self {
        Self(RwLock::new(McpPool::new()))
    }
}

// ── Connection helpers ────────────────────────────────────────────────

/// Ensure `server_name` has a live client in the pool.
///
/// Acquires the write lock only when a new connection is actually needed,
/// then releases it before any blocking network I/O is triggered by the
/// caller's subsequent read-lock usage.
pub async fn ensure_connected(
    pool_state: &McpPoolState,
    server_name: &str,
) -> Result<(), String> {
    // Fast path: read lock first.
    {
        let guard = pool_state.0.read().await;
        if guard.clients.contains_key(server_name) {
            return Ok(());
        }
    }

    // Slow path: build the client, then write it in.
    let entry = build_client(server_name).await?;

    let mut guard = pool_state.0.write().await;

    // Re-check under write lock (another task may have raced us).
    if guard.clients.contains_key(server_name) {
        // Discard the extra connection gracefully (best-effort).
        drop(entry);
        return Ok(());
    }

    // LRU eviction: if pool is full, drop the oldest entry.
    if guard.clients.len() >= MAX_POOL_SIZE {
        let oldest_name = guard
            .clients
            .iter()
            .min_by_key(|(_, e)| e.connected_at)
            .map(|(name, _)| name.clone());
        if let Some(name) = oldest_name {
            guard.clients.remove(&name);
        }
    }

    guard.clients.insert(server_name.to_string(), entry);
    Ok(())
}

/// Construct a new pool entry for a server, reading the config.
async fn build_client(server_name: &str) -> Result<PoolEntry, String> {
    let servers = read_mcp_servers()
        .map_err(|e| format!("Failed to read MCP config: {e}"))?;

    let entry = servers
        .get(server_name)
        .ok_or_else(|| format!("MCP server '{server_name}' not found in config"))?;

    let url = match &entry.transport {
        McpTransport::Http { url, .. } => url.clone(),
        McpTransport::Stdio { .. } => {
            return Err(format!(
                "MCP App proxy requires HTTP transport, but server '{server_name}' is stdio"
            ));
        }
    };

    let transport = StreamableHttpClientTransport::from_uri(url.as_str());

    let client: McpClient = serve_client((), transport)
        .await
        .map_err(|e| format!("Failed to connect to MCP server '{server_name}': {e}"))?;

    Ok(PoolEntry {
        client,
        connected_at: Instant::now(),
    })
}

/// Remove a client from the pool (called when a call fails so the next
/// attempt triggers a fresh connection).
async fn evict(pool_state: &McpPoolState, server_name: &str) {
    let mut guard = pool_state.0.write().await;
    guard.clients.remove(server_name);
}

// ── Disconnect helpers ────────────────────────────────────────────────

pub async fn disconnect(pool_state: &McpPoolState, server_name: &str) {
    evict(pool_state, server_name).await;
}

pub async fn disconnect_all(pool_state: &McpPoolState) {
    let mut guard = pool_state.0.write().await;
    guard.clients.clear();
}

// ── Proxy operations ──────────────────────────────────────────────────

/// Read a resource from an HTTP MCP server.
///
/// Returns the text content as an HTML-safe string. `file://` URIs are
/// rejected to prevent local filesystem reads.
pub async fn read_resource(
    pool_state: &McpPoolState,
    server_name: &str,
    uri: &str,
) -> Result<String, String> {
    // Block file:// URIs.
    if uri.starts_with("file://") || uri.starts_with("file:") {
        return Err("file:// URIs are not allowed in MCP proxy read_resource".into());
    }

    ensure_connected(pool_state, server_name).await?;

    let params = ReadResourceRequestParams::new(uri);

    let result = {
        let guard = pool_state.0.read().await;
        let entry = guard
            .clients
            .get(server_name)
            .ok_or_else(|| format!("MCP server '{server_name}' unexpectedly absent from pool"))?;

        entry.client.peer().read_resource(params).await
    };

    match result {
        Ok(read_result) => {
            // Collect all text content from the response.
            let mut parts: Vec<String> = Vec::new();
            for content in read_result.contents {
                match content {
                    ResourceContents::TextResourceContents { text, .. } => {
                        parts.push(text);
                    }
                    ResourceContents::BlobResourceContents { blob, mime_type, .. } => {
                        // Embed blobs as a data URL string.
                        let mt = mime_type.as_deref().unwrap_or("application/octet-stream");
                        parts.push(format!("data:{mt};base64,{blob}"));
                    }
                }
            }
            Ok(parts.join("\n"))
        }
        Err(e) => {
            evict(pool_state, server_name).await;
            Err(format!("MCP read_resource for '{server_name}' failed: {e}"))
        }
    }
}

/// Call a tool on an HTTP MCP server.
///
/// `args` is a JSON object string (or `null`/empty for no arguments).
/// Payloads larger than 1 MB are rejected. Returns the tool result as JSON.
pub async fn call_tool(
    pool_state: &McpPoolState,
    server_name: &str,
    tool_name: &str,
    args: Option<serde_json::Value>,
) -> Result<String, String> {
    // Guard payload size.
    if let Some(ref v) = args {
        let serialized = serde_json::to_string(v)
            .map_err(|e| format!("Failed to serialize tool arguments: {e}"))?;
        if serialized.len() > MAX_PAYLOAD_BYTES {
            return Err(format!(
                "Tool call payload exceeds limit of {} bytes",
                MAX_PAYLOAD_BYTES
            ));
        }
    }

    ensure_connected(pool_state, server_name).await?;

    let arguments: Option<serde_json::Map<String, serde_json::Value>> = match args {
        Some(serde_json::Value::Object(map)) => Some(map),
        Some(serde_json::Value::Null) | None => None,
        Some(other) => {
            return Err(format!(
                "Tool arguments must be a JSON object, got: {}",
                other
            ));
        }
    };

    let params = {
        let base = CallToolRequestParams::new(tool_name.to_owned());
        if let Some(args_map) = arguments {
            base.with_arguments(args_map)
        } else {
            base
        }
    };

    let result = {
        let guard = pool_state.0.read().await;
        let entry = guard
            .clients
            .get(server_name)
            .ok_or_else(|| format!("MCP server '{server_name}' unexpectedly absent from pool"))?;
        entry.client.peer().call_tool(params).await
    };

    match result {
        Ok(tool_result) => {
            serde_json::to_string(&tool_result)
                .map_err(|e| format!("Failed to serialize tool result: {e}"))
        }
        Err(e) => {
            evict(pool_state, server_name).await;
            Err(format!("MCP call_tool '{tool_name}' on '{server_name}' failed: {e}"))
        }
    }
}

/// List all tools on an HTTP MCP server. Returns JSON array of tool schemas.
pub async fn list_tools(
    pool_state: &McpPoolState,
    server_name: &str,
) -> Result<String, String> {
    ensure_connected(pool_state, server_name).await?;

    let result = {
        let guard = pool_state.0.read().await;
        let entry = guard
            .clients
            .get(server_name)
            .ok_or_else(|| format!("MCP server '{server_name}' unexpectedly absent from pool"))?;
        entry
            .client
            .peer()
            .list_tools(Some(PaginatedRequestParams::default()))
            .await
    };

    match result {
        Ok(list_result) => {
            serde_json::to_string(&list_result.tools)
                .map_err(|e| format!("Failed to serialize tool list: {e}"))
        }
        Err(e) => {
            evict(pool_state, server_name).await;
            Err(format!("MCP list_tools for '{server_name}' failed: {e}"))
        }
    }
}

/// List all resources on an HTTP MCP server. Returns JSON array.
pub async fn list_resources(
    pool_state: &McpPoolState,
    server_name: &str,
) -> Result<String, String> {
    ensure_connected(pool_state, server_name).await?;

    let result = {
        let guard = pool_state.0.read().await;
        let entry = guard
            .clients
            .get(server_name)
            .ok_or_else(|| format!("MCP server '{server_name}' unexpectedly absent from pool"))?;
        entry
            .client
            .peer()
            .list_resources(Some(PaginatedRequestParams::default()))
            .await
    };

    match result {
        Ok(list_result) => {
            serde_json::to_string(&list_result.resources)
                .map_err(|e| format!("Failed to serialize resource list: {e}"))
        }
        Err(e) => {
            evict(pool_state, server_name).await;
            Err(format!("MCP list_resources for '{server_name}' failed: {e}"))
        }
    }
}
