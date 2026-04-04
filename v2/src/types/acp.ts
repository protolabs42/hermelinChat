export type AcpEvent =
  | { kind: 'AgentThinking'; text: string }
  | { kind: 'AgentMessage'; text: string }
  | { kind: 'ToolCallStarted'; id: string; title: string; tool_kind: string }
  | { kind: 'ToolCallUpdate'; id: string; status: string; content: ToolContent[] }
  | { kind: 'DiffProposed'; tool_call_id: string; path: string; old_text: string | null; new_text: string }
  | { kind: 'TerminalOutput'; tool_call_id: string; command: string; output: string }
  | { kind: 'ApprovalRequested'; id: string; description: string; command: string; options: ApprovalOption[] }
  | { kind: 'UsageUpdate'; used: number; size: number; cost_usd: number | null }
  | { kind: 'SessionInfo'; session_id: string; model: string | null }
  | { kind: 'StreamEnd' }
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
