mod acp;
mod artifacts;
mod coedit;
mod commands;
mod hermes_config;
pub mod lane2;
mod mcp_commands;
mod mcp_proxy;
mod projects;
mod sessions;

use commands::{AcpHealthState, AcpState};
use hermes_config::ConfigLock;
use mcp_proxy::McpPoolState;
use std::sync::Mutex;
use tauri::Manager;
use tokio::sync::Mutex as TokioMutex;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AcpState(Mutex::new(None)))
        .manage(AcpHealthState(std::sync::Arc::new(Mutex::new(commands::AcpHealth::default()))))
        .manage(ConfigLock(TokioMutex::new(())))
        .manage(McpPoolState::new())
        .manage(projects::ProjectLock(TokioMutex::new(())))
        .manage(lane2::Lane2StoreLock(Mutex::new(())))
        .setup(|app| {
            let acp_health = app.state::<AcpHealthState>().0.clone();
            match acp::client::AcpClient::spawn(&app.handle(), acp_health) {
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
            artifacts::start_a2ui_watcher(&app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Existing ACP commands
            commands::acp_new_session,
            commands::acp_load_session,
            commands::acp_send_prompt,
            commands::acp_cancel,
            commands::acp_reconnect,
            commands::acp_status,
            commands::list_sessions,
            commands::get_session_messages,
            commands::list_artifacts,
            commands::get_project_work_context,
            commands::list_a2ui_batches,
            commands::emit_local_a2ui_batch,
            coedit::coedit_upsert_surface_instance,
            coedit::coedit_get_surface_instance,
            coedit::coedit_submit_patch,
            coedit::coedit_apply_host_patch,
            lane2::lane2_get_active_workspace,
            lane2::lane2_list_workspaces,
            lane2::lane2_upsert_workspace,
            lane2::lane2_set_active_workspace,
            commands::get_home_dir,
            commands::get_launch_cwd,
            commands::set_window_title,
            commands::check_hermes_update,
            commands::apply_hermes_update,
            commands::get_hermes_toolsets,
            commands::get_hermes_skills,
            commands::get_hermes_banner_hero,
            commands::delete_session,
            commands::rename_session,
            // MCP server management commands
            mcp_commands::list_mcp_servers,
            mcp_commands::add_mcp_server,
            mcp_commands::update_mcp_server,
            mcp_commands::remove_mcp_server,
            mcp_commands::toggle_mcp_server,
            mcp_commands::test_mcp_server,
            // Secret / env-var commands
            mcp_commands::list_env_var_names,
            mcp_commands::save_env_var,
            mcp_commands::delete_env_var,
            mcp_commands::find_orphaned_env_vars,
            // MCP proxy commands
            mcp_commands::mcp_read_resource,
            mcp_commands::mcp_call_tool,
            mcp_commands::mcp_list_tools,
            mcp_commands::mcp_list_resources,
            // Hermes sync
            mcp_commands::reload_hermes,
            // Project management
            projects::list_projects,
            projects::add_project,
            projects::remove_project,
            projects::update_project,
            projects::set_active_project,
            projects::get_git_info,
            projects::detect_project,
            projects::assign_session_to_project,
            projects::get_sessions_for_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
