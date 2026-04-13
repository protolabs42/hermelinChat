# Phase 5.1: Aurora Chat Manages Hermes MCP Servers

**Beads issue:** hermelinChat-6mp (P2)
**Date:** 2026-04-13
**Status:** Design approved, pending implementation

## Overview

Replace Aurora Chat's direct `@modelcontextprotocol/sdk` MCP client connections with hermes-native MCP management. Aurora Chat reads/writes `~/.hermes/config.yaml` directly for CRUD, uses the `rmcp` Rust crate for runtime MCP protocol calls, and lets hermes pick up config changes on its own schedule.

### Goals

- Full CRUD for all hermes MCP servers (stdio and HTTP) from Aurora Chat settings UI
- MCP App rendering (resource fetch, tool calls) proxied through Rust via rmcp — no CORS/Origin issues
- Secrets managed securely via `~/.hermes/.env` — write-only from frontend
- Single source of truth: hermes config.yaml
- No hermes patches required

### Non-goals

- MCP App rendering for stdio servers (no HTTP endpoint to connect to)
- Hot-reloading hermes MCP connections (hermes picks up changes on next session; explicit reload available)
- Replacing hermes CLI (`hermes mcp add/remove/list` still works alongside)

## Architecture

```
+-----------------------------------------------------+
|                    Aurora Chat UI                     |
|                                                       |
|  +--------------+  +-------------+  +-------------+  |
|  | Settings UI  |  |  AppHost    |  |  Stores     |  |
|  | (CRUD + env) |  |  (iframe)   |  |  (read-only)|  |
|  +------+-------+  +------+------+  +------+------+  |
|         | invoke()         | invoke()        |        |
+---------+-----------------+----------------+---------+
          v                 v                v
+-----------------------------------------------------+
|                   Tauri / Rust                        |
|                                                       |
|  +------------------+  +--------------------------+  |
|  |  hermes_config   |  |  mcp_proxy (rmcp)        |  |
|  |  config.yaml R/W |  |  lazy connection pool    |  |
|  |  .env R/W        |  |  read_resource           |  |
|  |  + validation    |  |  call_tool / list_tools   |  |
|  +------------------+  +------------+-------------+  |
+-------------------------------------+----------------+
                                      | HTTP (rmcp)
          +---------------------------+----------+
          v                           v          v
    +----------+              +----------+  +--------+
    |  hermes  |              | qr-server|  | get-   |
    | (picks up|              | :3002    |  | time   |
    |  config  |              +----------+  | :3001  |
    |  changes)|                            +--------+
    +----------+
```

Config changes flow left: UI -> Rust writes YAML/.env -> hermes picks up on next session.
MCP App runtime flows right: AppHost -> Rust rmcp pool -> HTTP to MCP server -> HTML/tool results back.
Hermes and Aurora Chat maintain independent MCP connections (hermes for agent tools, rmcp for UI rendering).

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime proxy | rmcp in Rust (Option A) | No CORS, no hermes patches, official SDK |
| Connection lifecycle | Lazy pool | Connect on first use, keep alive, drop on config change or shutdown |
| Secrets | Write-only from frontend | Frontend sees var names, never values. Prevents leakage through XSS/iframe. |
| Stdio commands | Allowlist validation | npx, bun, node, python, uvx, uv, docker. Prevents command injection. |
| Config sync with hermes | No auto-reconnect | Config written immediately; hermes picks up on next session. Explicit reload button available. |
| MCP client crate | rmcp 1.4.0 (official Rust SDK) | 7.4M downloads, maintained by modelcontextprotocol org, Tauri-compatible deps |
| AppBridge integration | Pass null client, use manual handlers | AppBridge constructor requires SDK Client type; pass null and wire oncalltool/onreadresource handlers to Tauri proxy |
| Existing inline env values | Read both formats, write ${VAR} refs | Existing config.yaml has raw values in env:; we read them but new/edited entries use ${VAR} refs |

## Rust Backend

### Dependencies

```toml
# Cargo.toml additions
rmcp = { version = "1.4.0", features = ["client", "transport-streamable-http-client-reqwest"] }
serde_yml = "0.0"          # maintained fork of deprecated serde_yaml
dotenvy = "0.15"
```

### Module: hermes_config.rs

Handles all `~/.hermes/config.yaml` and `~/.hermes/.env` operations.

