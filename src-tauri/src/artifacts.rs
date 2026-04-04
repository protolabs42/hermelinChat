use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub id: String,
    #[serde(rename = "type")]
    pub artifact_type: String,
    pub title: Option<String>,
    pub data: Option<serde_json::Value>,
    pub live: Option<bool>,
    pub refresh_seconds: Option<f64>,
    pub timestamp: Option<f64>,
    #[serde(skip_deserializing)]
    pub persistent: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind")]
pub enum ArtifactEvent {
    Update { artifact: Artifact },
    Remove { id: String },
    List { artifacts: Vec<Artifact> },
}

pub fn start_watcher(app: &AppHandle) {
    let artifacts_dir = artifacts_dir();
    let app_handle = app.clone();

    thread::spawn(move || {
        // Ensure directories exist
        let session_dir = artifacts_dir.join("session");
        let persistent_dir = artifacts_dir.join("persistent");
        let _ = std::fs::create_dir_all(&session_dir);
        let _ = std::fs::create_dir_all(&persistent_dir);

        // Initial scan
        let mut known: HashMap<String, Artifact> = HashMap::new();
        scan_artifacts(&artifacts_dir, &mut known);
        if !known.is_empty() {
            let list: Vec<Artifact> = known.values().cloned().collect();
            let _ = app_handle.emit("artifact:event", ArtifactEvent::List { artifacts: list });
        }

        // Watch for changes
        let (tx, rx) = mpsc::channel();
        let mut watcher = match RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| { let _ = tx.send(res); },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        ) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("Failed to create artifact watcher: {}", e);
                return;
            }
        };

        if let Err(e) = watcher.watch(&artifacts_dir, RecursiveMode::Recursive) {
            eprintln!("Failed to watch artifacts dir: {}", e);
            return;
        }

        println!("Artifact watcher started: {}", artifacts_dir.display());

        // Debounce: collect events then process
        loop {
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(Ok(event)) => {
                    // Drain any additional events in the buffer
                    let mut events = vec![event];
                    while let Ok(Ok(e)) = rx.try_recv() {
                        events.push(e);
                    }

                    for event in events {
                        match event.kind {
                            EventKind::Create(_) | EventKind::Modify(_) => {
                                for path in &event.paths {
                                    if is_artifact_json(path) {
                                        if let Some(mut artifact) = read_artifact(path) {
                                            artifact.persistent = detect_persistent(path);
                                            let _ = app_handle.emit("artifact:event", ArtifactEvent::Update { artifact: artifact.clone() });
                                            known.insert(artifact.id.clone(), artifact);
                                        }
                                    }
                                }
                            }
                            EventKind::Remove(_) => {
                                for path in &event.paths {
                                    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string());
                                    if let Some(id) = stem {
                                        if known.remove(&id).is_some() {
                                            let _ = app_handle.emit("artifact:event", ArtifactEvent::Remove { id });
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
                Ok(Err(e)) => {
                    eprintln!("Watcher error: {}", e);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    continue;
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    break;
                }
            }
        }
    });
}

fn is_artifact_json(path: &Path) -> bool {
    path.extension().map(|e| e == "json").unwrap_or(false)
        && !path.file_name().map(|n| n.to_string_lossy().starts_with('_')).unwrap_or(false)
}

fn detect_persistent(path: &Path) -> Option<bool> {
    for ancestor in path.ancestors() {
        if let Some(name) = ancestor.file_name() {
            let n = name.to_string_lossy();
            if n == "persistent" {
                return Some(true);
            }
            if n == "session" {
                return Some(false);
            }
        }
    }
    None
}

fn scan_artifacts(dir: &Path, known: &mut HashMap<String, Artifact>) {
    for subdir in &["session", "persistent"] {
        let sub = dir.join(subdir);
        if let Ok(entries) = std::fs::read_dir(&sub) {
            for entry in entries.flatten() {
                let path = entry.path();
                if is_artifact_json(&path) {
                    if let Some(mut artifact) = read_artifact(&path) {
                        artifact.persistent = Some(*subdir == "persistent");
                        known.insert(artifact.id.clone(), artifact);
                    }
                }
            }
        }
    }
}

fn read_artifact(path: &Path) -> Option<Artifact> {
    let content = std::fs::read_to_string(path).ok()?;
    let artifact: Artifact = serde_json::from_str(&content).ok()?;
    if artifact.id.is_empty() || artifact.artifact_type.is_empty() {
        return None;
    }
    Some(artifact)
}

/// List all current artifacts (called by frontend on mount).
pub fn list_current_artifacts() -> Vec<Artifact> {
    let dir = artifacts_dir();
    let mut known: HashMap<String, Artifact> = HashMap::new();
    scan_artifacts(&dir, &mut known);
    let mut list: Vec<Artifact> = known.into_values().collect();
    list.sort_by(|a, b| {
        b.timestamp.unwrap_or(0.0).partial_cmp(&a.timestamp.unwrap_or(0.0)).unwrap_or(std::cmp::Ordering::Equal)
    });
    list
}

fn artifacts_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("HERMELIN_ARTIFACT_DIR") {
        return PathBuf::from(dir);
    }
    if let Ok(home) = std::env::var("HERMES_HOME") {
        return PathBuf::from(home).join("artifacts");
    }
    #[cfg(windows)]
    {
        if let Some(app_data) = std::env::var_os("LOCALAPPDATA") {
            return PathBuf::from(app_data).join("hermes").join("artifacts");
        }
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".hermes").join("artifacts")
}
