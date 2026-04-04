use serde::{Deserialize, Serialize};

/// Domain events emitted to the frontend via Tauri events.
/// Each variant maps to one or more ACP session_update types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum AcpEvent {
    /// Streaming thinking text
    AgentThinking { text: String },

    /// Streaming message text
    AgentMessage { text: String },

    /// Tool call started
    ToolCallStarted {
        id: String,
        title: String,
        tool_kind: String,
    },

    /// Tool call updated (progress, completion)
    ToolCallUpdate {
        id: String,
        status: String,
        content: Vec<ToolContent>,
    },

    /// File diff proposed (from tool call content)
    DiffProposed {
        tool_call_id: String,
        path: String,
        old_text: Option<String>,
        new_text: String,
    },

    /// Terminal output (from tool call content)
    TerminalOutput {
        tool_call_id: String,
        command: String,
        output: String,
    },

    /// Approval requested
    ApprovalRequested {
        id: String,
        description: String,
        command: String,
        options: Vec<ApprovalOption>,
    },

    /// Token usage update
    UsageUpdate {
        used: u64,
        size: u64,
        cost_usd: Option<f64>,
    },

    /// Session info
    SessionInfo {
        session_id: String,
        model: Option<String>,
    },

    /// Stream completed
    StreamEnd,

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