#### Data Model

```rust
// NO Debug derive — prevents secret leakage in logs
//
// Transport is determined by presence of `url` (HTTP) or `command` (stdio).
// Uses serde(untagged) + serde(flatten) to match hermes's flat YAML format:
//
//   mcp_servers:
//     chorus:              # <-- name is the HashMap key, not a struct field
//       command: bun
//       args: [run, ...]
//       env: { KEY: "${VAR}" }
//     hyperviking:
//       url: http://127.0.0.1:1942/mcp
//
#[derive(Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum McpTransport {
    // Http first — `url` is more distinctive discriminant than `command`
    Http {
        url: String,                                    // validated: http(s) only
        #[serde(default, skip_serializing_if = "HashMap::is_empty")]
        headers: HashMap<String, String>,
    },
    Stdio {
        command: String,                                // validated against ALLOWED_COMMANDS
        #[serde(default)]
        args: Vec<String>,
    },
}

#[derive(Clone, Serialize, Deserialize)]
pub struct McpServerEntry {
    // `name` is NOT here — it's the key in HashMap<String, McpServerEntry>
    #[serde(flatten)]
    pub transport: McpTransport,
    #[serde(default)]
    pub env: HashMap<String, String>,                   // KEY -> "${ENV_VAR}" refs for new entries
    #[serde(default = "default_true")]
    pub enabled: bool,                                  // hermes-native: enabled: false skips server
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout: Option<u64>,                           // hermes-native: per-tool timeout in seconds
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub connect_timeout: Option<u64>,                   // hermes-native: initial connection timeout
    // Preserve unknown hermes fields (sampling, tools.include/exclude, etc.)
    #[serde(flatten)]
    pub extra: HashMap<String, serde_yml::Value>,
}

fn default_true() -> bool { true }

const ALLOWED_COMMANDS: &[&str] = &["npx", "bun", "node", "python", "python3", "uvx", "uv", "docker"];
```

The `mcp_servers` section is deserialized as `HashMap<String, McpServerEntry>`, with the key being the server name. The `extra` field captures any hermes-native config keys we don't explicitly model (like `sampling`, `tools.include/exclude`) so they survive round-trip editing.

**Compatibility with hermes config format:**

All fields (`enabled`, `timeout`, `connect_timeout`, `headers`, `env`) are hermes-native — hermes reads and respects them. No Aurora-specific fields are added to config.yaml.

**Env value handling:** hermes supports both inline values (`CHORUS_API_KEY: cho_538...`) and `${ENV_VAR}` interpolation (resolved from `os.environ` which includes `~/.hermes/.env`). When reading, we detect both formats — inline values are flagged as "legacy inline" in the UI. When writing new entries or editing existing ones, we always use `${VAR}` refs and save actual values to `.env`. We never forcibly migrate existing inline values unless the user edits that server.

#### Validation

