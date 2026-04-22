use std::collections::HashMap;
use std::io::BufRead;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use tauri::{AppHandle, Emitter};

use crate::acp::events::AcpEvent;
use crate::acp::protocol::{is_initialize_response, parse_acp_line};
use crate::commands::AcpHealth;

pub struct AcpClient {
    child: Arc<Mutex<Option<Child>>>,
    stdin_tx: Arc<Mutex<Option<std::process::ChildStdin>>>,
    next_id: AtomicU64,
    pending_requests: Arc<Mutex<HashMap<u64, PendingRequest>>>,
}

#[derive(Debug, Clone)]
struct PendingRequest {
    source_op: &'static str,
    session_id: Option<String>,
}

fn update_health(health: &Arc<Mutex<AcpHealth>>, status: &str, message: Option<String>) {
    if let Ok(mut guard) = health.lock() {
        guard.status = status.to_string();
        guard.message = message;
    }
}

fn enrich_response_event(event: &mut AcpEvent, pending_requests: &Arc<Mutex<HashMap<u64, PendingRequest>>>) {
    let request_id = match event {
        AcpEvent::SessionInfo { request_id, .. } => *request_id,
        AcpEvent::StreamEnd { request_id, .. } => *request_id,
        _ => None,
    };

    let Some(request_id) = request_id else {
        return;
    };

    let pending = pending_requests
        .lock()
        .ok()
        .and_then(|mut guard| guard.remove(&request_id));

    let Some(pending) = pending else {
        return;
    };

    match event {
        AcpEvent::SessionInfo {
            source_op,
            ..
        } => {
            *source_op = Some(pending.source_op.to_string());
        }
        AcpEvent::StreamEnd {
            session_id,
            source_op,
            ..
        } => {
            if session_id.is_none() {
                *session_id = pending.session_id;
            }
            *source_op = Some(pending.source_op.to_string());
        }
        _ => {}
    }
}

