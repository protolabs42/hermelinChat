// src-tauri/src/hermes_config.rs
//
// Reads/writes ~/.hermes/config.yaml (mcp_servers section) and ~/.hermes/.env.
// All config file operations are serialized via ConfigLock.

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write as _;
use std::path::PathBuf;
use std::sync::LazyLock;
use tokio::sync::Mutex as TokioMutex;

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

// ── Helpers ───────────────────────────────────────────────────────────

/// Extract the variable name from a `${VAR_NAME}` reference string.
/// Returns `Some("VAR_NAME")` for `"${VAR_NAME}"`, `None` otherwise.
pub fn extract_env_ref(value: &str) -> Option<String> {
    if value.starts_with("${") && value.ends_with('}') {
        let inner = &value[2..value.len() - 1];
        if !inner.is_empty() {
            return Some(inner.to_string());
        }
    }
    None
}

fn is_sensitive_header_name(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "authorization" | "proxy-authorization" | "x-api-key" | "api-key" | "x-auth-token"
    )
}

fn redact_header_value(_name: &str, value: &str) -> String {
    if extract_env_ref(value).is_some() {
        value.to_string()
    } else {
        "[REDACTED_INLINE_SECRET]".to_string()
    }
}

fn validate_env_value(value: &str) -> Result<(), String> {
    if value.chars().any(|ch| matches!(ch, '\n' | '\r' | '\u{2028}' | '\u{2029}' | '\0')) {
        return Err("Env var values cannot contain line breaks or NUL bytes".to_string());
    }
    Ok(())
}

pub fn env_file_map() -> Result<HashMap<String, String>, String> {
    let path = env_path();
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read .env: {e}"))?;
    Ok(content
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                return None;
            }
            let (key, value) = trimmed.split_once('=')?;
            Some((key.trim().to_string(), value.to_string()))
        })
        .collect())
}

