mod acp;
mod commands;
mod sessions;

use commands::AcpState;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .manage(AcpState(Mutex::new(None)))
        .setup(|app| {
            match acp::client::AcpClient::spawn(&app.handle()) {
                Ok(client) => {
                    let state = app.state::<AcpState>();
                    *state.0.lock().unwrap() = Some(client);
                    println!("hermes acp spawned successfully");
                }
                Err(e) => {
                    eprintln!("failed to spawn hermes acp: {}", e);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::acp_new_session,
            commands::acp_send_prompt,
            commands::acp_cancel,
            commands::acp_reconnect,
            commands::acp_status,
            commands::list_sessions,
            commands::get_session_messages,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