- **Server names:** `^[a-zA-Z0-9_-]{1,64}$` — rejects YAML-breaking characters
- **Env var keys:** `^[A-Z][A-Z0-9_]{0,127}$`
- **Stdio commands:** Must be in `ALLOWED_COMMANDS` allowlist
- **Stdio args:** No shell metacharacters (`;`, `|`, `&`, `` ` ``, `$()`, `>`, `<`)
- **HTTP URLs:** Parsed by `url` crate, must be `http` or `https` scheme

#### Config Operations

All operations are serialized behind `tokio::sync::Mutex<()>` (async-safe, won't block the Tokio runtime during file I/O) in Tauri state and use advisory file locking (`flock`) for cross-process safety with hermes CLI.

**Ordering for update/remove:** Always disconnect from rmcp pool first, then write config, then return to frontend. This prevents stale pool entries if the config write succeeds but disconnect fails.

- `read_mcp_servers() -> Vec<McpServerEntry>` — parse full YAML, extract `mcp_servers` section. For `env:` values, detect whether each is a `${VAR}` ref or inline literal — return the key names and ref format, never raw secret values.
- `write_mcp_server(name, entry)` — validate all fields, parse full YAML, upsert `mcp_servers` key, atomic write (write to temp file, rename, `chmod 0600`). Env values must be `${VAR}` refs.
- `remove_mcp_server(name) -> Vec<String>` — **disconnect from pool first**, then parse, delete key, atomic write. Returns list of now-orphaned env var names.
- `test_mcp_server(name) -> TestResult` — try-connect via rmcp (HTTP servers) or validate config (stdio servers: check command exists in PATH). Return capabilities or error, don't cache the connection.

#### Env Operations

Same lock as config operations. Same atomic write pattern.

- `list_env_var_names() -> Vec<String>` — names only, no values, not even masked
- `save_env_var(key, value)` — validate key format, atomic write, `chmod 0600`. Write-only: value goes in, never comes out.
- `delete_env_var(key)` — remove from .env, atomic write
- `find_orphaned_env_vars() -> Vec<String>` — scan all `mcp_servers` entries for `${VAR}` references (both in `env:` and `headers:` values), return `.env` var names not referenced by any server

### Module: mcp_proxy.rs

Lazy connection pool using rmcp for HTTP MCP server communication.

#### Pool Structure

```rust
pub struct McpPool {
    clients: HashMap<String, McpPoolEntry>,
}

struct McpPoolEntry {
    client: rmcp::service::RunningService<rmcp::RoleClient, ()>,
    connected_at: Instant,
}

const MAX_CONNECTIONS: usize = 20;
const MAX_PAYLOAD_BYTES: usize = 1_048_576; // 1MB
```

Pool is stored in Tauri state behind `tokio::sync::RwLock<McpPool>`.

#### Connection Lifecycle

- `get_or_connect(name)`:
  1. Read lock — check if client exists in pool
  2. If hit, return reference
  3. If miss, drop read lock (no lock held during network I/O)
  4. Read config.yaml for server URL. Error if stdio transport.
  5. Connect via rmcp `StreamableHttpClientTransport`, run MCP initialize handshake
  6. Write lock — double-check for races, insert client
  7. If pool full (>20), evict least-recently-used connection to make room
  8. Apply `connect_timeout` from server config (default 30s) to the handshake
- `disconnect(name)` — drop client from pool (called on config update/remove/toggle-off)
- `disconnect_all()` — called on app shutdown

#### Health Recovery

No background polling. If a call fails (connection dropped), the client is removed from pool and reconnected on next attempt. Rate limited per server using a token bucket: 10 calls/sec burst, refills at 10/sec.

#### Proxy Operations

All go through `get_or_connect` first.

- `read_resource(server, uri) -> String` — validates URI is not `file://` scheme (MCP resource URIs are server-defined; `ui://` is common but not enforced — intentionally permissive for Phase 5.1, can restrict later). Returns HTML/text string.
- `call_tool(server, tool, args) -> serde_json::Value` — validates args < 1MB, returns JSON result
- `list_tools(server) -> Vec<ToolSchema>` — returns tool name + schema pairs
- `list_resources(server) -> Vec<ResourceInfo>` — returns resource URI + name + description pairs

### Tauri Commands

#### Config Commands

```rust
#[tauri::command]
async fn list_mcp_servers(state: State<'_, ConfigState>) -> Result<Vec<McpServerInfo>, String>

#[tauri::command]
async fn add_mcp_server(name: String, transport: McpTransport, env_refs: HashMap<String, String>, state: State<'_, ConfigState>) -> Result<(), String>

#[tauri::command]
async fn update_mcp_server(name: String, transport: McpTransport, env_refs: HashMap<String, String>, state: State<'_, ConfigState>, pool: State<'_, RwLock<McpPool>>) -> Result<(), String>

#[tauri::command]
async fn remove_mcp_server(name: String, state: State<'_, ConfigState>, pool: State<'_, RwLock<McpPool>>) -> Result<Vec<String>, String>

#[tauri::command]
async fn toggle_mcp_server(name: String, enabled: bool, state: State<'_, ConfigState>, pool: State<'_, RwLock<McpPool>>) -> Result<(), String>

#[tauri::command]
async fn test_mcp_server(name: String, state: State<'_, ConfigState>) -> Result<TestResult, String>
```

#### Secret Commands (Write-Only)

```rust
#[tauri::command]
async fn list_env_var_names(state: State<'_, ConfigState>) -> Result<Vec<String>, String>

#[tauri::command]
async fn save_env_var(key: String, value: String, state: State<'_, ConfigState>) -> Result<(), String>

#[tauri::command]
async fn delete_env_var(key: String, state: State<'_, ConfigState>) -> Result<(), String>

#[tauri::command]
async fn find_orphaned_env_vars(state: State<'_, ConfigState>) -> Result<Vec<String>, String>
```

#### Proxy Commands (HTTP Servers Only)

```rust
#[tauri::command]
async fn mcp_read_resource(server: String, uri: String, pool: State<'_, RwLock<McpPool>>, config: State<'_, ConfigState>) -> Result<String, String>

#[tauri::command]
async fn mcp_call_tool(server: String, tool: String, args: serde_json::Value, pool: State<'_, RwLock<McpPool>>, config: State<'_, ConfigState>) -> Result<serde_json::Value, String>

#[tauri::command]
async fn mcp_list_tools(server: String, pool: State<'_, RwLock<McpPool>>, config: State<'_, ConfigState>) -> Result<Vec<ToolInfo>, String>

#[tauri::command]
async fn mcp_list_resources(server: String, pool: State<'_, RwLock<McpPool>>, config: State<'_, ConfigState>) -> Result<Vec<ResourceInfo>, String>
```

#### Hermes Sync

```rust
#[tauri::command]
async fn reload_hermes(app: AppHandle, state: State<'_, AcpState>) -> Result<(), String>
// Wraps existing acp_reconnect. Explicit user action only.
```

## Frontend

### Store: hermesMcpServers.ts

Replaces `mcpClients.ts`. Read-only view of hermes config backed by Tauri commands.

```typescript
type TransportType = 'stdio' | 'http';

interface HermesMcpServer {
  name: string;
  transport: TransportType;
  url?: string;                    // HTTP only
  command?: string;                // stdio only
  args?: string[];                 // stdio only
  envRefs: string[];               // env var names referenced (not values)
  enabled: boolean;
  status: 'unknown' | 'connecting' | 'connected' | 'error';
  error?: string;
  capabilities?: Record<string, unknown>;
}

interface HermesMcpServerStore {
  servers: Record<string, HermesMcpServer>;
  refresh(): Promise<void>;
  addServer(name: string, transport: McpTransportConfig, secrets: {key: string, value: string}[]): Promise<void>;
  updateServer(name: string, transport: McpTransportConfig, secrets: {key: string, value: string}[]): Promise<void>;
  removeServer(name: string): Promise<string[]>;  // returns orphaned env var names
  toggleServer(name: string, enabled: boolean): Promise<void>;
  testServer(name: string): Promise<TestResult>;
}
```

`addServer` orchestration:
1. Calls `save_env_var(key, value)` for each secret — values never stored in JS state
2. Calls `add_mcp_server(name, transport, env_refs)` with `${VAR}` references only
3. Calls `refresh()` to sync state from config.yaml

`refresh()` called on mount, after any CRUD op, and when settings panel opens. No polling — config changes are user-initiated.

### Settings UI: McpServerSettings.tsx

Complete rewrite. Same location, same visual language (CSS custom properties, 4px grid).

**Server list:**
- Each row: name, transport badge (stdio/http pill), status dot (green/yellow/red/gray), enable/disable toggle
- HTTP servers show "Apps" indicator (supports MCP App rendering)
- Expand/collapse per row: URL or command+args, referenced env var names, timeout settings
- Actions: Edit, Test Connection, Remove

**Add server form:**
- Transport picker (two tabs: HTTP / stdio)
- HTTP: name, url, headers (key-value pair list)
- Stdio: name, command (dropdown of allowlisted values), args (editable list)
- Env vars section: key-value inputs for new secrets with label "Saved securely as ${KEY}". Values sent to Rust on save, cleared from form.
- Test Connection button: runs test_mcp_server, shows result inline
- Save button: disabled until name + required fields valid

**Remove flow:**
- Confirmation dialog
- If orphaned env vars returned: "These secrets are no longer used: [X, Y]. Delete them?"

**Edit flow:**
- Same form as Add, pre-populated. Secret values show placeholder — leave unchanged or type new value.

**Env var management:**
- Collapsible section at bottom: "Environment Variables"
- Lists all var names with delete button
- "Find unused" button highlights orphaned vars

### AppHost Migration

Replace direct SDK Client usage with Tauri command proxies via AppBridge's manual handler API.

**Key insight:** `AppBridge` constructor accepts `Client | null`. When `null` is passed, it exposes manual handler hooks instead of auto-forwarding through a Client. This is the same path already used for bundled apps. We pass `null` and wire the handlers to Tauri commands:

```typescript
// Create AppBridge with null client — use manual handler setters
const bridge = new AppBridge(null, { hostContext: getThemeContext() });

// Wire manual handlers to Tauri proxy
// Handler signatures match ext-apps@1.5.0 API: (params, extra) => result
bridge.oncalltool = async (params, _extra) => {
  return await invoke('mcp_call_tool', {
    server,
    tool: params.name,
    args: params.arguments ?? {},
  });
};

bridge.onreadresource = async (params, _extra) => {
  return await invoke('mcp_read_resource', { server, uri: params.uri });
};

bridge.onlistresources = async (_params, _extra) => {
  return await invoke('mcp_list_resources', { server });
};

// Note: AppBridge has no `onlisttools` setter. Tool listing is handled
// automatically when `serverTools: {}` capability is declared and
// `oncalltool` is wired. The mcp_list_tools Tauri command exists for
// the settings UI (showing discovered tools), not for AppBridge.
```

**AppHost changes:**
- Replace `useMcpClientStore().getClient(server)` with status check from `hermesMcpServers` store
- Pass `null` as client to `AppBridge`, wire manual handlers to Tauri proxy commands
- Status states (connecting, error, not configured) read from hermes store
- Resource resolution: `resolveUiResource()` calls `invoke('mcp_read_resource')` instead of `client.readResource()` — resolver.ts adapted to accept a proxy function instead of Client

**Unchanged:**
- AppBridge + PostMessageTransport (iframe postMessage protocol)
- Bundled demos (aurora-bundled bypass, null client path already works)
- CSP injection, theme bridge
- A2UI action emission via SurfaceAnchor

### Cleanup

**Remove:**
- `v2/src/stores/mcpClients.ts` (old Zustand store with Client instances)
- `v2/src/a2ui/mcp-app/mcp-config.ts` (localStorage persistence)
- All direct `Client` / `StreamableHTTPClientTransport` imports and usage

**Keep:**
- `@modelcontextprotocol/sdk` in package.json — required as type dependency by `@modelcontextprotocol/ext-apps` (AppBridge constructor signature references `Client` type). No runtime usage remains.
- `@modelcontextprotocol/ext-apps` (AppBridge, PostMessageTransport, theme types)
- `v2/src/a2ui/mcp-app/resolver.ts` (adapted: bundled path unchanged, remote path uses Tauri proxy function instead of Client)
- `v2/src/a2ui/mcp-app/csp.ts`, `theme-bridge.ts`

## Security Measures

| Concern | Mitigation |
|---------|------------|
| Secret leakage | Write-only from frontend. No Debug derive on secret-containing structs. Env var names only returned, never values. |
| Command injection (stdio) | Command allowlist: npx, bun, node, python, python3, uvx, uv, docker. Args validated for shell metacharacters. |
| SSRF (HTTP) | URL validated via url crate, http(s) only. |
| Race conditions | Mutex on all config file ops + flock for cross-process safety. |
| Data loss | Atomic writes (temp + rename) for both config.yaml and .env. chmod 0600 after every write. |
| Connection exhaustion | Pool capped at 20. Rate limit 10 calls/sec per server. Max 1MB payload. |
| rmcp pool contention | tokio::sync::RwLock. Lock not held during network I/O (connect handshake). |
| Name injection | Server names: ^[a-zA-Z0-9_-]{1,64}$. Env keys: ^[A-Z][A-Z0-9_]{0,127}$. |

## Verification Plan

1. **Add HTTP server via UI** -> appears in `hermes mcp list` after reload
2. **Add stdio server via UI** -> appears in config.yaml with validated command
3. **Remove server via UI** -> gone from config, orphaned env vars prompted for cleanup
4. **Toggle server off/on** -> rmcp connection dropped/re-established
5. **Test Connection button** -> shows success + capabilities or clear error
6. **MCP App renders** -> AppHost fetches resource + calls tools via Rust proxy
7. **Secrets never exposed** -> no secret values in frontend state, network tab, or logs
8. **qr-server works** -> without the host=0.0.0.0 Origin workaround
9. **Bundled demos unaffected** -> counter, clock, tool-input-echo still work
10. **hermes CLI still works** -> `hermes mcp add/remove` operates on same config.yaml
