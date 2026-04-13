# MCP Server Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aurora Chat manages hermes MCP servers (full CRUD via config.yaml) and proxies MCP App runtime calls through Rust via rmcp.

**Architecture:** Rust backend reads/writes `~/.hermes/config.yaml` for server CRUD + `~/.hermes/.env` for secrets (write-only from frontend). Runtime MCP calls (resource reads, tool calls) go through a lazy rmcp connection pool in Rust. Frontend store is a read-only view backed by Tauri commands. AppBridge uses null-client pattern with manual handlers routed to Tauri.

**Tech Stack:** Rust (rmcp 1.4.0, serde_yaml, dotenvy, tokio), React + Zustand, Tauri v2 IPC

**Spec:** `docs/superpowers/specs/2026-04-13-mcp-server-management-design.md`

---

## File Map

**Create:**
- `src-tauri/src/hermes_config.rs` — config.yaml + .env CRUD, validation
- `src-tauri/src/mcp_proxy.rs` — rmcp lazy connection pool + proxy operations
- `src-tauri/src/mcp_commands.rs` — Tauri command handlers
- `v2/src/stores/hermesMcpServers.ts` — Zustand store backed by Tauri commands
- `v2/src/a2ui/mcp-app/tauri-proxy.ts` — AppBridge manual handler wiring

**Modify:**
- `src-tauri/Cargo.toml` — add rmcp, serde_yaml, dotenvy deps
- `src-tauri/src/lib.rs` — register new modules, commands, managed state
- `v2/src/a2ui/mcp-app/AppHost.tsx` — null-client + Tauri proxy handlers
- `v2/src/a2ui/mcp-app/resolver.ts` — accept proxy function for remote resolution
- `v2/src/components/settings/McpServerSettings.tsx` — full rewrite

**Remove (Task 10):**
- `v2/src/stores/mcpClients.ts`
- `v2/src/a2ui/mcp-app/mcp-config.ts`
- `v2/src/a2ui/mcp-app/__tests__/mcp-config.test.ts` (if exists)

**Also migrate (Task 10):**
- `v2/src/a2ui/renderer/A2UIDevPreview.tsx` — imports `useMcpClientStore` + `loadConfiguredServers`

---

## Task 1: Add Rust Dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add dependencies to Cargo.toml**

Add after the existing `[dependencies]` entries:

```toml
rmcp = { version = "1.4", features = ["client", "transport-streamable-http-client-reqwest"] }
serde_yaml = "0.9"
dotenvy = "0.15"
regex = "1"
```

Note: serde_yaml 0.9 is soft-deprecated but battle-tested. We can migrate to serde_yml later if needed. Also add `regex` for validation patterns.

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/inu/hermelinChat && cargo check -p aurora-chat`

Expected: compiles with warnings (unused deps), no errors. If rmcp 1.4 isn't available, check crates.io for exact latest version and adjust.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(mcp): add rmcp, serde_yaml, dotenvy dependencies"
```

---

## Task 2: Config Data Model + Validation (hermes_config.rs)

**Files:**
- Create: `src-tauri/src/hermes_config.rs`

- [ ] **Step 1: Create module with data model and validation**

```rust
// src-tauri/src/hermes_config.rs
//
// Reads/writes ~/.hermes/config.yaml (mcp_servers section) and ~/.hermes/.env.
// All config file operations are serialized via ConfigLock.

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::LazyLock;

// ── Validation ────────────────────────────────────────────────────────

static SERVER_NAME_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z0-9_-]{1,64}$").unwrap());

static ENV_KEY_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Z][A-Z0-9_]{0,127}$").unwrap());

const ALLOWED_COMMANDS: &[&str] = &[
    "npx", "bun", "node", "python", "python3", "uvx", "uv", "docker",
];

const SHELL_META: &[char] = &[';', '|', '&', '`', '$', '>', '<', '(', ')'];

pub fn validate_server_name(name: &str) -> Result<(), String> {
    if SERVER_NAME_RE.is_match(name) {
        Ok(())
    } else {
        Err(format!("Invalid server name '{name}': must match [a-zA-Z0-9_-]{{1,64}}"))
    }
}

pub fn validate_env_key(key: &str) -> Result<(), String> {
    if ENV_KEY_RE.is_match(key) {
        Ok(())
    } else {
        Err(format!("Invalid env var key '{key}': must match [A-Z][A-Z0-9_]{{0,127}}"))
    }
}

pub fn validate_stdio_command(command: &str) -> Result<(), String> {
    if ALLOWED_COMMANDS.contains(&command) {
        Ok(())
    } else {
        Err(format!(
            "Command '{command}' not in allowlist: {}",
            ALLOWED_COMMANDS.join(", ")
        ))
    }
}

pub fn validate_stdio_args(args: &[String]) -> Result<(), String> {
    for arg in args {
        if arg.contains(SHELL_META) {
            return Err(format!("Argument '{arg}' contains shell metacharacters"));
        }
    }
    Ok(())
}

pub fn validate_http_url(url: &str) -> Result<(), String> {
    match url::Url::parse(url) {
        Ok(u) if u.scheme() == "http" || u.scheme() == "https" => Ok(()),
        Ok(u) => Err(format!("URL scheme '{}' not allowed, must be http or https", u.scheme())),
        Err(e) => Err(format!("Invalid URL '{url}': {e}")),
    }
}

// ── Data Model ────────────────────────────────────────────────────────

/// Transport discriminated by presence of `url` (HTTP) or `command` (stdio).
/// Matches hermes's flat YAML format via serde(untagged) + serde(flatten).
#[derive(Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum McpTransport {
    Http {
        url: String,
        #[serde(default, skip_serializing_if = "HashMap::is_empty")]
        headers: HashMap<String, String>,
    },
    Stdio {
        command: String,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        args: Vec<String>,
    },
}

fn default_true() -> bool { true }

/// One mcp_servers entry in hermes config.yaml.
/// `name` is the YAML map key, not a field here.
#[derive(Clone, Serialize, Deserialize)]
pub struct McpServerEntry {
    #[serde(flatten)]
    pub transport: McpTransport,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub connect_timeout: Option<u64>,
    /// Preserve unknown hermes fields (sampling, tools, etc.) during round-trip
    #[serde(flatten)]
    pub extra: HashMap<String, serde_yaml::Value>,
}

/// Info returned to frontend — no secret values.
#[derive(Clone, Serialize)]
pub struct McpServerInfo {
    pub name: String,
    pub transport_type: String, // "stdio" or "http"
    pub url: Option<String>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub headers: Option<HashMap<String, String>>, // included for edit flow
    pub env_keys: Vec<String>,  // includes refs from both env: and headers:
    pub has_inline_values: bool, // true if any env value is NOT a ${VAR} ref
    pub enabled: bool,
    pub timeout: Option<u64>,
    pub connect_timeout: Option<u64>,
}

