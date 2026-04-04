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
