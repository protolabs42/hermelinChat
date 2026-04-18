use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAttention {
    pub primary_focus: Option<FocusTarget>,
    pub background_holdings: Vec<FocusTarget>,
    pub pinned_targets: Vec<FocusTarget>,
    pub unresolved_targets: Vec<FocusTarget>,
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
    pub updated_at: u64,
}

pub fn create_empty_workspace_state(workspace_id: &str, session_id: Option<&str>) -> WorkspaceState {
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
        updated_at: now,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_empty_workspace_state_seeds_aurora_resident() {
        let state = create_empty_workspace_state("ws-1", Some("sess-1"));
        assert_eq!(state.workspace_id, "ws-1");
        assert_eq!(state.resident.resident_id, "aurora");
        assert_eq!(state.resident.session_id.as_deref(), Some("sess-1"));
        assert!(state.attention.primary_focus.is_none());
    }

    #[test]
    fn invocation_envelope_serializes_camel_case_fields() {
        let invocation = InvocationEnvelope {
            invocation_id: "inv-1".to_string(),
            kind: InvocationKind::Subagent,
            target: "delegate_task".to_string(),
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
}