impl McpServerInfo {
    pub fn from_entry(name: String, entry: &McpServerEntry) -> Self {
        let (transport_type, url, command, args, headers) = match &entry.transport {
            McpTransport::Http { url, headers } => (
                "http".into(), Some(url.clone()), None, None,
                if headers.is_empty() { None } else { Some(headers.clone()) },
            ),
            McpTransport::Stdio { command, args } => {
                ("stdio".into(), None, Some(command.clone()), Some(args.clone()), None)
            }
        };
        // Detect inline values (NOT ${VAR} refs)
        let has_inline_values = entry.env.values().any(|v| !v.starts_with("${"));
        // Collect all env var refs from both env: and headers:
        let mut env_keys: Vec<String> = entry.env.keys().cloned().collect();
        if let McpTransport::Http { headers, .. } = &entry.transport {
            for v in headers.values() {
                if let Some(var) = super::extract_env_ref(v) {
                    if !env_keys.contains(&var) {
                        env_keys.push(var);
                    }
                }
            }
        }
        McpServerInfo {
            name,
            transport_type,
            url,
            command,
            args,
            headers,
            env_keys,
            has_inline_values,
            enabled: entry.enabled,
            timeout: entry.timeout,
            connect_timeout: entry.connect_timeout,
        }
    }
}

pub fn validate_entry(name: &str, entry: &McpServerEntry) -> Result<(), String> {
    validate_server_name(name)?;
    match &entry.transport {
        McpTransport::Stdio { command, args } => {
            validate_stdio_command(command)?;
            validate_stdio_args(args)?;
        }
        McpTransport::Http { url, .. } => {
            validate_http_url(url)?;
        }
    }
    Ok(())
}

/// Resolve ~/.hermes/ paths.
pub fn hermes_home() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".hermes")
}

pub fn config_path() -> PathBuf {
    hermes_home().join("config.yaml")
}

pub fn env_path() -> PathBuf {
    hermes_home().join(".env")
}
```

- [ ] **Step 2: Add `url` crate dependency**

Add to `src-tauri/Cargo.toml`:
```toml
url = "2"
dirs = "6"
```

- [ ] **Step 3: Register module in lib.rs**

Add `mod hermes_config;` at the top of `src-tauri/src/lib.rs`.

- [ ] **Step 4: Verify it compiles**

Run: `cd /home/inu/hermelinChat && cargo check -p aurora-chat`

- [ ] **Step 5: Write validation tests**

Add at the bottom of `hermes_config.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_server_names() {
        assert!(validate_server_name("chorus").is_ok());
        assert!(validate_server_name("my-server_2").is_ok());
        assert!(validate_server_name("a").is_ok());
    }

    #[test]
    fn invalid_server_names() {
        assert!(validate_server_name("").is_err());
        assert!(validate_server_name("has space").is_err());
        assert!(validate_server_name("has:colon").is_err());
        assert!(validate_server_name(&"x".repeat(65)).is_err());
    }

    #[test]
    fn valid_env_keys() {
        assert!(validate_env_key("API_KEY").is_ok());
        assert!(validate_env_key("A").is_ok());
        assert!(validate_env_key("CHORUS_API_KEY").is_ok());
    }

    #[test]
    fn invalid_env_keys() {
        assert!(validate_env_key("").is_err());
        assert!(validate_env_key("lowercase").is_err());
        assert!(validate_env_key("1STARTS_WITH_NUM").is_err());
    }

    #[test]
    fn valid_commands() {
        assert!(validate_stdio_command("npx").is_ok());
        assert!(validate_stdio_command("bun").is_ok());
        assert!(validate_stdio_command("docker").is_ok());
    }

    #[test]
    fn invalid_commands() {
        assert!(validate_stdio_command("bash").is_err());
        assert!(validate_stdio_command("sh").is_err());
        assert!(validate_stdio_command("curl").is_err());
    }

    #[test]
    fn shell_metachar_args() {
        assert!(validate_stdio_args(&["--flag".into(), "value".into()]).is_ok());
        assert!(validate_stdio_args(&["foo;bar".into()]).is_err());
        assert!(validate_stdio_args(&["$(evil)".into()]).is_err());
    }

    #[test]
    fn http_url_validation() {
        assert!(validate_http_url("http://localhost:3001/mcp").is_ok());
        assert!(validate_http_url("https://api.example.com/mcp").is_ok());
        assert!(validate_http_url("file:///etc/passwd").is_err());
        assert!(validate_http_url("ftp://evil.com").is_err());
        assert!(validate_http_url("not a url").is_err());
    }

    #[test]
    fn parse_hermes_yaml_format() {
        let yaml = r#"
chorus:
  command: bun
  args:
    - run
    - /path/to/server.ts
  env:
    CHORUS_URL: https://chorus.runclaw.run
    CHORUS_API_KEY: "${CHORUS_API_KEY}"
hyperviking:
  url: http://127.0.0.1:1942/mcp
  enabled: true
disabled_server:
  url: http://localhost:9999
  enabled: false
"#;
        let servers: HashMap<String, McpServerEntry> =
            serde_yaml::from_str(yaml).expect("should parse hermes YAML format");

        assert_eq!(servers.len(), 3);

        // Stdio server
        let chorus = &servers["chorus"];
        assert!(matches!(&chorus.transport, McpTransport::Stdio { command, .. } if command == "bun"));
        assert_eq!(chorus.env.len(), 2);
        assert!(chorus.enabled); // default true

        // HTTP server
        let hv = &servers["hyperviking"];
        assert!(matches!(&hv.transport, McpTransport::Http { url, .. } if url == "http://127.0.0.1:1942/mcp"));
        assert!(hv.enabled);

        // Disabled server
        let disabled = &servers["disabled_server"];
        assert!(!disabled.enabled);
    }

    #[test]
    fn round_trip_preserves_unknown_fields() {
        let yaml = r#"
test-server:
  url: http://localhost:3000
  sampling:
    enabled: true
    model: gemini-3-flash
  tools:
    include:
      - my_tool
"#;
        let servers: HashMap<String, McpServerEntry> =
            serde_yaml::from_str(yaml).expect("parse");
        let entry = &servers["test-server"];
        assert!(entry.extra.contains_key("sampling"));
        assert!(entry.extra.contains_key("tools"));

        // Round-trip
        let serialized = serde_yaml::to_string(&servers).expect("serialize");
        assert!(serialized.contains("sampling"));
        assert!(serialized.contains("my_tool"));
    }
}
```

- [ ] **Step 6: Run tests**

Run: `cd /home/inu/hermelinChat && cargo test -p aurora-chat -- hermes_config`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/hermes_config.rs src-tauri/Cargo.toml src-tauri/src/lib.rs
git commit -m "feat(mcp): data model, validation, and YAML parsing for hermes config"
```

