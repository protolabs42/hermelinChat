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