impl AcpClient {
    /// Spawn `hermes acp` and start reading stdout in a background thread.
    /// Parsed ACP events are emitted to the webview via `acp:event`.
    pub fn spawn(app: &AppHandle, health: Arc<Mutex<AcpHealth>>) -> Result<Self, String> {
        let hermes_bin = std::env::var("HERMES_BIN").unwrap_or_else(|_| "hermes".to_string());

        let mut child = Command::new(&hermes_bin)
            .arg("acp")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .env("HERMES_YOLO_MODE", "1")
            .spawn()
            .map_err(|e| format!("failed to spawn hermes acp: {}", e))?;

        let stdin = child.stdin.take();
        let stdout = child
            .stdout
            .take()
            .ok_or("failed to capture hermes acp stdout")?;

        let app_handle = app.clone();
        let child_arc = Arc::new(Mutex::new(Some(child)));
        let child_arc_thread = child_arc.clone();
        let stdin_arc = Arc::new(Mutex::new(stdin));
        let stdin_arc_thread = stdin_arc.clone();
        let health_thread = health.clone();
        let pending_requests = Arc::new(Mutex::new(HashMap::<u64, PendingRequest>::new()));
        let pending_requests_thread = pending_requests.clone();

        if let Ok(mut pending) = pending_requests.lock() {
            pending.insert(
                0,
                PendingRequest {
                    source_op: "initialize",
                    session_id: None,
                },
            );
        }

        if let Ok(mut guard) = stdin_arc.lock() {
            if let Some(stdin) = guard.as_mut() {
                use std::io::Write;
                let initialize = serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 0,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": 1,
                        "clientCapabilities": {},
                        "clientInfo": { "name": "aurora-chat", "version": "0.1.0" }
                    }
                });
                writeln!(stdin, "{}", initialize).map_err(|e| format!("stdin write error: {}", e))?;
                stdin.flush().map_err(|e| format!("stdin flush error: {}", e))?;
            }
        }

        // Background thread: read NDJSON lines from stdout, parse, emit
        thread::spawn(move || {
            let reader = std::io::BufReader::new(stdout);
            let mut protocol_ready = false;

            update_health(&health_thread, "connecting", None);

            for line in reader.lines() {
                match line {
                    Ok(line) => {
                        if !protocol_ready && is_initialize_response(&line) {
                            protocol_ready = true;
                            update_health(&health_thread, "ready", None);
                            let _ = app_handle.emit(
                                "acp:event",
                                AcpEvent::ConnectionStatus {
                                    status: "connected".to_string(),
                                    message: None,
                                },
                            );
                        }
                        if let Some(mut event) = parse_acp_line(&line) {
                            enrich_response_event(&mut event, &pending_requests_thread);
                            let _ = app_handle.emit("acp:event", &event);
                        }
                    }
                    Err(e) => {
                        eprintln!("stdout read error: {}", e);
                        break;
                    }
                }
            }

            if let Ok(mut status) = health_thread.lock() {
                status.status = "disconnected".to_string();
                status.message = Some("hermes acp process exited".to_string());
            }
            let _ = app_handle.emit(
                "acp:event",
                AcpEvent::ConnectionStatus {
                    status: "disconnected".to_string(),
                    message: Some("hermes acp process exited".to_string()),
                },
            );

            // Clean up
            if let Ok(mut stdin_guard) = stdin_arc_thread.lock() {
                let _ = stdin_guard.take();
            }
            if let Ok(mut guard) = child_arc_thread.lock() {
                if let Some(mut child) = guard.take() {
                    let _ = child.wait();
                }
            }
        });

        Ok(Self {
            child: child_arc,
            stdin_tx: stdin_arc,
            next_id: AtomicU64::new(1),
            pending_requests,
        })
    }

    /// Write a JSON-RPC message to hermes acp stdin.
    pub fn send(&self, message: &str) -> Result<(), String> {
        use std::io::Write;

        let mut guard = self.stdin_tx.lock().map_err(|e| e.to_string())?;
        let stdin = guard.as_mut().ok_or("stdin not available")?;

        writeln!(stdin, "{}", message).map_err(|e| format!("stdin write error: {}", e))?;
        stdin
            .flush()
            .map_err(|e| format!("stdin flush error: {}", e))?;

        Ok(())
    }

    /// Get the next unique JSON-RPC request ID.
    fn next_request_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }

    /// Send a session/new JSON-RPC request. Returns the request ID
    /// so the caller can correlate the response (which contains the session ID).
    pub fn new_session(&self, cwd: Option<&str>) -> Result<u64, String> {
        let id = self.next_request_id();
        let cwd = cwd.map(|s| s.to_string()).unwrap_or_else(|| {
            std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| ".".to_string())
        });
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "session/new",
            "params": {
                "cwd": cwd,
                "mcpServers": []
            }
        });
        self.pending_requests
            .lock()
            .map_err(|e| e.to_string())?
            .insert(id, PendingRequest {
                source_op: "session/new",
                session_id: None,
            });
        if let Err(error) = self.send(&msg.to_string()) {
            if let Ok(mut pending) = self.pending_requests.lock() {
                pending.remove(&id);
            }
            return Err(error);
        }
        Ok(id)
    }

    /// Send a session/prompt JSON-RPC request.
    pub fn send_prompt(&self, session_id: &str, text: &str) -> Result<u64, String> {
        let id = self.next_request_id();
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "session/prompt",
            "params": {
                "sessionId": session_id,
                "prompt": [
                    { "type": "text", "text": text }
                ]
            }
        });
        self.pending_requests
            .lock()
            .map_err(|e| e.to_string())?
            .insert(id, PendingRequest {
                source_op: "session/prompt",
                session_id: Some(session_id.to_string()),
            });
        if let Err(error) = self.send(&msg.to_string()) {
            if let Ok(mut pending) = self.pending_requests.lock() {
                pending.remove(&id);
            }
            return Err(error);
        }
        Ok(id)
    }

    /// Send a session/load JSON-RPC request to restore an existing session.
    pub fn load_session(&self, session_id: &str, cwd: Option<&str>) -> Result<u64, String> {
        let id = self.next_request_id();
        let cwd = cwd.map(|s| s.to_string()).unwrap_or_else(|| {
            std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| ".".to_string())
        });
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "session/load",
            "params": {
                "sessionId": session_id,
                "cwd": cwd,
                "mcpServers": []
            }
        });
        self.pending_requests
            .lock()
            .map_err(|e| e.to_string())?
            .insert(id, PendingRequest {
                source_op: "session/load",
                session_id: Some(session_id.to_string()),
            });
        if let Err(error) = self.send(&msg.to_string()) {
            if let Ok(mut pending) = self.pending_requests.lock() {
                pending.remove(&id);
            }
            return Err(error);
        }
        Ok(id)
    }

    /// Send a session/cancel JSON-RPC notification.
    pub fn cancel(&self, session_id: &str) -> Result<(), String> {
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "session/cancel",
            "params": { "sessionId": session_id }
        });
        self.send(&msg.to_string())
    }

    /// Gracefully shut down the hermes acp process.
    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                // Close stdin to signal EOF
                drop(self.stdin_tx.lock().ok().and_then(|mut g| g.take()));

                // Wait briefly, then kill if needed
                match child.try_wait() {
                    Ok(Some(_)) => {} // already exited
                    _ => {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        }
    }
}

impl Drop for AcpClient {
    fn drop(&mut self) {
        self.shutdown();
    }
}
