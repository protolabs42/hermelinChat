import { create } from 'zustand'
import type { AcpEvent } from '../types/acp'

// Streaming text buffer — batches rapid chunks into fewer React updates
let _textBuffer = ''
let _textRole: 'assistant' | 'thinking' = 'assistant'
let _flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL = 50 // ms

function flushTextBuffer(set: (fn: (s: ChatStore) => Partial<ChatStore>) => void, _get?: () => ChatStore) {
  if (!_textBuffer) return
  const text = _textBuffer
  const role = _textRole
  _textBuffer = ''
  _flushTimer = null

  set((s) => {
    const msgs = s.messages.slice()
    const last = msgs[msgs.length - 1]
    if (last && last.role === role) {
      msgs[msgs.length - 1] = { ...last, content: last.content + text }
    } else {
      msgs.push({ id: genId(), role, content: text, timestamp: Date.now() })
    }
    return { messages: msgs }
  })
}

function bufferText(text: string, role: 'assistant' | 'thinking', set: (fn: (s: ChatStore) => Partial<ChatStore>) => void, _get?: () => ChatStore) {
  // If role changed, flush the old buffer first
  if (_textBuffer && _textRole !== role) {
    flushTextBuffer(set)
  }
  _textRole = role
  _textBuffer += text
  if (!_flushTimer) {
    _flushTimer = setTimeout(() => flushTextBuffer(set), FLUSH_INTERVAL)
  }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'thinking' | 'tool' | 'system'
  content: string
  timestamp: number
  toolId?: string
  toolTitle?: string
  toolKind?: string
  toolStatus?: string
  diffPath?: string
  diffOld?: string | null
  diffNew?: string
}

export interface UsageInfo {
  used: number
  size: number
  costUsd: number | null
}

export interface ChatStore {
  messages: ChatMessage[]
  sessionId: string | null
  isStreaming: boolean
  connectionStatus: string
  pendingPrompt: string | null
  usage: UsageInfo | null

  addUserMessage: (text: string) => void
  handleAcpEvent: (event: AcpEvent) => void
  setSessionId: (id: string) => void
  setPendingPrompt: (text: string | null) => void
  reset: () => void
}

let _nextId = 0
const genId = () => `msg-${++_nextId}-${Date.now()}`

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  sessionId: null,
  isStreaming: false,
  connectionStatus: 'connecting',
  pendingPrompt: null,
  usage: null,

  addUserMessage: (text: string) => {
    set((s) => ({
      messages: [...s.messages, {
        id: genId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      }],
      isStreaming: true,
    }))
  },

  handleAcpEvent: (event: AcpEvent) => {
    switch (event.kind) {
      case 'AgentMessage': {
        bufferText(event.text, 'assistant', set)
        break
      }

      case 'AgentThinking': {
        bufferText(event.text, 'thinking', set)
        break
      }

      case 'ToolCallStarted': {
        set((s) => ({
          messages: [...s.messages, {
            id: genId(),
            role: 'tool' as const,
            content: '',
            timestamp: Date.now(),
            toolId: event.id,
            toolTitle: event.title,
            toolKind: event.tool_kind,
            toolStatus: 'running',
          }],
        }))
        break
      }

      case 'ToolCallUpdate': {
        set((s) => {
          const msgs = s.messages.map((m) => {
            if (m.toolId !== event.id) return m
            const outputText = event.content
              ?.filter((c: { type: string }) => c.type === 'text')
              .map((c: { text?: string }) => c.text || '')
              .join('\n') || ''
            return {
              ...m,
              toolStatus: event.status,
              content: m.content ? m.content + outputText : outputText,
            }
          })
          return { messages: msgs }
        })
        break
      }

      case 'DiffProposed': {
        set((s) => ({
          messages: [...s.messages, {
            id: genId(),
            role: 'tool' as const,
            content: '',
            timestamp: Date.now(),
            toolId: event.tool_call_id,
            toolTitle: `patch: ${event.path}`,
            toolKind: 'diff',
            toolStatus: 'completed',
            diffPath: event.path,
            diffOld: event.old_text,
            diffNew: event.new_text,
          }],
        }))
        break
      }

      case 'UsageUpdate': {
        set({ usage: { used: event.used, size: event.size, costUsd: event.cost_usd } })
        break
      }

      case 'SessionInfo': {
        const pending = get().pendingPrompt
        set({ sessionId: event.session_id, pendingPrompt: null })
        // Update window title with session ID
        import('@tauri-apps/api/core').then(({ invoke: inv }) => {
          inv('set_window_title', { title: `Aurora Chat \u2014 ${event.session_id.slice(0, 12)}` })
            .catch(() => {})
        })
        if (pending) {
          import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke('acp_send_prompt', { sessionId: event.session_id, text: pending })
              .catch((e: unknown) => console.error('Failed to send queued prompt:', e))
          })
        }
        break
      }

      case 'StreamEnd': {
        // Flush any buffered text before marking stream complete
        flushTextBuffer(set)
        set({ isStreaming: false })
        break
      }

      case 'ConnectionStatus': {
        if (event.status === 'error' && event.message) {
          // Show error as a system message in chat
          set((s) => ({
            connectionStatus: s.connectionStatus, // don't change connection status for API errors
            isStreaming: false,
            messages: [...s.messages, {
              id: genId(),
              role: 'system' as const,
              content: event.message || 'An error occurred',
              timestamp: Date.now(),
            }],
          }))
        } else if (event.status === 'connected') {
          set({ connectionStatus: event.status, sessionId: null, isStreaming: false })
        } else {
          set({ connectionStatus: event.status, isStreaming: false })
        }
        break
      }

      default:
        break
    }
  },

  setSessionId: (id: string) => set({ sessionId: id }),
  setPendingPrompt: (text: string | null) => set({ pendingPrompt: text }),

  reset: () => {
    _nextId = 0
    set({ messages: [], sessionId: null, isStreaming: false, pendingPrompt: null, usage: null })
  },
}))
