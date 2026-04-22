use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

use crate::acp::client::AcpClient;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct ProjectWorkIssue {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: Option<i64>,
    pub issue_type: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub struct ProjectWorkContext {
    pub repo_path: String,
    pub has_bd: bool,
    pub in_progress_issues: Vec<ProjectWorkIssue>,
    pub ready_issues: Vec<ProjectWorkIssue>,
    pub dark_factory_notes: Option<String>,
    pub dark_factory_path: Option<String>,
    pub error: Option<String>,
}

fn read_dark_factory_notes(repo_path: &str) -> (Option<String>, Option<String>) {
    let candidates = [
        PathBuf::from(repo_path)
            .join(".dark-factory")
            .join("notes.md"),
        PathBuf::from(format!("{repo_path}-dark-factory"))
            .join(".dark-factory")
            .join("notes.md"),
    ];

    for candidate in candidates {
        if candidate.exists() {
            if let Ok(content) = std::fs::read_to_string(&candidate) {
                return (Some(content), Some(candidate.display().to_string()));
            }
        }
    }

    (None, None)
}

fn run_bd_json(repo_path: &str, args: &[&str]) -> Result<Vec<ProjectWorkIssue>, String> {
    let output = std::process::Command::new("bd")
        .current_dir(repo_path)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run bd {}: {e}", args.join(" ")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("bd {} exited with status {}", args.join(" "), output.status)
        } else {
            stderr
        });
    }

    serde_json::from_slice::<Vec<ProjectWorkIssue>>(&output.stdout)
        .map_err(|e| format!("Failed to parse bd {} JSON: {e}", args.join(" ")))
}

pub struct AcpState(pub Mutex<Option<AcpClient>>);

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AcpHealth {
    pub status: String,
    pub message: Option<String>,
}

impl Default for AcpHealth {
    fn default() -> Self {
        Self {
            status: "connecting".to_string(),
            message: None,
        }
    }
}

pub struct AcpHealthState(pub Arc<Mutex<AcpHealth>>);

fn require_acp_connected(health: &AcpHealthState) -> Result<(), String> {
    let guard = health.0.lock().map_err(|e| e.to_string())?;
    if guard.status == "connected" || guard.status == "ready" {
        Ok(())
    } else {
        Err(guard
            .message
            .clone()
            .unwrap_or_else(|| format!("ACP is not connected (status: {})", guard.status)))
    }
}

#[tauri::command]
pub fn acp_new_session(
    state: State<'_, AcpState>,
    health: State<'_, AcpHealthState>,
    cwd: Option<String>,
) -> Result<String, String> {
    require_acp_connected(&health)?;
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let client = guard.as_ref().ok_or("ACP client not initialized")?;
    client.new_session(cwd.as_deref())?;
    Ok("session/new sent".to_string())
}

#[tauri::command]
pub fn acp_load_session(
    state: State<'_, AcpState>,
    health: State<'_, AcpHealthState>,
    session_id: String,
    cwd: Option<String>,
) -> Result<String, String> {
    require_acp_connected(&health)?;
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let client = guard.as_ref().ok_or("ACP client not initialized")?;
    client.load_session(&session_id, cwd.as_deref())?;
    Ok("session/load sent".to_string())
}

#[tauri::command]
pub fn acp_send_prompt(
    state: State<'_, AcpState>,
    health: State<'_, AcpHealthState>,
    session_id: String,
    text: String,
) -> Result<String, String> {
    require_acp_connected(&health)?;
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let client = guard.as_ref().ok_or("ACP client not initialized")?;
    client.send_prompt(&session_id, &text)?;
    Ok("prompt sent".to_string())
}

#[tauri::command]
pub fn acp_cancel(
    state: State<'_, AcpState>,
    health: State<'_, AcpHealthState>,
    session_id: String,
) -> Result<String, String> {
    require_acp_connected(&health)?;
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let client = guard.as_ref().ok_or("ACP client not initialized")?;
    client.cancel(&session_id)?;
    Ok("cancel sent".to_string())
}

#[tauri::command]
pub fn acp_reconnect(
    app: tauri::AppHandle,
    state: State<'_, AcpState>,
    health: State<'_, AcpHealthState>,
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

    let client = crate::acp::client::AcpClient::spawn(&app, health.0.clone())?;
    *guard = Some(client);

    Ok("reconnected".to_string())
}

