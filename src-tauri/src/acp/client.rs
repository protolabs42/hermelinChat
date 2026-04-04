use std::io::BufRead;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use tauri::{AppHandle, Emitter};

use crate::acp::events::AcpEvent;
use crate::acp::protocol::parse_acp_line;

pub struct AcpClient {
    child: Arc<Mutex<Option<Child>>>,
    stdin_tx: Arc<Mutex<Option<std::process::ChildStdin>>>,
    next_id: AtomicU64,
}

impl AcpClient {
    /// Spawn `hermes acp` and start reading stdout in a background thread.
    /// Parsed ACP events are emitted to the webview via `acp:event`.
    pub fn spawn(app: &AppHandle) -> Result<Self, String> {
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
        let stdout = child.stdout.take()
            .ok_or("failed to capture hermes acp stdout")?;

        let app_handle = app.clone();
        let child_arc = Arc::new(Mutex::new(Some(child)));
        let child_arc_thread = child_arc.clone();

        // Background thread: read NDJSON lines from stdout, parse, emit
        thread::spawn(move || {
            let reader = std::io::BufReader::new(stdout);

            // Emit connected status
            let _ = app_handle.emit("acp:event", AcpEvent::ConnectionStatus {
                status: "connected".to_string(),
                message: None,
            });

            for line in reader.lines() {
                match line {
                    Ok(line) => {
                        if let Some(event) = parse_acp_line(&line) {
                            let _ = app_handle.emit("acp:event", &event);
                        }
                    }
                    Err(e) => {
                        eprintln!("stdout read error: {}", e);
                        break;
                    }
                }
            }

            // Process exited or stdout closed
            let _ = app_handle.emit("acp:event", AcpEvent::ConnectionStatus {
                status: "disconnected".to_string(),
                message: Some("hermes acp process exited".to_string()),
            });

            // Clean up
            if let Ok(mut guard) = child_arc_thread.lock() {
                if let Some(mut child) = guard.take() {
                    let _ = child.wait();
                }
            }
        });

        Ok(Self {
            child: child_arc,
            stdin_tx: Arc::new(Mutex::new(stdin)),
            next_id: AtomicU64::new(1),
        })
    }

    /// Write a JSON-RPC message to hermes acp stdin.
    pub fn send(&self, message: &str) -> Result<(), String> {
        use std::io::Write;

        let mut guard = self.stdin_tx.lock().map_err(|e| e.to_string())?;
        let stdin = guard.as_mut().ok_or("stdin not available")?;

        writeln!(stdin, "{}", message).map_err(|e| format!("stdin write error: {}", e))?;
        stdin.flush().map_err(|e| format!("stdin flush error: {}", e))?;

        Ok(())
    }

    /// Get the next unique JSON-RPC request ID.
    fn next_request_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }

    /// Send a session/new JSON-RPC request. Returns the request ID
    /// so the caller can correlate the response (which contains the session ID).
    pub fn new_session(&self) -> Result<u64, String> {
        let id = self.next_request_id();
        // ACP session/new requires a cwd parameter
        let cwd = std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| ".".to_string());
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "session/new",
            "params": {
                "cwd": cwd
            }
        });
        self.send(&msg.to_string())?;
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
                "content": [
                    { "type": "text", "text": text }
                ]
            }
        });
        self.send(&msg.to_string())?;
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
