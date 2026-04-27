use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const WORKSPACE_BRIDGE_CHANNEL: &str = "workspace";
const WORKSPACE_BRIDGE_EVENT: &str = "workspace-bridge:event";

#[derive(Debug, Clone, Deserialize)]
struct RawWorkspaceBridgeCommand {
    command_id: String,
    channel: String,
    command: String,
    #[serde(default)]
    payload: serde_json::Value,
    #[serde(default)]
    timestamp: Option<f64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum WorkspaceBridgeEvent {
    OpenWorkspace {
        command_id: String,
        name: String,
        create_if_missing: bool,
        timestamp: Option<f64>,
    },
    FocusPanel {
        command_id: String,
        target: String,
        workspace_id: Option<String>,
        timestamp: Option<f64>,
    },
    ClosePanel {
        command_id: String,
        target: String,
        workspace_id: Option<String>,
        timestamp: Option<f64>,
    },
}

pub fn start_watcher(app: &AppHandle) {
    let commands_dir = workspace_bridge_commands_dir();
    let app_handle = app.clone();

    thread::spawn(move || {
        let _ = std::fs::create_dir_all(&commands_dir);

        drain_workspace_bridge_commands(&app_handle, &commands_dir);

        let (tx, rx) = mpsc::channel();
        let mut watcher = match RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                let _ = tx.send(res);
            },
            Config::default().with_poll_interval(Duration::from_millis(500)),
        ) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("Failed to create workspace bridge watcher: {e}");
                return;
            }
        };

        if let Err(e) = watcher.watch(&commands_dir, RecursiveMode::NonRecursive) {
            eprintln!("Failed to watch workspace bridge commands dir: {e}");
            return;
        }

        println!(
            "Workspace bridge watcher started: {}",
            commands_dir.display()
        );

        loop {
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(Ok(event)) => {
                    if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                        drain_workspace_bridge_commands(&app_handle, &commands_dir);
                    }
                    while let Ok(Ok(event)) = rx.try_recv() {
                        if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                            drain_workspace_bridge_commands(&app_handle, &commands_dir);
                        }
                    }
                }
                Ok(Err(e)) => eprintln!("Workspace bridge watcher error: {e}"),
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // Also poll so commands queued before watcher startup or missed by the OS
                    // are consumed exactly once on the next pass.
                    drain_workspace_bridge_commands(&app_handle, &commands_dir);
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });
}

fn drain_workspace_bridge_commands(app: &AppHandle, commands_dir: &Path) {
    for path in list_command_files(commands_dir) {
        if let Some(event) = read_consumable_workspace_bridge_command_file(&path) {
            if let Some(event) = event {
                let _ = app.emit(WORKSPACE_BRIDGE_EVENT, event);
            }
            if let Err(e) = std::fs::remove_file(&path) {
                eprintln!(
                    "Failed to delete consumed workspace bridge command {}: {e}",
                    path.display()
                );
            }
        }
    }
}

fn list_command_files(commands_dir: &Path) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = std::fs::read_dir(commands_dir)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| is_json_command_file(path))
        .collect();
    paths.sort();
    paths
}

fn is_json_command_file(path: &Path) -> bool {
    path.extension().map(|ext| ext == "json").unwrap_or(false)
        && !path
            .file_name()
            .map(|name| name.to_string_lossy().starts_with('.'))
            .unwrap_or(false)
        && !path
            .file_name()
            .map(|name| name.to_string_lossy().starts_with('_'))
            .unwrap_or(false)
}

#[cfg(test)]
fn parse_workspace_bridge_command_json(body: &str) -> Option<WorkspaceBridgeEvent> {
    let raw: RawWorkspaceBridgeCommand = serde_json::from_str(body).ok()?;
    if raw.channel != WORKSPACE_BRIDGE_CHANNEL {
        return None;
    }
    parse_workspace_bridge_command(raw)
}

fn read_consumable_workspace_bridge_command_file(
    path: &Path,
) -> Option<Option<WorkspaceBridgeEvent>> {
    let body = std::fs::read_to_string(path).ok()?;
    let raw: RawWorkspaceBridgeCommand = serde_json::from_str(&body).ok()?;
    if raw.channel != WORKSPACE_BRIDGE_CHANNEL {
        return None;
    }
    Some(parse_workspace_bridge_command(raw))
}

fn parse_workspace_bridge_command(raw: RawWorkspaceBridgeCommand) -> Option<WorkspaceBridgeEvent> {
    if raw.command_id.trim().is_empty() {
        return None;
    }

    match raw.command.as_str() {
        "open-workspace" => {
            let name = raw.payload.get("name")?.as_str()?.trim();
            if name.is_empty() {
                return None;
            }
            Some(WorkspaceBridgeEvent::OpenWorkspace {
                command_id: raw.command_id,
                name: name.to_string(),
                create_if_missing: raw
                    .payload
                    .get("create_if_missing")
                    .and_then(|value| value.as_bool())
                    .unwrap_or(true),
                timestamp: raw.timestamp,
            })
        }
        "focus-panel" => parse_panel_command(raw, PanelCommandKind::Focus),
        "close-panel" => parse_panel_command(raw, PanelCommandKind::Close),
        // split-pane and arrange-layout are intentionally consumed without an
        // event in the first v2 consumer slice; follow-up beads own real layout
        // choreography.
        _ => None,
    }
}