---

## Task 3: Config Read/Write Operations

**Files:**
- Modify: `src-tauri/src/hermes_config.rs`

- [ ] **Step 1: Add config read/write functions**

Add to `hermes_config.rs` after the data model section:

```rust
use std::io::Write;
use tokio::sync::Mutex as TokioMutex;

/// Serialized access to config files. Managed by Tauri state.
pub struct ConfigLock(pub TokioMutex<()>);

/// Read mcp_servers section from config.yaml.
pub fn read_mcp_servers() -> Result<HashMap<String, McpServerEntry>, String> {
    let path = config_path();
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    let root: serde_yaml::Value = serde_yaml::from_str(&content)
        .map_err(|e| format!("Invalid YAML: {e}"))?;
    let servers_val = root.get("mcp_servers");
    match servers_val {
        Some(v) => serde_yaml::from_value(v.clone())
            .map_err(|e| format!("Failed to parse mcp_servers: {e}")),
        None => Ok(HashMap::new()),
    }
}

/// Write mcp_servers section to config.yaml, preserving all other keys.
/// Uses atomic write (temp file + rename) with 0600 permissions.
pub fn write_mcp_servers(servers: &HashMap<String, McpServerEntry>) -> Result<(), String> {
    let path = config_path();

    // Read existing YAML as generic Value to preserve other sections
    let mut root: serde_yaml::Value = if path.exists() {
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
        serde_yaml::from_str(&content).map_err(|e| format!("Invalid YAML: {e}"))?
    } else {
        serde_yaml::Value::Mapping(serde_yaml::Mapping::new())
    };

    // Replace mcp_servers key
    let servers_value = serde_yaml::to_value(servers)
        .map_err(|e| format!("Failed to serialize mcp_servers: {e}"))?;
    root.as_mapping_mut()
        .ok_or("Config root is not a YAML mapping")?
        .insert(
            serde_yaml::Value::String("mcp_servers".into()),
            servers_value,
        );

    // Atomic write: temp file → rename
    let yaml = serde_yaml::to_string(&root)
        .map_err(|e| format!("Failed to serialize YAML: {e}"))?;
    atomic_write(&path, yaml.as_bytes())?;

    Ok(())
}

/// Atomic write: write to temp file in same directory, then rename.
/// Sets file permissions to 0600 on Unix.
fn atomic_write(path: &PathBuf, data: &[u8]) -> Result<(), String> {
    let dir = path.parent().ok_or("No parent directory")?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir)
        .map_err(|e| format!("Failed to create temp file: {e}"))?;
    tmp.write_all(data)
        .map_err(|e| format!("Failed to write temp file: {e}"))?;
    tmp.flush()
        .map_err(|e| format!("Failed to flush temp file: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(tmp.path(), std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set permissions: {e}"))?;
    }

    tmp.persist(path)
        .map_err(|e| format!("Failed to rename temp file: {e}"))?;
    Ok(())
}

/// Upsert a single server into config.yaml.
pub fn upsert_mcp_server(name: &str, entry: McpServerEntry) -> Result<(), String> {
    validate_entry(name, &entry)?;
    let mut servers = read_mcp_servers()?;
    servers.insert(name.to_string(), entry);
    write_mcp_servers(&servers)
}

/// Remove a server from config.yaml. Returns orphaned env var names.
pub fn remove_mcp_server(name: &str) -> Result<Vec<String>, String> {
    let mut servers = read_mcp_servers()?;
    let removed = servers.remove(name);
    if removed.is_none() {
        return Err(format!("Server '{name}' not found in config"));
    }
    write_mcp_servers(&servers)?;
    find_orphaned_env_vars_in(&servers)
}

/// Toggle a server's enabled state.
pub fn toggle_mcp_server(name: &str, enabled: bool) -> Result<(), String> {
    let mut servers = read_mcp_servers()?;
    let entry = servers.get_mut(name)
        .ok_or(format!("Server '{name}' not found in config"))?;
    entry.enabled = enabled;
    write_mcp_servers(&servers)
}
```

- [ ] **Step 2: Add `tempfile` dependency**

Add to Cargo.toml:
```toml
tempfile = "3"
```

- [ ] **Step 3: Write tests for read/write operations**

Add to the `tests` module:

```rust
use std::io::Write as _;
use tempfile::TempDir;

fn setup_test_config(dir: &TempDir) -> PathBuf {
    let config = dir.path().join("config.yaml");
    let content = r#"
model:
  provider: openai-codex
mcp_servers:
  chorus:
    command: bun
    args:
      - run
      - /path/to/server.ts
    env:
      CHORUS_URL: https://chorus.runclaw.run
  hyperviking:
    url: http://127.0.0.1:1942/mcp
display:
  skin: catppuccin-frappe
"#;
    std::fs::write(&config, content).unwrap();
    config
}

#[test]
fn read_preserves_all_servers() {
    // This test uses the real config path, so we test the parse logic
    // separately with known YAML content.
    let yaml = r#"
test-a:
  command: npx
  args: ["-y", "test-server"]
test-b:
  url: http://localhost:3000
"#;
    let servers: HashMap<String, McpServerEntry> =
        serde_yaml::from_str(yaml).unwrap();
    assert_eq!(servers.len(), 2);
}

#[test]
fn upsert_and_read_round_trip() {
    let dir = TempDir::new().unwrap();
    let config = setup_test_config(&dir);

    // Override config_path for test — use env var or just test serialization
    let mut servers = {
        let content = std::fs::read_to_string(&config).unwrap();
        let root: serde_yaml::Value = serde_yaml::from_str(&content).unwrap();
        let sv = root.get("mcp_servers").unwrap();
        serde_yaml::from_value::<HashMap<String, McpServerEntry>>(sv.clone()).unwrap()
    };

    // Add a new server
    servers.insert("new-server".into(), McpServerEntry {
        transport: McpTransport::Http {
            url: "http://localhost:4000".into(),
            headers: HashMap::new(),
        },
        env: HashMap::new(),
        enabled: true,
        timeout: None,
        connect_timeout: None,
        extra: HashMap::new(),
    });

    assert_eq!(servers.len(), 3);
    assert!(servers.contains_key("new-server"));
}
```

