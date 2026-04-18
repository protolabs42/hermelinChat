use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
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
    pub session_id: Option<String>,
    #[serde(skip_deserializing)]
    pub persistent: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind")]
pub enum ArtifactEvent {
    Update {
        artifact: Artifact,
    },
    Remove {
        id: String,
        session_id: Option<String>,
    },
    List {
        artifacts: Vec<Artifact>,
    },
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
            move |res: Result<Event, notify::Error>| {
                let _ = tx.send(res);
            },
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
                                            let _ = app_handle.emit(
                                                "artifact:event",
                                                ArtifactEvent::Update {
                                                    artifact: artifact.clone(),
                                                },
                                            );
                                            known.insert(artifact.id.clone(), artifact);
                                        }
                                    }
                                }
                            }
                            EventKind::Remove(_) => {
                                for path in &event.paths {
                                    let stem =
                                        path.file_stem().map(|s| s.to_string_lossy().to_string());
                                    if let Some(id) = stem {
                                        if let Some(removed) = known.remove(&id) {
                                            let _ = app_handle.emit(
                                                "artifact:event",
                                                ArtifactEvent::Remove {
                                                    id,
                                                    session_id: removed.session_id.clone(),
                                                },
                                            );
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
        && !path
            .file_name()
            .map(|n| n.to_string_lossy().starts_with('_'))
            .unwrap_or(false)
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

fn artifact_matches_session(artifact: &Artifact, session_id: Option<&str>) -> bool {
    match artifact.session_id.as_deref() {
        Some(bound_session) => session_id == Some(bound_session),
        None => true,
    }
}

pub fn list_current_artifacts_for_session(session_id: Option<&str>) -> Vec<Artifact> {
    let dir = artifacts_dir();
    let mut known: HashMap<String, Artifact> = HashMap::new();
    scan_artifacts(&dir, &mut known);
    let mut list: Vec<Artifact> = known
        .into_values()
        .filter(|artifact| artifact_matches_session(artifact, session_id))
        .collect();
    list.sort_by(|a, b| {
        b.timestamp
            .unwrap_or(0.0)
            .partial_cmp(&a.timestamp.unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
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

/* =============================================================================
 * Phase 4: A2UI surface watcher
 *
 * Separate from the artifact watcher because A2UI surfaces and legacy
 * artifacts are different systems with different event contracts, and
 * mixing them would blur which renderer handles which payload.
 *
 * Layout on disk:
 *   ~/.hermes/a2ui-surfaces/session/{session_id}.{seq}.json
 *
 * Each file is a SurfaceBatch envelope containing an ordered list of
 * A2UI v0.9 server→client messages. Hermes writes them via atomic
 * tmp+rename so the watcher never reads partial JSON.
 *
 * Ordering guarantees: the per-session monotonic `seq` counter in the
 * envelope lets the frontend store drop stale re-fires and detect gaps.
 * ============================================================================= */

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurfaceBatch {
    pub kind: String, // always "a2ui-surface-batch"
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub seq: u64,
    pub timestamp: f64,
    pub messages: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind")]
pub enum A2UIEvent {
    Batch { batch: SurfaceBatch },
    List { batches: Vec<SurfaceBatch> },
}

pub fn start_a2ui_watcher(app: &AppHandle) {
    let a2ui_dir = a2ui_dir();
    let app_handle = app.clone();

    thread::spawn(move || {
        let session_dir = a2ui_dir.join("session");
        let _ = std::fs::create_dir_all(&session_dir);

        // Initial scan — read all existing batches, emit as List for fold
        let mut known_seen: HashMap<String, Vec<SurfaceBatch>> = HashMap::new();
        scan_a2ui_batches(&session_dir, &mut known_seen);
        if !known_seen.is_empty() {
            let mut all: Vec<SurfaceBatch> = known_seen
                .values()
                .flat_map(|v| v.iter().cloned())
                .collect();
            all.sort_by(|a, b| a.seq.cmp(&b.seq));
            let _ = app_handle.emit("a2ui:event", A2UIEvent::List { batches: all });
        }

        let (tx, rx) = mpsc::channel();
        let mut watcher = match RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                let _ = tx.send(res);
            },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        ) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("Failed to create a2ui watcher: {}", e);
                return;
            }
        };

        if let Err(e) = watcher.watch(&a2ui_dir, RecursiveMode::Recursive) {
            eprintln!("Failed to watch a2ui dir: {}", e);
            return;
        }

        println!("A2UI surface watcher started: {}", a2ui_dir.display());

        loop {
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(Ok(event)) => {
                    let mut events = vec![event];
                    while let Ok(Ok(e)) = rx.try_recv() {
                        events.push(e);
                    }

                    for event in events {
                        match event.kind {
                            EventKind::Create(_) | EventKind::Modify(_) => {
                                for path in &event.paths {
                                    if is_a2ui_batch_json(path) {
                                        if let Some(batch) = read_a2ui_batch(path) {
                                            let _ = app_handle
                                                .emit("a2ui:event", A2UIEvent::Batch { batch });
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
                Ok(Err(e)) => {
                    eprintln!("A2UI watcher error: {}", e);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });
}

fn is_a2ui_batch_json(path: &Path) -> bool {
    path.extension().map(|e| e == "json").unwrap_or(false)
        && !path
            .file_name()
            .map(|n| n.to_string_lossy().starts_with('.'))
            .unwrap_or(false)
        && !path
            .file_name()
            .map(|n| n.to_string_lossy().starts_with('_'))
            .unwrap_or(false)
}

fn read_a2ui_batch(path: &Path) -> Option<SurfaceBatch> {
    let content = std::fs::read_to_string(path).ok()?;
    let batch: SurfaceBatch = serde_json::from_str(&content).ok()?;
    if batch.kind != "a2ui-surface-batch" || batch.session_id.is_empty() {
        return None;
    }
    Some(batch)
}

fn scan_a2ui_batches(session_dir: &Path, known: &mut HashMap<String, Vec<SurfaceBatch>>) {
    if let Ok(entries) = std::fs::read_dir(session_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if is_a2ui_batch_json(&path) {
                if let Some(batch) = read_a2ui_batch(&path) {
                    known
                        .entry(batch.session_id.clone())
                        .or_default()
                        .push(batch);
                }
            }
        }
    }
}

pub fn list_current_a2ui_batches() -> Vec<SurfaceBatch> {
    let dir = a2ui_dir().join("session");
    let mut known: HashMap<String, Vec<SurfaceBatch>> = HashMap::new();
    scan_a2ui_batches(&dir, &mut known);
    let mut all: Vec<SurfaceBatch> = known.into_values().flatten().collect();
    all.sort_by(|a, b| a.seq.cmp(&b.seq));
    all
}

pub fn emit_local_a2ui_batch(
    session_id: &str,
    messages: Vec<serde_json::Value>,
) -> Result<SurfaceBatch, String> {
    let session_id = session_id.trim();
    if session_id.is_empty() {
        return Err("session_id is required".to_string());
    }

    let session_dir = a2ui_dir().join("session");
    std::fs::create_dir_all(&session_dir).map_err(|e| e.to_string())?;

    let next_seq = next_a2ui_seq(&session_dir, session_id);
    let batch = SurfaceBatch {
        kind: "a2ui-surface-batch".to_string(),
        session_id: session_id.to_string(),
        seq: next_seq,
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_secs_f64(),
        messages,
    };

    let path = session_dir.join(format!("{}.{}.json", session_id, next_seq));
    write_json_atomic(&path, &batch)?;
    Ok(batch)
}

fn next_a2ui_seq(session_dir: &Path, session_id: &str) -> u64 {
    let prefix = format!("{session_id}.");
    std::fs::read_dir(session_dir)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.starts_with(&prefix) && name.ends_with(".json"))
        .filter_map(|name| {
            name.strip_prefix(&prefix)
                .and_then(|rest| rest.strip_suffix(".json"))
                .and_then(|seq| seq.parse::<u64>().ok())
        })
        .max()
        .unwrap_or(0)
        + 1
}

fn write_json_atomic<T: Serialize>(path: &Path, payload: &T) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "target path has no parent directory".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    let tmp_path = parent.join(format!(".{}.tmp", uuid::Uuid::new_v4()));
    let body = serde_json::to_vec_pretty(payload).map_err(|e| e.to_string())?;
    std::fs::write(&tmp_path, body).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, path).map_err(|e| e.to_string())?;
    Ok(())
}

fn a2ui_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("HERMELIN_A2UI_DIR") {
        return PathBuf::from(dir);
    }
    if let Ok(home) = std::env::var("HERMES_HOME") {
        return PathBuf::from(home).join("a2ui-surfaces");
    }
    #[cfg(windows)]
    {
        if let Some(app_data) = std::env::var_os("LOCALAPPDATA") {
            return PathBuf::from(app_data).join("hermes").join("a2ui-surfaces");
        }
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".hermes").join("a2ui-surfaces")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write_artifact(path: &Path, body: &str) {
        fs::write(path, body).expect("write artifact");
    }

    #[test]
    fn list_current_artifacts_filters_to_current_session_but_keeps_legacy() {
        let temp = tempfile::TempDir::new().expect("temp dir");
        let root = temp.path();
        let session_dir = root.join("session");
        fs::create_dir_all(&session_dir).expect("session dir");

        write_artifact(
            &session_dir.join("alpha.json"),
            r#"{"id":"alpha","type":"table","title":"Alpha","timestamp":3,"session_id":"sess-a"}"#,
        );
        write_artifact(
            &session_dir.join("beta.json"),
            r#"{"id":"beta","type":"table","title":"Beta","timestamp":2,"session_id":"sess-b"}"#,
        );
        write_artifact(
            &session_dir.join("legacy.json"),
            r#"{"id":"legacy","type":"table","title":"Legacy","timestamp":1}"#,
        );

        std::env::set_var("HERMELIN_ARTIFACT_DIR", root);
        let visible = list_current_artifacts_for_session(Some("sess-a"));
        std::env::remove_var("HERMELIN_ARTIFACT_DIR");

        let ids: Vec<String> = visible.into_iter().map(|artifact| artifact.id).collect();
        assert_eq!(ids, vec!["alpha".to_string(), "legacy".to_string()]);
    }

    #[test]
    fn emit_local_a2ui_batch_persists_and_lists_transport_batches() {
        let temp = tempfile::TempDir::new().expect("temp dir");
        let root = temp.path();
        let session_dir = root.join("session");
        fs::create_dir_all(&session_dir).expect("session dir");

        std::env::set_var("HERMELIN_A2UI_DIR", root);
        let batch = emit_local_a2ui_batch(
            "sess-local",
            vec![serde_json::json!({
                "version": "v0.9",
                "createSurface": {
                    "surfaceId": "mcp_app_coedit_proof",
                    "catalogId": "aurora-chat://catalog/v0.1.json"
                }
            })],
        )
        .expect("emit local batch");

        let all = list_current_a2ui_batches();
        std::env::remove_var("HERMELIN_A2UI_DIR");

        assert_eq!(batch.kind, "a2ui-surface-batch");
        assert_eq!(batch.session_id, "sess-local");
        assert_eq!(batch.seq, 1);
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].session_id, "sess-local");
        assert_eq!(
            all[0].messages[0]["createSurface"]["surfaceId"],
            "mcp_app_coedit_proof"
        );
    }

    #[test]
    fn emit_local_a2ui_batch_increments_seq_per_session() {
        let temp = tempfile::TempDir::new().expect("temp dir");
        let root = temp.path();
        let session_dir = root.join("session");
        fs::create_dir_all(&session_dir).expect("session dir");

        std::env::set_var("HERMELIN_A2UI_DIR", root);
        let first = emit_local_a2ui_batch("sess-local", vec![]).expect("first batch");
        let second = emit_local_a2ui_batch("sess-local", vec![]).expect("second batch");
        std::env::remove_var("HERMELIN_A2UI_DIR");

        assert_eq!(first.seq, 1);
        assert_eq!(second.seq, 2);
    }
}