enum PanelCommandKind {
    Focus,
    Close,
}

fn parse_panel_command(
    raw: RawWorkspaceBridgeCommand,
    kind: PanelCommandKind,
) -> Option<WorkspaceBridgeEvent> {
    let target = raw.payload.get("target")?.as_str()?.trim();
    if target.is_empty() {
        return None;
    }
    let workspace_id = raw
        .payload
        .get("workspace_id")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    match kind {
        PanelCommandKind::Focus => Some(WorkspaceBridgeEvent::FocusPanel {
            command_id: raw.command_id,
            target: target.to_string(),
            workspace_id,
            timestamp: raw.timestamp,
        }),
        PanelCommandKind::Close => Some(WorkspaceBridgeEvent::ClosePanel {
            command_id: raw.command_id,
            target: target.to_string(),
            workspace_id,
            timestamp: raw.timestamp,
        }),
    }
}

fn workspace_bridge_commands_dir() -> PathBuf {
    crate::artifacts::artifacts_dir()
        .join("bridge")
        .join("commands")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_open_workspace_command() {
        let event = parse_workspace_bridge_command_json(
            r#"{
                "command_id":"workspace_1",
                "channel":"workspace",
                "command":"open-workspace",
                "payload":{"name":"Deep Work", "create_if_missing": false},
                "timestamp":42.5
            }"#,
        );

        assert_eq!(
            event,
            Some(WorkspaceBridgeEvent::OpenWorkspace {
                command_id: "workspace_1".to_string(),
                name: "Deep Work".to_string(),
                create_if_missing: false,
                timestamp: Some(42.5),
            })
        );
    }

    #[test]
    fn parses_focus_and_close_panel_commands() {
        let focus = parse_workspace_bridge_command_json(
            r#"{"command_id":"workspace_2","channel":"workspace","command":"focus-panel","payload":{"target":"artifacts","workspace_id":"ws-1"}}"#,
        );
        let close = parse_workspace_bridge_command_json(
            r#"{"command_id":"workspace_3","channel":"workspace","command":"close-panel","payload":{"target":"artifacts"}}"#,
        );

        assert_eq!(
            focus,
            Some(WorkspaceBridgeEvent::FocusPanel {
                command_id: "workspace_2".to_string(),
                target: "artifacts".to_string(),
                workspace_id: Some("ws-1".to_string()),
                timestamp: None,
            })
        );
        assert_eq!(
            close,
            Some(WorkspaceBridgeEvent::ClosePanel {
                command_id: "workspace_3".to_string(),
                target: "artifacts".to_string(),
                workspace_id: None,
                timestamp: None,
            })
        );
    }

    #[test]
    fn ignores_non_workspace_and_deferred_commands() {
        assert_eq!(
            parse_workspace_bridge_command_json(
                r#"{"command_id":"artifact_1","channel":"strudel","command":"focus-panel","payload":{"target":"plan"}}"#,
            ),
            None
        );
        assert_eq!(
            parse_workspace_bridge_command_json(
                r#"{"command_id":"workspace_4","channel":"workspace","command":"split-pane","payload":{"direction":"right"}}"#,
            ),
            None
        );
    }

    #[test]
    fn serializes_event_payloads_for_v2_listener() {
        let value = serde_json::to_value(WorkspaceBridgeEvent::OpenWorkspace {
            command_id: "workspace_1".to_string(),
            name: "Deep Work".to_string(),
            create_if_missing: true,
            timestamp: None,
        })
        .expect("serialize event");

        assert_eq!(value["kind"], "openWorkspace");
        assert_eq!(value["commandId"], "workspace_1");
        assert_eq!(value["createIfMissing"], true);
    }

    #[test]
    fn lists_only_json_command_files_in_order() {
        let temp = tempfile::TempDir::new().expect("temp dir");
        std::fs::write(temp.path().join("002.json"), "{}").expect("write");
        std::fs::write(temp.path().join("001.json"), "{}").expect("write");
        std::fs::write(temp.path().join(".partial.json"), "{}").expect("write");
        std::fs::write(temp.path().join("note.txt"), "{}").expect("write");

        let names: Vec<String> = list_command_files(temp.path())
            .into_iter()
            .map(|path| path.file_name().unwrap().to_string_lossy().to_string())
            .collect();

        assert_eq!(names, vec!["001.json", "002.json"]);
    }
}