#[tauri::command]
pub fn acp_status(state: State<'_, AcpHealthState>) -> String {
    let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    if guard.status == "ready" {
        "connected".to_string()
    } else {
        guard.status.clone()
    }
}

#[tauri::command]
pub fn acp_respond_permission(
    state: State<'_, AcpState>,
    health: State<'_, AcpHealthState>,
    request_id: String,
    option_id: Option<String>,
) -> Result<String, String> {
    require_acp_connected(&health)?;
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let client = guard.as_ref().ok_or("ACP client not initialized")?;
    let response = if let Some(option_id) = option_id {
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": serde_json::Value::String(request_id),
            "result": {
                "outcome": {
                    "outcome": "selected",
                    "optionId": option_id,
                }
            }
        })
    } else {
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": serde_json::Value::String(request_id),
            "result": {
                "outcome": {
                    "outcome": "cancelled"
                }
            }
        })
    };
    client.send(&response.to_string())?;
    Ok("permission response sent".to_string())
}

#[tauri::command]
pub fn list_sessions(limit: Option<usize>) -> Result<Vec<crate::sessions::SessionSummary>, String> {
    crate::sessions::list_sessions(limit.unwrap_or(30))
}

#[tauri::command]
pub fn get_session_messages(
    session_id: String,
    limit: Option<usize>,
) -> Result<Vec<crate::sessions::SessionMessage>, String> {
    crate::sessions::get_session_messages(&session_id, limit.unwrap_or(200))
}

#[tauri::command]
pub fn list_artifacts(session_id: Option<String>) -> Vec<crate::artifacts::Artifact> {
    crate::artifacts::list_current_artifacts_for_session(session_id.as_deref())
}

#[tauri::command]
pub fn get_project_work_context(path: String) -> Result<ProjectWorkContext, String> {
    if !Path::new(&path).exists() {
        return Err(format!("Project path does not exist: {path}"));
    }

    let (dark_factory_notes, dark_factory_path) = read_dark_factory_notes(&path);

    let in_progress_result = run_bd_json(&path, &["list", "--json"]);
    let ready_result = run_bd_json(&path, &["ready", "--json"]);

    let has_bd = in_progress_result.is_ok() || ready_result.is_ok();

    let in_progress_issues = in_progress_result
        .as_ref()
        .map(|issues| {
            issues
                .iter()
                .filter(|issue| issue.status == "in_progress")
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let ready_issues = ready_result.clone().unwrap_or_default();

    let error = if has_bd {
        in_progress_result.err().or(ready_result.err())
    } else {
        Some("bd is unavailable for this project context".to_string())
    };

    Ok(ProjectWorkContext {
        repo_path: path,
        has_bd,
        in_progress_issues,
        ready_issues,
        dark_factory_notes,
        dark_factory_path,
        error,
    })
}

#[tauri::command]
pub fn list_a2ui_batches() -> Vec<crate::artifacts::SurfaceBatch> {
    crate::artifacts::list_current_a2ui_batches()
}

#[derive(serde::Deserialize)]
pub struct EmitLocalA2uiBatchRequest {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub messages: Vec<serde_json::Value>,
}

#[tauri::command]
pub fn emit_local_a2ui_batch(
    app: AppHandle,
    request: EmitLocalA2uiBatchRequest,
) -> Result<crate::artifacts::SurfaceBatch, String> {
    let batch = crate::artifacts::emit_local_a2ui_batch(&request.session_id, request.messages)?;
    app.emit(
        "a2ui:event",
        crate::artifacts::A2UIEvent::Batch {
            batch: batch.clone(),
        },
    )
    .map_err(|e| e.to_string())?;
    Ok(batch)
}

#[derive(serde::Serialize)]
pub struct VersionInfo {
    pub current: Option<String>,
    pub latest: Option<String>,
    pub update_available: bool,
    pub commits_behind: Option<u32>,
    pub install_type: String,
    pub hermes_dir: Option<String>,
}

fn find_hermes_dir() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("HERMES_DIR") {
        let path = PathBuf::from(p);
        if path.exists() {
            return Some(path);
        }
    }
    let home = dirs::home_dir()?;
    let default = home.join(".hermes").join("hermes-agent");
    if default.exists() {
        Some(default)
    } else {
        None
    }
}

fn run_git(dir: &Path, args: &[&str]) -> Option<String> {
    std::process::Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok()
            } else {
                None
            }
        })
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn git_version_info(dir: &Path, version_fallback: Option<String>) -> VersionInfo {
    let _ = std::process::Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["fetch", "--quiet", "--tags"])
        .output();

    let current = run_git(dir, &["describe", "--tags", "--always"]).or(version_fallback);
    let latest = run_git(dir, &["describe", "--tags", "--abbrev=0", "origin/main"]);
    let commits_behind = run_git(dir, &["rev-list", "--count", "HEAD..origin/main"])
        .and_then(|s| s.parse::<u32>().ok());

    let update_available = commits_behind.map(|n| n > 0).unwrap_or(false);

    VersionInfo {
        current,
        latest,
        update_available,
        commits_behind,
        install_type: "git".to_string(),
        hermes_dir: Some(dir.display().to_string()),
    }
}

