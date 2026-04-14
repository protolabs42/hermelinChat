use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

use crate::acp::client::AcpClient;

pub struct AcpState(pub Mutex<Option<AcpClient>>);

#[tauri::command]
pub fn acp_new_session(state: State<'_, AcpState>, cwd: Option<String>) -> Result<String, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let client = guard.as_ref().ok_or("ACP client not initialized")?;
    client.new_session(cwd.as_deref())?;
    Ok("session/new sent".to_string())
}

#[tauri::command]
pub fn acp_load_session(state: State<'_, AcpState>, session_id: String, cwd: Option<String>) -> Result<String, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let client = guard.as_ref().ok_or("ACP client not initialized")?;
    client.load_session(&session_id, cwd.as_deref())?;
    Ok("session/load sent".to_string())
}

#[tauri::command]
pub fn acp_send_prompt(
    state: State<'_, AcpState>,
    session_id: String,
    text: String,
) -> Result<String, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let client = guard.as_ref().ok_or("ACP client not initialized")?;
    client.send_prompt(&session_id, &text)?;
    Ok("prompt sent".to_string())
}

#[tauri::command]
pub fn acp_cancel(
    state: State<'_, AcpState>,
    session_id: String,
) -> Result<String, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let client = guard.as_ref().ok_or("ACP client not initialized")?;
    client.cancel(&session_id)?;
    Ok("cancel sent".to_string())
}

#[tauri::command]
pub fn acp_reconnect(app: tauri::AppHandle, state: State<'_, AcpState>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    if let Some(client) = guard.take() {
        client.shutdown();
    }

    let client = crate::acp::client::AcpClient::spawn(&app)?;
    *guard = Some(client);

    Ok("reconnected".to_string())
}

#[tauri::command]
pub fn acp_status(state: State<'_, AcpState>) -> String {
    let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_some() { "connected".to_string() } else { "disconnected".to_string() }
}

#[tauri::command]
pub fn list_sessions(limit: Option<usize>) -> Result<Vec<crate::sessions::SessionSummary>, String> {
    crate::sessions::list_sessions(limit.unwrap_or(30))
}

#[tauri::command]
pub fn get_session_messages(session_id: String, limit: Option<usize>) -> Result<Vec<crate::sessions::SessionMessage>, String> {
    crate::sessions::get_session_messages(&session_id, limit.unwrap_or(200))
}

#[tauri::command]
pub fn list_artifacts() -> Vec<crate::artifacts::Artifact> {
    crate::artifacts::list_current_artifacts()
}

#[tauri::command]
pub fn list_a2ui_batches() -> Vec<crate::artifacts::SurfaceBatch> {
    crate::artifacts::list_current_a2ui_batches()
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
        .and_then(|o| if o.status.success() { String::from_utf8(o.stdout).ok() } else { None })
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

#[tauri::command]
pub fn apply_hermes_update() -> UpdateResult {
    let hermes_bin = std::env::var("HERMES_BIN").unwrap_or_else(|_| "hermes".to_string());
    let mut log = String::new();

    log.push_str(&format!("==> {} update\n", hermes_bin));
    let hermes_ok = match std::process::Command::new(&hermes_bin).arg("update").output() {
        Ok(o) => {
            log.push_str(&String::from_utf8_lossy(&o.stdout));
            log.push_str(&String::from_utf8_lossy(&o.stderr));
            o.status.success()
        }
        Err(e) => {
            log.push_str(&format!("failed to run `{} update`: {e}\n", hermes_bin));
            false
        }
    };

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
            log.push_str(&format!("\n==> reapplying patches via {}\n", p.display()));
            match std::process::Command::new("python3").arg(&p).output() {
                Ok(o) => {
                    log.push_str(&String::from_utf8_lossy(&o.stdout));
                    log.push_str(&String::from_utf8_lossy(&o.stderr));
                    (o.status.success(), o.status.success())
                }
                Err(e) => {
                    log.push_str(&format!("failed to run patch script: {e}\n"));
                    (false, false)
                }
            }
        }
        _ => {
            log.push_str("\n⚠ patch script not found — patches NOT reapplied.\n");
            log.push_str("Run `scripts/update.sh --skip-frontend --skip-python --no-pull` from the hermelinChat repo.\n");
            (false, true)
        }
    };

    log.push_str("\n==> verifying post-update state\n");
    let (new_version, new_commits_behind, verified) = verify_hermes_state(&hermes_bin);
    if let Some(ref v) = new_version {
        log.push_str(&format!("version: {}\n", v));
    }
    if let Some(n) = new_commits_behind {
        log.push_str(&format!("commits behind origin/main: {}\n", n));
    }
    log.push_str(if verified { "✓ verified: at latest\n" } else { "⚠ still behind upstream\n" });

    UpdateResult {
        success: success && verified,
        log,
        patches_reapplied,
        new_version,
        new_commits_behind,
        verified,
    }
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
