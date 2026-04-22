// src-tauri/src/mcp_commands.rs
//
// Tauri command handlers that expose hermes_config and mcp_proxy to the
// frontend. All async commands run on Tauri's tokio runtime.

use crate::hermes_config::{self, ConfigLock, McpServerEntry, McpServerInfo, McpTransport};
use crate::mcp_proxy::McpPoolState;
use std::collections::HashMap;
use tauri::State;

// ── Config commands ───────────────────────────────────────────────────

#[tauri::command]
pub async fn list_mcp_servers(
    lock: State<'_, ConfigLock>,
) -> Result<Vec<McpServerInfo>, String> {
    let _guard = lock.0.lock().await;
    let servers = hermes_config::read_mcp_servers()?;
    Ok(servers
        .iter()
        .map(|(name, entry)| McpServerInfo::from_entry(name.clone(), entry))
        .collect())
}

#[tauri::command]
pub async fn add_mcp_server(
    name: String,
    transport: McpTransport,
    env_refs: HashMap<String, String>,
    enabled: Option<bool>,
    timeout: Option<u64>,
    connect_timeout: Option<u64>,
    lock: State<'_, ConfigLock>,
) -> Result<(), String> {
    let _guard = lock.0.lock().await;
    let entry = McpServerEntry {
        transport,
        env: env_refs,
        enabled: enabled.unwrap_or(true),
        timeout,
        connect_timeout,
        extra: HashMap::new(),
    };
    hermes_config::upsert_mcp_server(&name, entry)
}

#[tauri::command]
pub async fn update_mcp_server(
    name: String,
    transport: McpTransport,
    env_refs: HashMap<String, String>,
    enabled: Option<bool>,
    timeout: Option<u64>,
    connect_timeout: Option<u64>,
    lock: State<'_, ConfigLock>,
    pool: State<'_, McpPoolState>,
) -> Result<(), String> {
    // Disconnect first so the next use picks up fresh config.
    crate::mcp_proxy::disconnect(&pool, &name).await;
    let _guard = lock.0.lock().await;
    // Read existing entry to preserve unknown hermes fields (sampling, tools, …).
    let existing = hermes_config::read_mcp_servers()?;
    let extra = existing
        .get(&name)
        .map(|e| e.extra.clone())
        .unwrap_or_default();
    let entry = McpServerEntry {
        transport,
        env: env_refs,
        enabled: enabled.unwrap_or(true),
        timeout,
        connect_timeout,
        extra,
    };
    hermes_config::upsert_mcp_server(&name, entry)
}

#[tauri::command]
pub async fn remove_mcp_server(
    name: String,
    lock: State<'_, ConfigLock>,
    pool: State<'_, McpPoolState>,
) -> Result<Vec<String>, String> {
    // Disconnect first, then write config.
    crate::mcp_proxy::disconnect(&pool, &name).await;
    let _guard = lock.0.lock().await;
    hermes_config::remove_mcp_server(&name)
}

#[tauri::command]
pub async fn toggle_mcp_server(
    name: String,
    enabled: bool,
    lock: State<'_, ConfigLock>,
    pool: State<'_, McpPoolState>,
) -> Result<(), String> {
    if !enabled {
        crate::mcp_proxy::disconnect(&pool, &name).await;
    }
    let _guard = lock.0.lock().await;
    hermes_config::toggle_mcp_server(&name, enabled)
}

