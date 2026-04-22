use serde::{Deserialize, Serialize};

/// Domain events emitted to the frontend via Tauri events.
/// Each variant maps to one or more ACP session_update types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum AcpEvent {
    /// Streaming thinking text
    AgentThinking { session_id: Option<String>, text: String },

    /// Streaming message text
    AgentMessage { session_id: Option<String>, text: String },

    /// Tool call started
    ToolCallStarted {
        session_id: Option<String>,
        id: String,
        title: String,
        tool_kind: String,
    },

    /// Tool call updated (progress, completion)
    ToolCallUpdate {
        session_id: Option<String>,
        id: String,
        status: String,
        content: Vec<ToolContent>,
    },

    /// File diff proposed (from tool call content)
    DiffProposed {
        session_id: Option<String>,
        tool_call_id: String,
        path: String,
        old_text: Option<String>,
        new_text: String,
    },

    /// Terminal output (from tool call content)
    TerminalOutput {
        session_id: Option<String>,
        tool_call_id: String,
        command: String,
        output: String,
    },

    /// Approval requested
    ApprovalRequested {
        session_id: Option<String>,
        id: String,
        description: String,
        command: String,
        options: Vec<ApprovalOption>,
    },

    /// Token usage update
    UsageUpdate {
        session_id: Option<String>,
        used: u64,
        size: u64,
        cost_usd: Option<f64>,
    },

    /// Session info
    SessionInfo {
        session_id: String,
        model: Option<String>,
        request_id: Option<u64>,
        source_op: Option<String>,
    },

    /// Stream completed
    StreamEnd {
        session_id: Option<String>,
        request_id: Option<u64>,
        source_op: Option<String>,
    },

    /// Connection status change
    ConnectionStatus { status: String, message: Option<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ToolContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "diff")]
    Diff {
        path: String,
        old_text: Option<String>,
        new_text: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalOption {
    pub id: String,
    pub label: String,
}