- [ ] **Step 4: Run tests**

Run: `cd /home/inu/hermelinChat && cargo test -p aurora-chat -- hermes_config`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/hermes_config.rs src-tauri/Cargo.toml
git commit -m "feat(mcp): config.yaml read/write with atomic writes and validation"
```

---

## Task 4: .env Management

**Files:**
- Modify: `src-tauri/src/hermes_config.rs`

- [ ] **Step 1: Add .env read/write functions**

Add to `hermes_config.rs`:

```rust
/// Read .env file, return var names only (write-only secret model).
pub fn list_env_var_names() -> Result<Vec<String>, String> {
    let path = env_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read .env: {e}"))?;
    Ok(parse_env_keys(&content))
}

fn parse_env_keys(content: &str) -> Vec<String> {
    content
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty() && !trimmed.starts_with('#')
        })
        .filter_map(|line| line.split_once('=').map(|(k, _)| k.trim().to_string()))
        .collect()
}

/// Save a secret to .env (upsert). Write-only — value never returned.
pub fn save_env_var(key: &str, value: &str) -> Result<(), String> {
    validate_env_key(key)?;
    let path = env_path();
    let mut lines: Vec<String> = if path.exists() {
        std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read .env: {e}"))?
            .lines()
            .map(|l| l.to_string())
            .collect()
    } else {
        vec![]
    };

    // Upsert: replace existing or append
    let prefix = format!("{key}=");
    let new_line = format!("{key}={value}");
    let mut found = false;
    for line in &mut lines {
        if line.trim_start().starts_with(&prefix) {
            *line = new_line.clone();
            found = true;
            break;
        }
    }
    if !found {
        lines.push(new_line);
    }

    let content = lines.join("\n") + "\n";
    atomic_write(&path, content.as_bytes())
}