#[tauri::command]
pub async fn test_mcp_server(
    name: String,
    lock: State<'_, ConfigLock>,
) -> Result<serde_json::Value, String> {
    let servers = {
        let _guard = lock.0.lock().await;
        hermes_config::read_mcp_servers()?
    };
    let entry = servers
        .get(&name)
        .ok_or_else(|| format!("Server '{name}' not found"))?;

    match &entry.transport {
        McpTransport::Stdio { command, .. } => {
            // For stdio: check if command exists in PATH.
            let output = std::process::Command::new("which").arg(command).output();
            match output {
                Ok(o) if o.status.success() => Ok(serde_json::json!({
                    "status": "ok",
                    "transport": "stdio",
                    "command_path": String::from_utf8_lossy(&o.stdout).trim()
                })),
                _ => Err(format!("Command '{command}' not found in PATH")),
            }
        }
        McpTransport::Http { url, .. } => {
            // For HTTP: attempt a real MCP connection via a temporary pool.
            let temp_pool = McpPoolState::new();
            match crate::mcp_proxy::list_tools(&temp_pool, &name).await {
                Ok(tools_json) => {
                    let tools: serde_json::Value =
                        serde_json::from_str(&tools_json).unwrap_or(serde_json::Value::Null);
                    Ok(serde_json::json!({
                        "status": "ok",
                        "transport": "http",
                        "url": url,
                        "tools": tools,
                    }))
                }
                Err(e) => Err(format!("Connection test failed: {e}")),
            }
        }
    }
}

// ── Secret commands ───────────────────────────────────────────────────

#[tauri::command]
pub async fn list_env_var_names(
    lock: State<'_, ConfigLock>,
) -> Result<Vec<String>, String> {
    let _guard = lock.0.lock().await;
    hermes_config::list_env_var_names()
}

#[tauri::command]
pub async fn save_env_var(
    key: String,
    value: String,
    lock: State<'_, ConfigLock>,
) -> Result<(), String> {
    let _guard = lock.0.lock().await;
    hermes_config::save_env_var(&key, &value)
}

#[tauri::command]
pub async fn delete_env_var(
    key: String,
    lock: State<'_, ConfigLock>,
) -> Result<(), String> {
    let _guard = lock.0.lock().await;
    hermes_config::delete_env_var(&key)
}

#[tauri::command]
pub async fn find_orphaned_env_vars(
    lock: State<'_, ConfigLock>,
) -> Result<Vec<String>, String> {
    let _guard = lock.0.lock().await;
    hermes_config::find_orphaned_env_vars()
}

// ── Proxy commands ────────────────────────────────────────────────────

#[tauri::command]
pub async fn mcp_read_resource(
    server: String,
    uri: String,
    pool: State<'_, McpPoolState>,
) -> Result<String, String> {
    crate::mcp_proxy::read_resource(&pool, &server, &uri).await
}

#[tauri::command]
pub async fn mcp_call_tool(
    server: String,
    tool: String,
    args: Option<serde_json::Value>,
    pool: State<'_, McpPoolState>,
) -> Result<String, String> {
    crate::mcp_proxy::call_tool(&pool, &server, &tool, args).await
}

#[tauri::command]
pub async fn mcp_list_tools(
    server: String,
    pool: State<'_, McpPoolState>,
) -> Result<String, String> {
    crate::mcp_proxy::list_tools(&pool, &server).await
}

#[tauri::command]
pub async fn mcp_list_resources(
    server: String,
    pool: State<'_, McpPoolState>,
) -> Result<String, String> {
    crate::mcp_proxy::list_resources(&pool, &server).await
}

// ── Hermes sync ───────────────────────────────────────────────────────

/// Restart the hermes ACP process and swap the client in managed state.
/// Implements reconnect directly — State<'_> lifetimes can't be forwarded to
/// another Tauri command handler.
#[tauri::command]
pub async fn reload_hermes(
    app: tauri::AppHandle,
    state: State<'_, crate::commands::AcpState>,
    health: State<'_, crate::commands::AcpHealthState>,
) -> Result<String, String> {
    {
        let mut status = health.0.lock().map_err(|e| e.to_string())?;
        status.status = "connecting".to_string();
        status.message = None;
    }
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(client) = guard.take() {
        client.shutdown();
    }
    let client = crate::acp::client::AcpClient::spawn(&app, health.0.clone())
        .map_err(|e| format!("Failed to respawn hermes: {e}"))?;
    *guard = Some(client);
    Ok("reconnected".to_string())
}