fn hermes_version_first_line(hermes_bin: &str) -> Option<String> {
    std::process::Command::new(hermes_bin)
        .arg("--version")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.lines().next().map(|l| l.trim().to_string()))
        .filter(|s| !s.is_empty())
}

fn pip_version_info(hermes_bin: &str) -> VersionInfo {
    let current = hermes_version_first_line(hermes_bin);

    let latest = std::process::Command::new("pip")
        .args(["index", "versions", "hermes-agent"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| {
            s.lines()
                .find(|l| l.contains("LATEST"))
                .and_then(|l| l.split_whitespace().last())
                .map(|v| v.to_string())
        });

    let update_available = match (&current, &latest) {
        (Some(c), Some(l)) => !c.contains(l.as_str()),
        _ => false,
    };

    VersionInfo {
        current,
        latest,
        update_available,
        commits_behind: None,
        install_type: "pip".to_string(),
        hermes_dir: None,
    }
}

#[tauri::command]
pub fn check_hermes_update() -> VersionInfo {
    let hermes_bin = std::env::var("HERMES_BIN").unwrap_or_else(|_| "hermes".to_string());
    check_hermes_update_inner(&hermes_bin)
}

#[derive(serde::Serialize)]
pub struct UpdateResult {
    pub success: bool,
    pub log: String,
    pub patches_reapplied: bool,
    pub new_version: Option<String>,
    pub new_commits_behind: Option<u32>,
    pub verified: bool,
}

fn verify_hermes_state(hermes_bin: &str) -> (Option<String>, Option<u32>, bool) {
    let info = check_hermes_update_inner(hermes_bin);
    let verified = match info.commits_behind {
        Some(n) => n == 0,
        None => !info.update_available,
    };
    (info.current, info.commits_behind, verified)
}

fn check_hermes_update_inner(hermes_bin: &str) -> VersionInfo {
    if let Some(dir) = find_hermes_dir() {
        if dir.join(".git").exists() {
            let fallback = hermes_version_first_line(hermes_bin);
            return git_version_info(&dir, fallback);
        }
    }
    pip_version_info(hermes_bin)
}

fn stream_command(app: &tauri::AppHandle, program: &str, args: &[&str], log: &mut String) -> bool {
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;
    use tauri::Emitter;

    let mut child = match std::process::Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("failed to spawn {program}: {e}\n");
            log.push_str(&msg);
            let _ = app.emit("hermes-update:log", &msg);
            return false;
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stderr_thread = stderr.map(|s| {
        let app = app.clone();
        std::thread::spawn(move || {
            let mut collected = String::new();
            for line in BufReader::new(s).lines().map_while(Result::ok) {
                let _ = app.emit("hermes-update:log", format!("{line}\n"));
                collected.push_str(&line);
                collected.push('\n');
            }
            collected
        })
    });

    if let Some(s) = stdout {
        for line in BufReader::new(s).lines().map_while(Result::ok) {
            let _ = app.emit("hermes-update:log", format!("{line}\n"));
            log.push_str(&line);
            log.push('\n');
        }
    }

    if let Some(t) = stderr_thread {
        if let Ok(err) = t.join() {
            log.push_str(&err);
        }
    }

    child.wait().map(|s| s.success()).unwrap_or(false)
}

#[tauri::command]
pub fn apply_hermes_update(app: tauri::AppHandle) -> UpdateResult {
    use tauri::Emitter;

    let hermes_bin = std::env::var("HERMES_BIN").unwrap_or_else(|_| "hermes".to_string());
    let mut log = String::new();

    let header = format!("==> {} update\n", hermes_bin);
    log.push_str(&header);
    let _ = app.emit("hermes-update:log", &header);

    let hermes_ok = stream_command(&app, &hermes_bin, &["update"], &mut log);

    if !hermes_ok {
        let (new_version, new_commits_behind, verified) = verify_hermes_state(&hermes_bin);
        return UpdateResult {
            success: false,
            log,
            patches_reapplied: false,
            new_version,
            new_commits_behind,
            verified,
        };
    }

    // Reapply hermelinChat patches (artifact_tool, a2ui_tool, toolsets, model_tools, session.py).
    // Script path resolved at compile time from the repo root; degrades gracefully if missing.
    let manifest = env!("CARGO_MANIFEST_DIR");
    let patch_script = Path::new(manifest)
        .parent()
        .map(|p| p.join("scripts").join("install_hermes_artifact_patch.py"));

    let (patches_reapplied, success) = match patch_script {
        Some(p) if p.exists() => {
            let header = format!("\n==> reapplying patches via {}\n", p.display());
            log.push_str(&header);
            let _ = app.emit("hermes-update:log", &header);
            let script_arg = p.to_string_lossy().to_string();
            let ok = stream_command(&app, "python3", &[&script_arg], &mut log);
            (ok, ok)
        }
        _ => {
            let msg = "\n⚠ patch script not found — patches NOT reapplied.\nRun `scripts/update.sh --skip-frontend --skip-python --no-pull` from the hermelinChat repo.\n";
            log.push_str(msg);
            let _ = app.emit("hermes-update:log", msg);
            (false, true)
        }
    };

    let header = "\n==> verifying post-update state\n";
    log.push_str(header);
    let _ = app.emit("hermes-update:log", header);
    let (new_version, new_commits_behind, verified) = verify_hermes_state(&hermes_bin);
    if let Some(ref v) = new_version {
        let line = format!("version: {}\n", v);
        log.push_str(&line);
        let _ = app.emit("hermes-update:log", &line);
    }
    if let Some(n) = new_commits_behind {
        let line = format!("commits behind origin/main: {}\n", n);
        log.push_str(&line);
        let _ = app.emit("hermes-update:log", &line);
    }
    let verdict = if verified {
        "✓ verified: at latest\n"
    } else {
        "⚠ still behind upstream\n"
    };
    log.push_str(verdict);
    let _ = app.emit("hermes-update:log", verdict);

    UpdateResult {
        success: success && verified,
        log,
        patches_reapplied,
        new_version,
        new_commits_behind,
        verified,
    }
}

#[derive(serde::Serialize)]
pub struct HermesToolsets {
    pub enabled: Vec<String>,
    pub model: Option<String>,
}

#[derive(serde::Serialize)]
pub struct HermesBannerHero {
    pub art: String,
    pub color: Option<String>,
    pub skin: Option<String>,
}

#[tauri::command]
pub fn get_hermes_banner_hero() -> HermesBannerHero {
    let Some(home) = dirs::home_dir() else {
        return HermesBannerHero {
            art: String::new(),
            color: None,
            skin: None,
        };
    };

    // Active skin from config.yaml → display.skin (default "hermelin")
    let config_path = home.join(".hermes").join("config.yaml");
    let active_skin: String = std::fs::read_to_string(&config_path)
        .ok()
        .and_then(|s| serde_yaml::from_str::<serde_yaml::Value>(&s).ok())
        .and_then(|v| {
            v.get("display")
                .and_then(|d| d.get("skin"))
                .and_then(|s| s.as_str())
                .map(String::from)
        })
        .unwrap_or_else(|| "hermelin".to_string());

    let skin_path = home
        .join(".hermes")
        .join("skins")
        .join(format!("{active_skin}.yaml"));
    let fallback_path = home.join(".hermes").join("skins").join("hermelin.yaml");

    let skin_yaml = std::fs::read_to_string(&skin_path)
        .or_else(|_| std::fs::read_to_string(&fallback_path))
        .ok()
        .and_then(|s| serde_yaml::from_str::<serde_yaml::Value>(&s).ok());

    let Some(yaml) = skin_yaml else {
        return HermesBannerHero {
            art: String::new(),
            color: None,
            skin: Some(active_skin),
        };
    };

    let raw = yaml
        .get("banner_hero")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Extract the first hex color we see inside [#rrggbb] or [bold #rrggbb] tags.
    let color = raw.split('[').find_map(|seg| {
        let (before_close, _) = seg.split_once(']')?;
        let hash_idx = before_close.find('#')?;
        let hex: String = before_close[hash_idx..]
            .chars()
            .take_while(|c| c.is_ascii_hexdigit() || *c == '#')
            .collect();
        if hex.len() == 7 {
            Some(hex)
        } else {
            None
        }
    });

    // Strip rich-format tags: [anything] and [/]
    let mut art = String::with_capacity(raw.len());
    let mut inside = false;
    for ch in raw.chars() {
        match ch {
            '[' => inside = true,
            ']' => inside = false,
            c if !inside => art.push(c),
            _ => {}
        }
    }

    HermesBannerHero {
        art: art.trim_end().to_string(),
        color,
        skin: Some(active_skin),
    }
}

#[derive(serde::Serialize)]
pub struct HermesSkills {
    pub total: usize,
    pub categories: Vec<String>,
}

#[tauri::command]
pub fn get_hermes_skills() -> HermesSkills {
    let Some(skills_dir) = dirs::home_dir().map(|h| h.join(".hermes").join("skills")) else {
        return HermesSkills {
            total: 0,
            categories: vec![],
        };
    };
    if !skills_dir.is_dir() {
        return HermesSkills {
            total: 0,
            categories: vec![],
        };
    }

    let mut categories: Vec<String> = Vec::new();
    let mut total: usize = 0;

    let Ok(entries) = std::fs::read_dir(&skills_dir) else {
        return HermesSkills {
            total: 0,
            categories: vec![],
        };
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.starts_with('.') || name.starts_with('_') {
            continue;
        }
        categories.push(name.to_string());

        if let Ok(sub) = std::fs::read_dir(&path) {
            for s in sub.flatten() {
                if s.path().join("SKILL.md").exists() {
                    total += 1;
                }
            }
        }
    }

    categories.sort();
    HermesSkills { total, categories }
}

#[tauri::command]
pub fn get_hermes_toolsets() -> HermesToolsets {
    let home = dirs::home_dir();
    let config_path = home
        .map(|h| h.join(".hermes").join("config.yaml"))
        .filter(|p| p.exists());

    let Some(path) = config_path else {
        return HermesToolsets {
            enabled: vec![],
            model: None,
        };
    };

    let contents = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => {
            return HermesToolsets {
                enabled: vec![],
                model: None,
            }
        }
    };

    let yaml: serde_yaml::Value = match serde_yaml::from_str(&contents) {
        Ok(v) => v,
        Err(_) => {
            return HermesToolsets {
                enabled: vec![],
                model: None,
            }
        }
    };

    let enabled = yaml
        .get("toolsets")
        .and_then(|v| v.as_sequence())
        .map(|seq| {
            seq.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let model = yaml
        .get("model")
        .and_then(|m| m.get("default"))
        .and_then(|d| d.as_str())
        .map(String::from);

    HermesToolsets { enabled, model }
}

#[tauri::command]
pub fn delete_session(session_id: String) -> Result<(), String> {
    let hermes_bin = std::env::var("HERMES_BIN").unwrap_or_else(|_| "hermes".to_string());
    let output = std::process::Command::new(&hermes_bin)
        .args(["sessions", "delete", "--yes", &session_id])
        .output()
        .map_err(|e| format!("failed to run hermes sessions delete: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn rename_session(session_id: String, title: String) -> Result<(), String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("Title cannot be empty".into());
    }
    let hermes_bin = std::env::var("HERMES_BIN").unwrap_or_else(|_| "hermes".to_string());
    let output = std::process::Command::new(&hermes_bin)
        .args(["sessions", "rename", &session_id, trimmed])
        .output()
        .map_err(|e| format!("failed to run hermes sessions rename: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn get_home_dir() -> String {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string())
}

#[tauri::command]
pub fn get_launch_cwd() -> String {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string())
}

#[tauri::command]
pub fn set_window_title(app: tauri::AppHandle, title: String) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        window.set_title(&title).map_err(|e| e.to_string())?;
    }
    Ok(())
}
