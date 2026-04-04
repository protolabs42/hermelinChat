import { create } from 'zustand'
import type { AcpEvent } from '../types/acp'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'thinking' | 'tool' | 'system'
  content: string
  timestamp: number
  toolId?: string
  toolTitle?: string
  toolKind?: string
  toolStatus?: string
}

export interface ChatStore {
  messages: ChatMessage[]
  sessionId: string | null
  isStreaming: boolean
  connectionStatus: string
  pendingPrompt: string | null

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
        set((s) => {
          const msgs = [...s.messages]
          const last = msgs[msgs.length - 1]
          if (last && last.role === 'assistant') {
            msgs[msgs.length - 1] = { ...last, content: last.content + event.text }
          } else {
            msgs.push({ id: genId(), role: 'assistant', content: event.text, timestamp: Date.now() })
          }
          return { messages: msgs }
        })
        break
      }

      case 'AgentThinking': {
        set((s) => {
          const msgs = [...s.messages]
          const last = msgs[msgs.length - 1]
          if (last && last.role === 'thinking') {
            msgs[msgs.length - 1] = { ...last, content: last.content + event.text }
          } else {
            msgs.push({ id: genId(), role: 'thinking', content: event.text, timestamp: Date.now() })
          }
          return { messages: msgs }
        })
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
          const msgs = s.messages.map((m) =>
            m.toolId === event.id
              ? { ...m, toolStatus: event.status }
              : m
          )
          return { messages: msgs }
        })
        break
      }

      case 'SessionInfo': {
        const pending = get().pendingPrompt
        set({ sessionId: event.session_id, pendingPrompt: null })
        if (pending) {
          import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke('acp_send_prompt', { sessionId: event.session_id, text: pending })
              .catch((e: unknown) => console.error('Failed to send queued prompt:', e))
          })
        }
        break
      }

      case 'StreamEnd': {
        set({ isStreaming: false })
        break
      }

      case 'ConnectionStatus': {
        if (event.status === 'connected') {
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
    set({ messages: [], sessionId: null, isStreaming: false, pendingPrompt: null })
  },
}))
