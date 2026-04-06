mod acp;
mod artifacts;
mod commands;
mod sessions;

use commands::AcpState;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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

            artifacts::start_watcher(&app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::acp_new_session,
            commands::acp_load_session,
            commands::acp_send_prompt,
            commands::acp_cancel,
            commands::acp_reconnect,
            commands::acp_status,
            commands::list_sessions,
            commands::get_session_messages,
            commands::list_artifacts,
            commands::set_window_title,
            commands::check_hermes_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