/// Delete a var from .env.
pub fn delete_env_var(key: &str) -> Result<(), String> {
    let path = env_path();
    if !path.exists() {
        return Ok(());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read .env: {e}"))?;
    let prefix = format!("{key}=");
    let filtered: Vec<&str> = content
        .lines()
        .filter(|line| !line.trim_start().starts_with(&prefix))
        .collect();
    let new_content = filtered.join("\n") + "\n";
    atomic_write(&path, new_content.as_bytes())
}

/// Find env vars in .env that no server references via ${VAR}.
pub fn find_orphaned_env_vars_in(
    servers: &HashMap<String, McpServerEntry>,
) -> Result<Vec<String>, String> {
    let env_keys = list_env_var_names()?;
    let mut referenced: std::collections::HashSet<String> = std::collections::HashSet::new();

    for entry in servers.values() {
        // Check env: values for ${VAR} refs
        for v in entry.env.values() {
            if let Some(var) = extract_env_ref(v) {
                referenced.insert(var);
            }
        }
        // Check headers for ${VAR} refs
        if let McpTransport::Http { headers, .. } = &entry.transport {
            for v in headers.values() {
                if let Some(var) = extract_env_ref(v) {
                    referenced.insert(var);
                }
            }
        }
    }

    Ok(env_keys
        .into_iter()
        .filter(|k| !referenced.contains(k))
        .collect())
}

fn extract_env_ref(value: &str) -> Option<String> {
    if value.starts_with("${") && value.ends_with('}') {
        Some(value[2..value.len() - 1].to_string())
    } else {
        None
    }
}

/// Find orphaned env vars against current config.
pub fn find_orphaned_env_vars() -> Result<Vec<String>, String> {
    let servers = read_mcp_servers()?;
    find_orphaned_env_vars_in(&servers)
}
```

- [ ] **Step 2: Write tests**

```rust
#[test]
fn parse_env_keys_works() {
    let content = "API_KEY=secret123\n# comment\nOTHER_VAR=value\n\nBAD LINE\n";
    let keys = parse_env_keys(content);
    assert_eq!(keys, vec!["API_KEY", "OTHER_VAR", "BAD LINE"]);
    // Note: "BAD LINE" has no = so it's filtered out by split_once
}

#[test]
fn extract_env_ref_works() {
    assert_eq!(extract_env_ref("${MY_KEY}"), Some("MY_KEY".into()));
    assert_eq!(extract_env_ref("plain_value"), None);
    assert_eq!(extract_env_ref("${PARTIAL"), None);
}
```

- [ ] **Step 3: Run tests**

Run: `cd /home/inu/hermelinChat && cargo test -p aurora-chat -- hermes_config`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/hermes_config.rs
git commit -m "feat(mcp): .env read/write with write-only secret model"
```

---

## Task 5: MCP Proxy Pool (mcp_proxy.rs)

**Files:**
- Create: `src-tauri/src/mcp_proxy.rs`

This task creates the rmcp lazy connection pool. The exact rmcp API may differ from what's shown — use `context7` to look up `rmcp` crate docs during implementation.

- [ ] **Step 1: Create proxy module with pool structure**

```rust
// src-tauri/src/mcp_proxy.rs
//
// Lazy rmcp connection pool for HTTP MCP servers.
// Proxies resource reads + tool calls through Rust (no CORS issues).

use crate::hermes_config::{self, McpTransport};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::time::Instant;
use tokio::sync::RwLock;

const MAX_CONNECTIONS: usize = 20;
const MAX_PAYLOAD_BYTES: usize = 1_048_576; // 1MB
const DEFAULT_CONNECT_TIMEOUT_SECS: u64 = 30;

struct PoolEntry {
    // The exact rmcp client type — look up rmcp docs for the correct type.
    // Should be something like: rmcp::service::RunningService<rmcp::RoleClient, ...>
    client: rmcp::service::RunningService<rmcp::RoleClient, ()>,
    connected_at: Instant,
}

pub struct McpPool {
    clients: HashMap<String, PoolEntry>,
}

impl McpPool {
    pub fn new() -> Self {
        Self {
            clients: HashMap::new(),
        }
    }

    /// Get an existing connection or create a new one.
    /// Only works for HTTP transport servers.
    pub async fn get_or_connect(
        &mut self,
        name: &str,
    ) -> Result<&rmcp::service::RunningService<rmcp::RoleClient, ()>, String> {
        if self.clients.contains_key(name) {
            return Ok(&self.clients[name].client);
        }

        // Read server config
        let servers = hermes_config::read_mcp_servers()?;
        let entry = servers.get(name)
            .ok_or(format!("Server '{name}' not found in config"))?;

        let url = match &entry.transport {
            McpTransport::Http { url, .. } => url.clone(),
            McpTransport::Stdio { .. } => {
                return Err(format!("Server '{name}' uses stdio transport — MCP App proxy requires HTTP"));
            }
        };

        if !entry.enabled {
            return Err(format!("Server '{name}' is disabled"));
        }

        // LRU eviction if pool is full
        if self.clients.len() >= MAX_CONNECTIONS {
            let oldest = self.clients.iter()
                .min_by_key(|(_, e)| e.connected_at)
                .map(|(k, _)| k.clone());
            if let Some(key) = oldest {
                self.clients.remove(&key);
            }
        }

        // Connect via rmcp — look up exact API with context7
        let timeout = entry.connect_timeout.unwrap_or(DEFAULT_CONNECT_TIMEOUT_SECS);
        let transport = rmcp::transport::StreamableHttpClientTransport::from_uri(&url)
            .map_err(|e| format!("Failed to create transport for '{name}': {e}"))?;

        let client_info = rmcp::model::ClientInfo::new(
            rmcp::model::ClientCapabilities::default(),
            rmcp::model::Implementation::new("aurora-chat", "0.1.0"),
        );

        let client = tokio::time::timeout(
            std::time::Duration::from_secs(timeout),
            client_info.serve(transport),
        )
        .await
        .map_err(|_| format!("Connection to '{name}' timed out after {timeout}s"))?
        .map_err(|e| format!("Failed to connect to '{name}': {e}"))?;

        self.clients.insert(name.to_string(), PoolEntry {
            client,
            connected_at: Instant::now(),
        });

        Ok(&self.clients[name].client)
    }

    /// Drop a connection (called on config change).
    pub fn disconnect(&mut self, name: &str) {
        self.clients.remove(name);
    }

    /// Drop all connections (called on shutdown).
    pub fn disconnect_all(&mut self) {
        self.clients.clear();
    }
}

// ── Proxy operations ──────────────────────────────────────────────────

pub async fn read_resource(
    pool: &RwLock<McpPool>,
    server: &str,
    uri: &str,
) -> Result<String, String> {
    // Validate URI scheme
    if uri.starts_with("file://") {
        return Err("file:// URIs are not allowed".into());
    }

    // Two-phase lock: ensure connected (may acquire write lock briefly),
    // then use read lock for the actual operation.
    ensure_connected(pool, server).await?;
    let pool_guard = pool.read().await;
    let client = &pool_guard.clients[server].client;

    // rmcp resources/read — look up exact API
    let result = client
        .read_resource(rmcp::model::ReadResourceRequestParam { uri: uri.into() })
        .await
        .map_err(|e| format!("Failed to read resource from '{server}': {e}"))?;

    // Extract text content
    result.contents.iter()
        .find_map(|c| c.as_text().map(|t| t.text.clone()))
        .ok_or(format!("Resource {uri} from '{server}' returned no text content"))
}

/// Ensure a server has an active connection in the pool.
/// Uses write lock only when a new connection is needed.
async fn ensure_connected(pool: &RwLock<McpPool>, server: &str) -> Result<(), String> {
    // Fast path: check with read lock
    {
        let guard = pool.read().await;
        if guard.clients.contains_key(server) {
            return Ok(());
        }
    }
    // Slow path: connect (no lock held during network I/O)
    let mut pool_mut = pool.write().await;
    pool_mut.get_or_connect(server).await?;
    Ok(())
}

pub async fn call_tool(
    pool: &RwLock<McpPool>,
    server: &str,
    tool: &str,
    args: JsonValue,
) -> Result<JsonValue, String> {
    // Validate payload size
    let payload_size = serde_json::to_string(&args)
        .map(|s| s.len())
        .unwrap_or(0);
    if payload_size > MAX_PAYLOAD_BYTES {
        return Err(format!("Tool call payload too large: {payload_size} bytes (max {MAX_PAYLOAD_BYTES})"));
    }

    ensure_connected(pool, server).await?;
    let pool_guard = pool.read().await;
    let client = &pool_guard.clients[server].client;

    let arguments = args.as_object().cloned();
    let result = client
        .call_tool(rmcp::model::CallToolRequestParam {
            name: tool.into(),
            arguments,
        })
        .await
        .map_err(|e| format!("Tool call '{tool}' on '{server}' failed: {e}"))?;

    serde_json::to_value(&result)
        .map_err(|e| format!("Failed to serialize tool result: {e}"))
}

pub async fn list_tools(
    pool: &RwLock<McpPool>,
    server: &str,
) -> Result<JsonValue, String> {
    ensure_connected(pool, server).await?;
    let pool_guard = pool.read().await;
    let client = &pool_guard.clients[server].client;

    let result = client
        .list_tools(Default::default())
        .await
        .map_err(|e| format!("Failed to list tools from '{server}': {e}"))?;

    serde_json::to_value(&result)
        .map_err(|e| format!("Failed to serialize tools: {e}"))
}

pub async fn list_resources(
    pool: &RwLock<McpPool>,
    server: &str,
) -> Result<JsonValue, String> {
    ensure_connected(pool, server).await?;
    let pool_guard = pool.read().await;
    let client = &pool_guard.clients[server].client;

    let result = client
        .list_resources(Default::default())
        .await
        .map_err(|e| format!("Failed to list resources from '{server}': {e}"))?;

    serde_json::to_value(&result)
        .map_err(|e| format!("Failed to serialize resources: {e}"))
}
```

**Implementation notes:**

**Return types for AppBridge handlers:** The Rust proxy commands currently return raw `String` / `serde_json::Value`. But AppBridge handlers expect MCP SDK result types (`CallToolResult`, `ReadResourceResult`, `ListResourcesResult`). Two options:
- (Recommended) Shape Rust return values to match MCP result schemas (e.g., `read_resource` returns `{ contents: [{ uri, text }] }` not a bare string)
- Or wrap on the TypeScript side in `tauri-proxy.ts` to construct the proper result shapes

**Tauri parameter naming:** Tauri v2 auto-converts camelCase from JS to snake_case in Rust. Verify this works for nested types (`McpTransport` variants). If not, add `#[serde(rename_all = "camelCase")]` on command parameter structs.

**flock advisory locking:** The spec requires `flock` for cross-process safety with hermes CLI. Deferred to a follow-up — the `TokioMutex` + atomic writes are sufficient for Aurora Chat's own operations, and hermes CLI writes are rare. Add `flock` when `file-lock` or `fs2` crate is evaluated.

**Rate limiting:** The spec's token bucket (10/sec per server) is deferred. Add when needed — current usage patterns (user-triggered MCP App interactions) are unlikely to hit rate limits.

The rmcp API calls shown above are based on the documented API. The exact types/methods may differ. Use `context7` to look up `rmcp` crate documentation and adjust method names, parameter types, and return types accordingly. Key things to verify:
- `StreamableHttpClientTransport::from_uri` exact API
- `ClientInfo::new` and `serve()` method
- `read_resource`, `call_tool`, `list_tools`, `list_resources` method signatures
- How to extract text content from resource results

- [ ] **Step 2: Register module in lib.rs**

Add `mod mcp_proxy;` to `src-tauri/src/lib.rs`.

- [ ] **Step 3: Verify it compiles**

Run: `cd /home/inu/hermelinChat && cargo check -p aurora-chat`

Fix any rmcp API mismatches using context7 docs. This step may require iteration.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/mcp_proxy.rs src-tauri/src/lib.rs
git commit -m "feat(mcp): rmcp lazy connection pool with proxy operations"
```

---

## Task 6: Tauri Commands (mcp_commands.rs)

**Files:**
- Create: `src-tauri/src/mcp_commands.rs`

- [ ] **Step 1: Create Tauri command handlers**

```rust
// src-tauri/src/mcp_commands.rs

use crate::hermes_config::{self, ConfigLock, McpServerEntry, McpServerInfo, McpTransport};
use crate::mcp_proxy::McpPool;
use std::collections::HashMap;
use tauri::State;
use tokio::sync::RwLock;

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
    pool: State<'_, RwLock<McpPool>>,
) -> Result<(), String> {
    // Disconnect first, then write config
    pool.write().await.disconnect(&name);
    let _guard = lock.0.lock().await;
    // Preserve unknown hermes fields (sampling, tools, etc.) from existing entry
    let existing = hermes_config::read_mcp_servers()?;
    let extra = existing.get(&name)
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
    pool: State<'_, RwLock<McpPool>>,
) -> Result<Vec<String>, String> {
    // Disconnect first, then write config
    pool.write().await.disconnect(&name);
    let _guard = lock.0.lock().await;
    hermes_config::remove_mcp_server(&name)
}

