use std::sync::Mutex;
use tauri::State;

use crate::acp::client::AcpClient;

pub struct AcpState(pub Mutex<Option<AcpClient>>);

#[tauri::command]
pub fn acp_new_session(state: State<'_, AcpState>) -> Result<String, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let client = guard.as_ref().ok_or("ACP client not initialized")?;
    client.new_session()?;
    Ok("session/new sent".to_string())
}

#[tauri::command]
pub fn acp_load_session(state: State<'_, AcpState>, session_id: String) -> Result<String, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let client = guard.as_ref().ok_or("ACP client not initialized")?;
    client.load_session(&session_id)?;
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

#[derive(serde::Serialize)]
pub struct VersionInfo {
    pub current: Option<String>,
    pub latest: Option<String>,
    pub update_available: bool,
}

#[tauri::command]
pub fn check_hermes_update() -> VersionInfo {
    let hermes_bin = std::env::var("HERMES_BIN").unwrap_or_else(|_| "hermes".to_string());

    // Get current version: hermes --version → "hermes-agent 0.7.1"
    let current = std::process::Command::new(&hermes_bin)
        .arg("--version")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .and_then(|s| s.split_whitespace().last().map(|v| v.to_string()));

    // Check latest: hermes update --check (if available), or pip show
    let latest = std::process::Command::new("pip")
        .args(["index", "versions", "hermes-agent"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| {
            // Output: "hermes-agent (0.7.1)\n  INSTALLED: 0.7.0\n  LATEST:    0.7.1"
            s.lines()
                .find(|l| l.contains("LATEST"))
                .and_then(|l| l.split_whitespace().last())
                .map(|v| v.to_string())
        });

    let update_available = match (&current, &latest) {
        (Some(c), Some(l)) => l != c,
        _ => false,
    };

    VersionInfo { current, latest, update_available }
}

#[tauri::command]
pub fn set_window_title(app: tauri::AppHandle, title: String) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        window.set_title(&title).map_err(|e| e.to_string())?;
    }
    Ok(())
}