pub fn resolve_env_reference(value: &str, env_map: &HashMap<String, String>) -> String {
    extract_env_ref(value)
        .and_then(|key| env_map.get(&key).cloned().or_else(|| std::env::var(&key).ok()))
        .unwrap_or_else(|| value.to_string())
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
                "http".into(),
                Some(url.clone()),
                None,
                None,
                if headers.is_empty() {
                    None
                } else {
                    Some(headers
                        .iter()
                        .map(|(key, value)| (key.clone(), redact_header_value(key, value)))
                        .collect())
                },
            ),
            McpTransport::Stdio { command, args } => {
                ("stdio".into(), None, Some(command.clone()), Some(args.clone()), None)
            }
        };
        let has_inline_values = entry.env.values().any(|v| !v.starts_with("${"))
            || matches!(&entry.transport, McpTransport::Http { headers, .. } if headers.values().any(|value| extract_env_ref(value).is_none()));
        let mut env_keys: Vec<String> = entry.env.keys().cloned().collect();
        if let McpTransport::Http { headers, .. } = &entry.transport {
            for v in headers.values() {
                if let Some(var) = extract_env_ref(v) {
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

// ── Config Lock ───────────────────────────────────────────────────────

/// Serialized access to config files. Managed by Tauri state.
pub struct ConfigLock(pub TokioMutex<()>);

// ── Config Read/Write ─────────────────────────────────────────────────

/// Read mcp_servers section from config.yaml.
/// Returns empty map if file does not exist or mcp_servers key is absent.
pub fn read_mcp_servers() -> Result<HashMap<String, McpServerEntry>, String> {
    let path = config_path();
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    let root: serde_yaml::Value = serde_yaml::from_str(&content)
        .map_err(|e| format!("Invalid YAML: {e}"))?;
    match root.get("mcp_servers") {
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

    let yaml = serde_yaml::to_string(&root)
        .map_err(|e| format!("Failed to serialize YAML: {e}"))?;
    atomic_write(&path, yaml.as_bytes())
}

/// Atomic write: write to temp file in same directory, then rename.
/// Sets file permissions to 0600 on Unix.
fn atomic_write(path: &PathBuf, data: &[u8]) -> Result<(), String> {
    let dir = path.parent().ok_or("No parent directory")?;
    // Ensure directory exists
    std::fs::create_dir_all(dir)
        .map_err(|e| format!("Failed to create directory {}: {e}", dir.display()))?;
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
    let entry = servers
        .get_mut(name)
        .ok_or_else(|| format!("Server '{name}' not found in config"))?;
    entry.enabled = enabled;
    write_mcp_servers(&servers)
}

// ── .env Management ───────────────────────────────────────────────────

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
    if value.contains('\n') || value.contains('\r') {
        return Err("Env var values cannot contain newlines".to_string());
    }
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
/// Scans both env: values and headers: values.
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
        // Check headers: values for ${VAR} refs
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

/// Find orphaned env vars against current config.
pub fn find_orphaned_env_vars() -> Result<Vec<String>, String> {
    let servers = read_mcp_servers()?;
    find_orphaned_env_vars_in(&servers)
}

// ── Tests ─────────────────────────────────────────────────────────────

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

    // ── Task 3: Config Read/Write Tests ───────────────────────────────

    #[test]
    fn read_servers_from_parsed_yaml() {
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
        assert!(servers.contains_key("test-a"));
        assert!(servers.contains_key("test-b"));
    }

    #[test]
    fn upsert_and_read_round_trip() {
        let dir = tempfile::TempDir::new().unwrap();
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

        // Parse mcp_servers from the written file
        let read_content = std::fs::read_to_string(&config).unwrap();
        let root: serde_yaml::Value = serde_yaml::from_str(&read_content).unwrap();
        let sv = root.get("mcp_servers").unwrap();
        let mut servers: HashMap<String, McpServerEntry> =
            serde_yaml::from_value(sv.clone()).unwrap();

        // Add a new server
        servers.insert(
            "new-server".into(),
            McpServerEntry {
                transport: McpTransport::Http {
                    url: "http://localhost:4000".into(),
                    headers: HashMap::new(),
                },
                env: HashMap::new(),
                enabled: true,
                timeout: None,
                connect_timeout: None,
                extra: HashMap::new(),
            },
        );

        assert_eq!(servers.len(), 3);
        assert!(servers.contains_key("new-server"));

        // Write back and check non-mcp sections preserved
        let servers_value = serde_yaml::to_value(&servers).unwrap();
        let mut root2 = root.clone();
        root2
            .as_mapping_mut()
            .unwrap()
            .insert(
                serde_yaml::Value::String("mcp_servers".into()),
                servers_value,
            );
        let yaml_out = serde_yaml::to_string(&root2).unwrap();
        assert!(yaml_out.contains("catppuccin-frappe"), "display section should be preserved");
        assert!(yaml_out.contains("openai-codex"), "model section should be preserved");
        assert!(yaml_out.contains("new-server"), "new server should be present");
    }

    #[test]
    fn atomic_write_round_trip() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("test.yaml");
        let data = b"hello: world\n";
        atomic_write(&path, data).unwrap();
        let read_back = std::fs::read(&path).unwrap();
        assert_eq!(read_back, data);
    }

    // ── Task 4: .env Tests ────────────────────────────────────────────

    #[test]
    fn parse_env_keys_works() {
        let content = "API_KEY=secret123\n# comment\nOTHER_VAR=value\n\nBAD_LINE_NO_EQUALS\n";
        let keys = parse_env_keys(content);
        // BAD_LINE_NO_EQUALS has no '=' so split_once returns None — filtered out
        assert_eq!(keys, vec!["API_KEY", "OTHER_VAR"]);
    }

    #[test]
    fn parse_env_keys_blank_and_comments() {
        let content = "\n# This is a comment\n\nFOO=bar\n  # indented comment\nBAZ=qux\n";
        let keys = parse_env_keys(content);
        assert_eq!(keys, vec!["FOO", "BAZ"]);
    }

    #[test]
    fn extract_env_ref_works() {
        assert_eq!(extract_env_ref("${MY_KEY}"), Some("MY_KEY".into()));
        assert_eq!(extract_env_ref("plain_value"), None);
        assert_eq!(extract_env_ref("${PARTIAL"), None);
        assert_eq!(extract_env_ref("${}"), None); // empty inner
        assert_eq!(extract_env_ref("${CHORUS_API_KEY}"), Some("CHORUS_API_KEY".into()));
    }

    #[test]
    fn save_and_list_env_vars() {
        let dir = tempfile::TempDir::new().unwrap();
        // Override env_path by writing directly via atomic_write
        let path = dir.path().join(".env");
        // Write initial content
        atomic_write(&path, b"EXISTING_KEY=value\n").unwrap();

        // Simulate upsert logic
        let content = std::fs::read_to_string(&path).unwrap();
        let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
        let key = "NEW_KEY";
        let new_line = format!("{key}=newsecret");
        let prefix = format!("{key}=");
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
        let out = lines.join("\n") + "\n";
        atomic_write(&path, out.as_bytes()).unwrap();

        let keys = parse_env_keys(&std::fs::read_to_string(&path).unwrap());
        assert!(keys.contains(&"EXISTING_KEY".to_string()));
        assert!(keys.contains(&"NEW_KEY".to_string()));
        // Values must NOT be returned by parse_env_keys
        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(raw.contains("newsecret"), "value stored in file");
        let returned_by_parse: Vec<_> = keys.iter().map(|s| s.as_str()).collect();
        assert!(!returned_by_parse.contains(&"newsecret"), "value not returned as key");
    }

    #[test]
    fn find_orphaned_env_vars_logic() {
        // Build a servers map referencing some vars
        let mut env = HashMap::new();
        env.insert("MY_ENV".into(), "${CHORUS_API_KEY}".into());
        let mut headers = HashMap::new();
        headers.insert("Authorization".into(), "${BEARER_TOKEN}".into());

        let servers: HashMap<String, McpServerEntry> = [
            (
                "chorus".into(),
                McpServerEntry {
                    transport: McpTransport::Stdio {
                        command: "bun".into(),
                        args: vec![],
                    },
                    env,
                    enabled: true,
                    timeout: None,
                    connect_timeout: None,
                    extra: HashMap::new(),
                },
            ),
            (
                "http-server".into(),
                McpServerEntry {
                    transport: McpTransport::Http {
                        url: "http://localhost:9000".into(),
                        headers,
                    },
                    env: HashMap::new(),
                    enabled: true,
                    timeout: None,
                    connect_timeout: None,
                    extra: HashMap::new(),
                },
            ),
        ]
        .into_iter()
        .collect();

        // All vars referenced by at least one server
        let mut referenced: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        for entry in servers.values() {
            for v in entry.env.values() {
                if let Some(var) = extract_env_ref(v) {
                    referenced.insert(var);
                }
            }
            if let McpTransport::Http { headers, .. } = &entry.transport {
                for v in headers.values() {
                    if let Some(var) = extract_env_ref(v) {
                        referenced.insert(var);
                    }
                }
            }
        }
        assert!(referenced.contains("CHORUS_API_KEY"));
        assert!(referenced.contains("BEARER_TOKEN"));

        // An env key not referenced by any server
        let all_env_keys = vec![
            "CHORUS_API_KEY".to_string(),
            "BEARER_TOKEN".to_string(),
            "ORPHAN_VAR".to_string(),
        ];
        let orphans: Vec<_> = all_env_keys
            .into_iter()
            .filter(|k| !referenced.contains(k))
            .collect();
        assert_eq!(orphans, vec!["ORPHAN_VAR".to_string()]);
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
