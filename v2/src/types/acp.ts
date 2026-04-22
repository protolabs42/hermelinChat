export type AcpEvent =
  | { kind: 'AgentThinking'; session_id?: string | null; text: string }
  | { kind: 'AgentMessage'; session_id?: string | null; text: string }
  | { kind: 'ToolCallStarted'; session_id?: string | null; id: string; title: string; tool_kind: string }
  | { kind: 'ToolCallUpdate'; session_id?: string | null; id: string; status: string; content: ToolContent[] }
  | { kind: 'DiffProposed'; session_id?: string | null; tool_call_id: string; path: string; old_text: string | null; new_text: string }
  | { kind: 'TerminalOutput'; session_id?: string | null; tool_call_id: string; command: string; output: string }
  | { kind: 'ApprovalRequested'; session_id?: string | null; id: string; description: string; command: string; options: ApprovalOption[] }
  | { kind: 'UsageUpdate'; session_id?: string | null; used: number; size: number; cost_usd: number | null }
  | { kind: 'SessionInfo'; session_id: string; model: string | null; request_id?: number | null; source_op?: string | null }
  | { kind: 'StreamEnd'; session_id?: string | null; request_id?: number | null; source_op?: string | null }
  | { kind: 'ConnectionStatus'; status: string; message: string | null }

export interface ToolContent {
  type: 'text' | 'diff'
  text?: string
  path?: string
  old_text?: string | null
  new_text?: string
}

export interface ApprovalOption {
  id: string
  label: string
}
