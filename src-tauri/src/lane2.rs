use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri::Manager as _;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResidentStance {
    Attending,
    Drafting,
    Building,
    Remembering,
    Waiting,
    Invoking,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FocusTargetKind {
    Surface,
    Thread,
    Memory,
    Artifact,
    Invocation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FocusTarget {
    pub kind: FocusTargetKind,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResidentState {
    pub resident_id: String,
    pub stance: ResidentStance,
    pub active_thread_id: Option<String>,
    pub focus_target: Option<FocusTarget>,
    pub active_surface_ids: Vec<String>,
    pub held_context_ids: Vec<String>,
    pub active_invocation_id: Option<String>,
    pub session_id: Option<String>,
    pub workspace_id: String,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InvocationKind {
    Tool,
    Subagent,
    ExternalCli,
    Background,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InvocationStatus {
    Pending,
    Active,
    Suspended,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspacePaneId {
    Plan,
    Tasks,
    Surfaces,
    Artifacts,
    Context,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum WorkspacePaneLayout {
    Hidden,
    Single {
        #[serde(alias = "primaryPane")]
        primary_pane: WorkspacePaneId,
    },
    Stacked {
        #[serde(alias = "primaryPane")]
        primary_pane: WorkspacePaneId,
        #[serde(alias = "secondaryPane")]
        secondary_pane: WorkspacePaneId,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InvocationContextRef {
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InvocationEnvelope {
    pub invocation_id: String,
    pub kind: InvocationKind,
    pub target: String,
    pub summary: Option<String>,
    pub recovery_action_label: Option<String>,
    pub initiated_by: String,
    pub workspace_id: String,
    pub session_id: Option<String>,
    pub surface_id: Option<String>,
    pub thread_id: Option<String>,
    pub context_refs: Vec<InvocationContextRef>,
    pub status: InvocationStatus,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceSurfaceStatus {
    Active,
    Suspended,
    Stale,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSurface {
    pub surface_id: String,
    pub surface_kind: String,
    pub title: String,
    pub workspace_id: String,
    pub session_id: Option<String>,
    pub created_by: String,
    pub held_by: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    pub status: WorkspaceSurfaceStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceBinding {
    pub bound_entity_id: Option<String>,
    pub bound_workstream_id: Option<String>,
    pub bound_artifact_ids: Vec<String>,
    pub bound_memory_refs: Vec<String>,
    pub bound_invocation_ids: Vec<String>,
    pub bound_session_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceLineage {
    pub parent_surface_id: Option<String>,
    pub derived_from_surface_id: Option<String>,
    pub supersedes_surface_id: Option<String>,
    pub related_surface_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceRuntimeState {
    pub revision: u64,
    pub current_state: HashMap<String, serde_json::Value>,
    pub pending_outbound: Option<serde_json::Value>,
    pub pending_inbound: Option<serde_json::Value>,
    pub local_attention: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum UnresolvedTargetReason {
    WaitingForTool,
    DraftInProgress,
    CoeditOpen,
    SessionBooting,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnresolvedTarget {
    pub kind: FocusTargetKind,
    pub id: String,
    pub reason: Option<UnresolvedTargetReason>,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAttention {
    pub primary_focus: Option<FocusTarget>,
    pub background_holdings: Vec<FocusTarget>,
    pub pinned_targets: Vec<FocusTarget>,
    pub unresolved_targets: Vec<UnresolvedTarget>,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceContinuityState {
    pub last_active_surface_id: Option<String>,
    pub pinned_surface_ids: Vec<String>,
    pub suspended_surface_ids: Vec<String>,
    pub active_thread_id: Option<String>,
    pub local_anchor_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkspaceChromeState {
    pub sidebar_open: bool,
    pub sidebar_width: u64,
    pub artifact_panel_open: bool,
    pub artifact_panel_width: u64,
    pub active_artifact_id: Option<String>,
    pub pinned_surface_id: Option<String>,
    pub right_rail: Option<WorkspacePaneLayout>,
}

impl Default for WorkspaceChromeState {
    fn default() -> Self {
        Self {
            sidebar_open: false,
            sidebar_width: 280,
            artifact_panel_open: false,
            artifact_panel_width: 420,
            active_artifact_id: None,
            pinned_surface_id: None,
            right_rail: Some(WorkspacePaneLayout::Hidden),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub workspace_id: String,
    pub resident: ResidentState,
    pub attention: WorkspaceAttention,
    pub surfaces: HashMap<String, WorkspaceSurface>,
    pub bindings: HashMap<String, SurfaceBinding>,
    pub lineage: HashMap<String, SurfaceLineage>,
    pub runtime: HashMap<String, SurfaceRuntimeState>,
    pub invocations: HashMap<String, InvocationEnvelope>,
    pub continuity: WorkspaceContinuityState,
    #[serde(default)]
    pub chrome: WorkspaceChromeState,
    pub updated_at: u64,
}

pub fn create_empty_workspace_state(
    workspace_id: &str,
    session_id: Option<&str>,
) -> WorkspaceState {
    let now = 0;
    WorkspaceState {
        workspace_id: workspace_id.to_string(),
        resident: ResidentState {
            resident_id: "aurora".to_string(),
            stance: ResidentStance::Attending,
            active_thread_id: None,
            focus_target: None,
            active_surface_ids: vec![],
            held_context_ids: vec![],
            active_invocation_id: None,
            session_id: session_id.map(|s| s.to_string()),
            workspace_id: workspace_id.to_string(),
            updated_at: now,
        },
        attention: WorkspaceAttention {
            primary_focus: None,
            background_holdings: vec![],
            pinned_targets: vec![],
            unresolved_targets: vec![],
            updated_at: now,
        },
        surfaces: HashMap::new(),
        bindings: HashMap::new(),
        lineage: HashMap::new(),
        runtime: HashMap::new(),
        invocations: HashMap::new(),
        continuity: WorkspaceContinuityState::default(),
        chrome: WorkspaceChromeState {
            sidebar_open: false,
            sidebar_width: 280,
            artifact_panel_open: false,
            artifact_panel_width: 420,
            active_artifact_id: None,
            pinned_surface_id: None,
            right_rail: Some(WorkspacePaneLayout::Hidden),
        },
        updated_at: now,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStoreData {
    pub active_workspace_id: Option<String>,
    pub workspaces: HashMap<String, WorkspaceState>,
}

pub struct Lane2StoreLock(pub Mutex<()>);

fn lane2_store_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let lane2_dir = dir.join("lane2");
    let _ = std::fs::create_dir_all(&lane2_dir);
    lane2_dir
}

fn lane2_store_path(app: &AppHandle) -> PathBuf {
    lane2_store_dir(app).join("workspaces.json")
}

fn lane2_lock_path(path: &Path) -> PathBuf {
    path.with_extension("json.lock")
}

struct Lane2FileGuard {
    path: PathBuf,
}

impl Drop for Lane2FileGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

fn acquire_lane2_file_guard(path: &Path) -> Result<Lane2FileGuard, String> {
    let lock_path = lane2_lock_path(path);
    let deadline = Instant::now() + Duration::from_secs(5);

    loop {
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock_path)
        {
            Ok(_) => return Ok(Lane2FileGuard { path: lock_path }),
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
                if Instant::now() >= deadline {
                    return Err(format!("Timed out waiting for lane2 file lock {}", lock_path.display()));
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(err) => {
                return Err(format!("Failed to acquire lane2 file lock {}: {err}", lock_path.display()));
            }
        }
    }
}

fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let dir = path.parent().ok_or("No parent directory")?;
    std::fs::create_dir_all(dir)
        .map_err(|e| format!("Failed to create directory {}: {e}", dir.display()))?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir)
        .map_err(|e| format!("Failed to create temp file: {e}"))?;
    tmp.write_all(data)
        .map_err(|e| format!("Failed to write temp file: {e}"))?;
    tmp.flush()
        .map_err(|e| format!("Failed to flush temp file: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(tmp.path(), std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set permissions: {e}"))?;
    }

    tmp.persist(path)
        .map_err(|e| format!("Failed to rename temp file: {e}"))?;
    Ok(())
}

pub fn read_workspace_store_from_path(path: &Path) -> WorkspaceStoreData {
    if !path.exists() {
        return WorkspaceStoreData::default();
    }
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn write_workspace_store_to_path(path: &Path, data: &WorkspaceStoreData) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize lane2 workspace data: {e}"))?;
    atomic_write(path, json.as_bytes())
}

pub fn read_workspace_store(app: &AppHandle) -> WorkspaceStoreData {
    read_workspace_store_from_path(&lane2_store_path(app))
}

pub fn write_workspace_store(app: &AppHandle, data: &WorkspaceStoreData) -> Result<(), String> {
    write_workspace_store_to_path(&lane2_store_path(app), data)
}

#[tauri::command]
pub fn lane2_get_active_workspace(
    app: AppHandle,
    lock: State<'_, Lane2StoreLock>,
) -> Result<Option<WorkspaceState>, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = lane2_store_path(&app);
    let _file_guard = acquire_lane2_file_guard(&path)?;
    let data = read_workspace_store_from_path(&path);
    Ok(data
        .active_workspace_id
        .as_ref()
        .and_then(|id| data.workspaces.get(id).cloned()))
}

#[tauri::command]
pub fn lane2_list_workspaces(
    app: AppHandle,
    lock: State<'_, Lane2StoreLock>,
) -> Result<Vec<WorkspaceState>, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = lane2_store_path(&app);
    let _file_guard = acquire_lane2_file_guard(&path)?;
    let data = read_workspace_store_from_path(&path);
    Ok(data.workspaces.into_values().collect())
}

#[tauri::command]
pub fn lane2_upsert_workspace(
    app: AppHandle,
    lock: State<'_, Lane2StoreLock>,
    workspace: WorkspaceState,
    make_active: Option<bool>,
) -> Result<WorkspaceState, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = lane2_store_path(&app);
    let _file_guard = acquire_lane2_file_guard(&path)?;
    let mut data = read_workspace_store_from_path(&path);
    let workspace_id = workspace.workspace_id.clone();
    data.workspaces
        .insert(workspace_id.clone(), workspace.clone());
    if make_active.unwrap_or(false) || data.active_workspace_id.is_none() {
        data.active_workspace_id = Some(workspace_id);
    }
    write_workspace_store_to_path(&path, &data)?;
    Ok(workspace)
}

#[tauri::command]
pub fn lane2_set_active_workspace(
    app: AppHandle,
    lock: State<'_, Lane2StoreLock>,
    workspace_id: String,
) -> Result<(), String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = lane2_store_path(&app);
    let _file_guard = acquire_lane2_file_guard(&path)?;
    let mut data = read_workspace_store_from_path(&path);
    if !data.workspaces.contains_key(&workspace_id) {
        return Err(format!("Workspace '{workspace_id}' not found"));
    }
    data.active_workspace_id = Some(workspace_id);
    write_workspace_store_to_path(&path, &data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn create_empty_workspace_state_seeds_aurora_resident() {
        let state = create_empty_workspace_state("ws-1", Some("sess-1"));
        assert_eq!(state.workspace_id, "ws-1");
        assert_eq!(state.resident.resident_id, "aurora");
        assert_eq!(state.resident.session_id.as_deref(), Some("sess-1"));
        assert!(state.attention.primary_focus.is_none());
        assert!(!state.chrome.sidebar_open);
        assert_eq!(state.chrome.sidebar_width, 280);
        assert!(!state.chrome.artifact_panel_open);
        assert_eq!(state.chrome.artifact_panel_width, 420);
        assert!(state.chrome.active_artifact_id.is_none());
        assert!(state.chrome.pinned_surface_id.is_none());
    }

    #[test]
    fn invocation_envelope_serializes_camel_case_fields() {
        let invocation = InvocationEnvelope {
            invocation_id: "inv-1".to_string(),
            kind: InvocationKind::Subagent,
            target: "delegate_task".to_string(),
            summary: Some("Working in surface surface-a".to_string()),
            recovery_action_label: Some("Resume thread sess-1".to_string()),
            initiated_by: "aurora".to_string(),
            workspace_id: "ws-1".to_string(),
            session_id: None,
            surface_id: None,
            thread_id: None,
            context_refs: vec![],
            status: InvocationStatus::Pending,
            created_at: 1,
            updated_at: 1,
        };

        let value = serde_json::to_value(&invocation).expect("serialize invocation");
        assert_eq!(value["invocationId"], "inv-1");
        assert_eq!(value["workspaceId"], "ws-1");
        assert_eq!(value["initiatedBy"], "aurora");
    }

    #[test]
    fn workspace_store_round_trip_persists_active_workspace() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("workspaces.json");
        let workspace = create_empty_workspace_state("ws-1", Some("sess-1"));
        let data = WorkspaceStoreData {
            active_workspace_id: Some("ws-1".to_string()),
            workspaces: HashMap::from([("ws-1".to_string(), workspace.clone())]),
        };

        write_workspace_store_to_path(&path, &data).expect("write workspace store");
        let restored = read_workspace_store_from_path(&path);

        assert_eq!(restored.active_workspace_id.as_deref(), Some("ws-1"));
        assert_eq!(restored.workspaces.get("ws-1"), Some(&workspace));
    }

    #[test]
    fn lane2_fixture_parses_contract_shape() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../v2/src/lane2/__fixtures__/workspace-state.json");
        let fixture = std::fs::read_to_string(&fixture_path).expect("read lane2 fixture");
        let workspace: WorkspaceState = serde_json::from_str(&fixture).expect("deserialize lane2 fixture");

        let unresolved = workspace.attention.unresolved_targets.first().expect("unresolved target");
        assert_eq!(unresolved.reason, Some(UnresolvedTargetReason::DraftInProgress));
        assert_eq!(unresolved.label.as_deref(), Some("Draft in progress"));
        assert_eq!(workspace.chrome.right_rail, Some(WorkspacePaneLayout::Single { primary_pane: WorkspacePaneId::Surfaces }));
    }
}