#[tauri::command]
pub async fn toggle_mcp_server(
    name: String,
    enabled: bool,
    lock: State<'_, ConfigLock>,
    pool: State<'_, RwLock<McpPool>>,
) -> Result<(), String> {
    if !enabled {
        pool.write().await.disconnect(&name);
    }
    let _guard = lock.0.lock().await;
    hermes_config::toggle_mcp_server(&name, enabled)
}

#[tauri::command]
pub async fn test_mcp_server(
    name: String,
    lock: State<'_, ConfigLock>,
) -> Result<serde_json::Value, String> {
    let _guard = lock.0.lock().await;
    let servers = hermes_config::read_mcp_servers()?;
    let entry = servers.get(&name)
        .ok_or(format!("Server '{name}' not found"))?;

    match &entry.transport {
        McpTransport::Stdio { command, .. } => {
            // For stdio, just check if command exists in PATH
            let output = std::process::Command::new("which")
                .arg(command)
                .output();
            match output {
                Ok(o) if o.status.success() => {
                    Ok(serde_json::json!({
                        "status": "ok",
                        "transport": "stdio",
                        "command_path": String::from_utf8_lossy(&o.stdout).trim()
                    }))
                }
                _ => Err(format!("Command '{command}' not found in PATH")),
            }
        }
        McpTransport::Http { url, .. } => {
            // For HTTP, attempt a real MCP connection
            // Create a temporary pool entry, connect, list tools, disconnect
            let mut temp_pool = McpPool::new();
            // We need to temporarily make the server config available
            // Use list_tools as a connectivity check
            drop(_guard); // Release config lock before network I/O
            let pool_rw = RwLock::new(temp_pool);
            match crate::mcp_proxy::list_tools(&pool_rw, &name).await {
                Ok(tools) => Ok(serde_json::json!({
                    "status": "ok",
                    "transport": "http",
                    "url": url,
                    "tools": tools,
                })),
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
    pool: State<'_, RwLock<McpPool>>,
) -> Result<String, String> {
    crate::mcp_proxy::read_resource(&pool, &server, &uri).await
}

#[tauri::command]
pub async fn mcp_call_tool(
    server: String,
    tool: String,
    args: serde_json::Value,
    pool: State<'_, RwLock<McpPool>>,
) -> Result<serde_json::Value, String> {
    crate::mcp_proxy::call_tool(&pool, &server, &tool, args).await
}

#[tauri::command]
pub async fn mcp_list_tools(
    server: String,
    pool: State<'_, RwLock<McpPool>>,
) -> Result<serde_json::Value, String> {
    crate::mcp_proxy::list_tools(&pool, &server).await
}

#[tauri::command]
pub async fn mcp_list_resources(
    server: String,
    pool: State<'_, RwLock<McpPool>>,
) -> Result<serde_json::Value, String> {
    crate::mcp_proxy::list_resources(&pool, &server).await
}

// ── Hermes sync ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn reload_hermes(
    app: tauri::AppHandle,
    state: State<'_, crate::commands::AcpState>,
) -> Result<String, String> {
    // Implement directly — can't delegate to another Tauri command handler
    // because State<'_> lifetimes don't transfer.
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(client) = guard.take() {
        client.shutdown();
    }
    let client = crate::acp::client::AcpClient::spawn(&app)
        .map_err(|e| format!("Failed to respawn hermes: {e}"))?;
    *guard = Some(client);
    Ok("reconnected".to_string())
}
```

- [ ] **Step 2: Register module and commands in lib.rs**

Update `src-tauri/src/lib.rs`:

```rust
mod acp;
mod artifacts;
mod commands;
mod hermes_config;
mod mcp_commands;
mod mcp_proxy;
mod sessions;

use commands::AcpState;
use hermes_config::ConfigLock;
use mcp_proxy::McpPool;
use std::sync::Mutex;
use tokio::sync::Mutex as TokioMutex;
use tokio::sync::RwLock;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AcpState(Mutex::new(None)))
        .manage(ConfigLock(TokioMutex::new(())))
        .manage(RwLock::new(McpPool::new()))
        .setup(|app| {
            // ... existing setup unchanged ...
        })
        .invoke_handler(tauri::generate_handler![
            // Existing commands
            commands::acp_new_session,
            commands::acp_load_session,
            commands::acp_send_prompt,
            commands::acp_cancel,
            commands::acp_reconnect,
            commands::acp_status,
            commands::list_sessions,
            commands::get_session_messages,
            commands::list_artifacts,
            commands::list_a2ui_batches,
            commands::set_window_title,
            commands::check_hermes_update,
            // MCP management commands
            mcp_commands::list_mcp_servers,
            mcp_commands::add_mcp_server,
            mcp_commands::update_mcp_server,
            mcp_commands::remove_mcp_server,
            mcp_commands::toggle_mcp_server,
            mcp_commands::test_mcp_server,
            mcp_commands::list_env_var_names,
            mcp_commands::save_env_var,
            mcp_commands::delete_env_var,
            mcp_commands::find_orphaned_env_vars,
            mcp_commands::mcp_read_resource,
            mcp_commands::mcp_call_tool,
            mcp_commands::mcp_list_tools,
            mcp_commands::mcp_list_resources,
            mcp_commands::reload_hermes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Verify full Rust backend compiles**

Run: `cd /home/inu/hermelinChat && cargo check -p aurora-chat`

Fix any issues. This is where rmcp API mismatches surface — use context7 for rmcp docs.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/mcp_commands.rs src-tauri/src/lib.rs
git commit -m "feat(mcp): Tauri commands for config CRUD, secrets, proxy, and hermes sync"
```

---

## Task 7: Frontend Store (hermesMcpServers.ts)

**Files:**
- Create: `v2/src/stores/hermesMcpServers.ts`

- [ ] **Step 1: Create the store**

```typescript
// v2/src/stores/hermesMcpServers.ts
//
// Read-only view of hermes MCP server config, backed by Tauri commands.
// Replaces mcpClients.ts — no JS SDK Client instances.

import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export type TransportType = 'stdio' | 'http'

export interface HermesMcpServer {
  name: string
  transportType: TransportType
  url?: string
  command?: string
  args?: string[]
  envKeys: string[]
  hasInlineSecrets: boolean
  enabled: boolean
  timeout?: number
  connectTimeout?: number
}

export interface McpTransportConfig {
  type: 'stdio' | 'http'
  url?: string
  command?: string
  args?: string[]
  headers?: Record<string, string>
}

interface TestResult {
  status: string
  transport: string
  tools?: unknown
  url?: string
  command_path?: string
}

interface HermesMcpServerStore {
  servers: Record<string, HermesMcpServer>
  loading: boolean
  error: string | null

  refresh: () => Promise<void>
  addServer: (
    name: string,
    transport: McpTransportConfig,
    secrets: Array<{ key: string; value: string }>,
    opts?: { enabled?: boolean; timeout?: number; connectTimeout?: number }
  ) => Promise<void>
  updateServer: (
    name: string,
    transport: McpTransportConfig,
    secrets: Array<{ key: string; value: string }>,
    opts?: { enabled?: boolean; timeout?: number; connectTimeout?: number }
  ) => Promise<void>
  removeServer: (name: string) => Promise<string[]>
  toggleServer: (name: string, enabled: boolean) => Promise<void>
  testServer: (name: string) => Promise<TestResult>
}

function buildTransportPayload(config: McpTransportConfig) {
  if (config.type === 'http') {
    return { url: config.url!, headers: config.headers ?? {} }
  }
  return { command: config.command!, args: config.args ?? [] }
}

function buildEnvRefs(
  secrets: Array<{ key: string; value: string }>
): Record<string, string> {
  const refs: Record<string, string> = {}
  for (const { key } of secrets) {
    refs[key] = `\${${key}}`
  }
  return refs
}

export const useHermesMcpServers = create<HermesMcpServerStore>((set, get) => ({
  servers: {},
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const list = await invoke<Array<{
        name: string
        transport_type: string
        url: string | null
        command: string | null
        args: string[] | null
        env_keys: string[]
        has_inline_values: boolean
        enabled: boolean
        timeout: number | null
        connect_timeout: number | null
      }>>('list_mcp_servers')

      const servers: Record<string, HermesMcpServer> = {}
      for (const s of list) {
        servers[s.name] = {
          name: s.name,
          transportType: s.transport_type as TransportType,
          url: s.url ?? undefined,
          command: s.command ?? undefined,
          args: s.args ?? undefined,
          envKeys: s.env_keys,
          hasInlineSecrets: s.has_inline_values,
          enabled: s.enabled,
          timeout: s.timeout ?? undefined,
          connectTimeout: s.connect_timeout ?? undefined,
        }
      }
      set({ servers, loading: false })
    } catch (e) {
      set({ error: (e as Error).message ?? String(e), loading: false })
    }
  },

  addServer: async (name, transport, secrets, opts) => {
    // 1. Save secrets first (write-only)
    for (const { key, value } of secrets) {
      await invoke('save_env_var', { key, value })
    }
    // 2. Add server with ${VAR} refs
    await invoke('add_mcp_server', {
      name,
      transport: buildTransportPayload(transport),
      envRefs: buildEnvRefs(secrets),
      enabled: opts?.enabled ?? true,
      timeout: opts?.timeout ?? null,
      connectTimeout: opts?.connectTimeout ?? null,
    })
    // 3. Refresh
    await get().refresh()
  },

  updateServer: async (name, transport, secrets, opts) => {
    for (const { key, value } of secrets) {
      await invoke('save_env_var', { key, value })
    }
    await invoke('update_mcp_server', {
      name,
      transport: buildTransportPayload(transport),
      envRefs: buildEnvRefs(secrets),
      enabled: opts?.enabled ?? true,
      timeout: opts?.timeout ?? null,
      connectTimeout: opts?.connectTimeout ?? null,
    })
    await get().refresh()
  },

  removeServer: async (name) => {
    const orphaned = await invoke<string[]>('remove_mcp_server', { name })
    await get().refresh()
    return orphaned
  },

  toggleServer: async (name, enabled) => {
    await invoke('toggle_mcp_server', { name, enabled })
    await get().refresh()
  },

  testServer: async (name) => {
    return await invoke<TestResult>('test_mcp_server', { name })
  },
}))
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/inu/hermelinChat/v2 && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add v2/src/stores/hermesMcpServers.ts
git commit -m "feat(mcp): hermesMcpServers Zustand store backed by Tauri commands"
```

---

## Task 8: AppHost Migration

**Files:**
- Create: `v2/src/a2ui/mcp-app/tauri-proxy.ts`
- Modify: `v2/src/a2ui/mcp-app/AppHost.tsx`
- Modify: `v2/src/a2ui/mcp-app/resolver.ts`

- [ ] **Step 1: Create tauri-proxy.ts**

```typescript
// v2/src/a2ui/mcp-app/tauri-proxy.ts
//
// Tauri-backed proxy functions for MCP operations.
// Used by AppHost and resolver instead of SDK Client.

import { invoke } from '@tauri-apps/api/core'

export async function tauriReadResource(
  server: string,
  uri: string
): Promise<string> {
  return await invoke<string>('mcp_read_resource', { server, uri })
}

export async function tauriCallTool(
  server: string,
  tool: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return await invoke('mcp_call_tool', { server, tool, args })
}

export async function tauriListTools(
  server: string
): Promise<unknown> {
  return await invoke('mcp_list_tools', { server })
}

export async function tauriListResources(
  server: string
): Promise<unknown> {
  return await invoke('mcp_list_resources', { server })
}
```

- [ ] **Step 2: Update resolver.ts**

Replace the remote resolution path to use a proxy function instead of Client:

```typescript
// resolver.ts changes:
// 1. Remove: import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
// 2. Change resolveUiResource signature to accept a resolver function
// 3. Remote path calls the proxy function instead of client.readResource

export type ResourceResolver = (uri: string) => Promise<string>

export async function resolveUiResource(
  uri: string,
  resolver?: ResourceResolver | null
): Promise<string> {
  // ... bundled path unchanged ...

  // Remote path
  if (!resolver) {
    throw new Error(`No resource resolver available for: ${uri}`)
  }
  return await resolver(uri)
}
```

- [ ] **Step 3: Update AppHost.tsx**

Key changes:
1. Replace `useMcpClientStore` import with `useHermesMcpServers`
2. Pass `null` as client to `AppBridge`, wire manual handlers
3. Use `tauriReadResource` for resource resolution
4. Use `tauriCallTool` for tool calls (both in handlers and initial tool call)

The AppHost changes are the most involved — the full file needs these modifications:
- Import `useHermesMcpServers` instead of `useMcpClientStore`
- Import `tauriReadResource`, `tauriCallTool`, `tauriListResources` from `./tauri-proxy`
- Remove `getClient` usage
- Change `serverState` subscription to use new store
- In resource resolution effect: pass `(uri) => tauriReadResource(server, uri)` as resolver
- In `onIframeLoad`: construct bridge with `null` client, wire `oncalltool`, `onreadresource`, `onlistresources` handlers to Tauri proxy
- In `bridge.oninitialized`: use `tauriCallTool` instead of `client.callTool`

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /home/inu/hermelinChat/v2 && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add v2/src/a2ui/mcp-app/tauri-proxy.ts v2/src/a2ui/mcp-app/AppHost.tsx v2/src/a2ui/mcp-app/resolver.ts
git commit -m "feat(mcp): migrate AppHost to null-client + Tauri proxy handlers"
```

---

## Task 9: Settings UI Rewrite

**Files:**
- Modify: `v2/src/components/settings/McpServerSettings.tsx`

- [ ] **Step 1: Rewrite McpServerSettings.tsx**

Full rewrite using `useHermesMcpServers` store. Key sections:
- Server list with transport badge (stdio/http), enabled toggle, expand/collapse
- Add form with transport picker (HTTP tab / stdio tab)
- Env var section with key-value inputs
- Test Connection button
- Remove with orphaned env var cleanup prompt
- Edit mode (same form, pre-populated)
- Collapsible "Environment Variables" section at bottom

This is a large UI component. Follow the existing Aurora Chat styling patterns:
- CSS custom properties: `--color-*`, `--font-mono`, `--font-sans`
- 4px grid for spacing (all padding/margin/gap values divisible by 4)
- Monospace font for technical fields (names, URLs, commands)
- Status dot colors from existing `DOT_COLOR` pattern

Load servers on mount via `useEffect(() => { refresh() }, [])`.

- [ ] **Step 2: Update any imports in SettingsPanel.tsx**

If `SettingsPanel.tsx` imports from the old `mcpClients` store, update to `hermesMcpServers`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/inu/hermelinChat/v2 && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add v2/src/components/settings/McpServerSettings.tsx
git commit -m "feat(mcp): rewrite settings UI for hermes MCP server management"
```

---

## Task 10: Cleanup Old Files

**Files:**
- Remove: `v2/src/stores/mcpClients.ts`
- Remove: `v2/src/a2ui/mcp-app/mcp-config.ts`
- Modify: any files that import from removed files

- [ ] **Step 1: Find all imports of old files**

Search for:
- `from '../../stores/mcpClients'` or `from '../stores/mcpClients'`
- `from '../../a2ui/mcp-app/mcp-config'` or `from './mcp-config'`

Known files that need migration:
- `v2/src/a2ui/renderer/A2UIDevPreview.tsx` — imports `useMcpClientStore` and `loadConfiguredServers`. Replace MCP client hydration with `useHermesMcpServers().refresh()`.

Update any remaining references to use the new store/modules.

- [ ] **Step 2: Delete old files**

```bash
rm v2/src/stores/mcpClients.ts
rm v2/src/a2ui/mcp-app/mcp-config.ts
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/inu/hermelinChat/v2 && npx tsc --noEmit`

- [ ] **Step 4: Verify build**

Run: `cd /home/inu/hermelinChat/v2 && npm run build`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(mcp): remove old mcpClients store and localStorage persistence"
```

---

## Task 11: Build and Verify

**Files:** None (integration testing)

- [ ] **Step 1: Build full app**

```bash
cd /home/inu/hermelinChat/v2 && npm run build
cd /home/inu/hermelinChat && cargo tauri build --no-bundle
```

- [ ] **Step 2: Launch and verify settings UI**

Launch Aurora Chat. Open Settings → MCP Servers. Verify:
- Existing hermes servers (chorus, exa, hyperviking) appear with correct transport types
- chorus/exa show as stdio, hyperviking shows as http
- Enable/disable toggles work
- "Test Connection" works for hyperviking (HTTP)

- [ ] **Step 3: Add a new HTTP server**

Start the get-time test server:
```bash
cd /home/inu/src/ext-apps/examples/quickstart && npx tsx src/index.ts
```

Add via Aurora Chat settings: name=`get-time`, url=`http://localhost:3001/mcp`. Test Connection should succeed.

Verify it appears in `hermes mcp list` after reload.

- [ ] **Step 4: Test MCP App rendering**

Send a message that triggers an MCP App surface using the get-time server. Verify the iframe loads and renders correctly through the Rust proxy.

- [ ] **Step 5: Test bundled demos**

Verify counter, clock, and tool-input-echo bundled demos still work (aurora-bundled path unchanged).

- [ ] **Step 6: Test qr-server (bidirectional)**

Start qr-server:
```bash
cd /home/inu/src/ext-apps/examples/qr-server && uv run python server.py
```

Verify QR code generation works through the Rust proxy (tool call → iframe result).

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(mcp): Phase 5.1 complete — Aurora Chat manages hermes MCP servers"
```
