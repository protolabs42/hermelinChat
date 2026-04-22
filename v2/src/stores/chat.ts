import { create } from 'zustand'
import { applyHostPatchEnvelope, parseCoeditPatchMarkers } from '../a2ui/mcp-app/coedit-bridge'
import type { AcpEvent } from '../types/acp'
import { persistSurfaceAnchor } from '../a2ui/surface-anchors'

// Streaming text buffer — batches rapid chunks into fewer React updates
let _textBuffer = ''
let _textRole: 'assistant' | 'thinking' = 'assistant'
let _flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL = 50 // ms

function clearStreamBuffer() {
  _textBuffer = ''
  _textRole = 'assistant'
  if (_flushTimer) {
    clearTimeout(_flushTimer)
    _flushTimer = null
  }
}

function flushTextBuffer(set: (fn: (s: ChatStore) => Partial<ChatStore>) => void, _get?: () => ChatStore) {
  if (!_textBuffer) return
  const text = _textBuffer
  const role = _textRole
  _textBuffer = ''
  _flushTimer = null
  const pendingPatchEnvelopes: Array<ReturnType<typeof parseCoeditPatchMarkers>[number]['envelope']> = []

  set((s) => {
    const msgs = s.messages.slice()
    const last = msgs[msgs.length - 1]
    if (last && last.role === role) {
      const nextContent = last.content + text
      const nextMessage = { ...last, content: nextContent }
      if (role === 'assistant') {
        const applied = new Set(last.appliedCoeditPatchMarkers ?? [])
        const freshMatches = parseCoeditPatchMarkers(nextContent).filter((match) => !applied.has(match.raw))
        for (const match of freshMatches) {
          applied.add(match.raw)
          pendingPatchEnvelopes.push(match.envelope)
        }
        if (applied.size > 0) {
          nextMessage.appliedCoeditPatchMarkers = Array.from(applied)
        }
      }
      msgs[msgs.length - 1] = nextMessage
    } else {
      const nextMessage: ChatMessage = { id: genId(), role, content: text, timestamp: Date.now() }
      if (role === 'assistant') {
        const freshMatches = parseCoeditPatchMarkers(text)
        if (freshMatches.length > 0) {
          nextMessage.appliedCoeditPatchMarkers = freshMatches.map((match) => match.raw)
          for (const match of freshMatches) {
            pendingPatchEnvelopes.push(match.envelope)
          }
        }
      }
      msgs.push(nextMessage)
    }
    return { messages: msgs }
  })

  for (const envelope of pendingPatchEnvelopes) {
    void applyHostPatchEnvelope(envelope)
  }
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

function eventSessionId(event: AcpEvent): string | null {
  if ('session_id' in event) {
    return event.session_id ?? null
  }
  return null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'thinking' | 'tool' | 'system' | 'surface'
  content: string
  timestamp: number
  toolId?: string
  toolTitle?: string
  toolKind?: string
  toolStatus?: string
  diffPath?: string
  diffOld?: string | null
  diffNew?: string
  appliedCoeditPatchMarkers?: string[]
  /** For role='surface': id of the A2UI surface to render inline here. */
  surfaceId?: string
}

export interface UsageInfo {
  used: number
  size: number
  costUsd: number | null
}

export interface ChatStore {
  messages: ChatMessage[]
  sessionId: string | null
  model: string | null
  isStreaming: boolean
  connectionStatus: string
  pendingPrompt: string | null
  usage: UsageInfo | null

  addUserMessage: (text: string) => void
  /** Inject a surface anchor into the chat stream. Phase 4. */
  addSurfaceAnchor: (surfaceId: string) => void
  restoreSurfaceAnchors: (surfaceIds: string[]) => void
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
  model: null,
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

  addSurfaceAnchor: (surfaceId: string) => {
    set((s) => {
      // Don't double-anchor the same surface — re-renders from the store's
      // revision bump already live-update the mounted component.
      if (s.messages.some((m) => m.role === 'surface' && m.surfaceId === surfaceId)) {
        return {}
      }
      // Flush any pending streaming text first so the surface anchors
      // below whatever Aurora just said, not inside a half-built bubble.
      if (_textBuffer) {
        flushTextBuffer(set)
      }
      const timestamp = Date.now()
      // Persist so the anchor survives aurora-chat restarts. The surface
      // data itself stays on disk (hermes JSON files); this just records
      // where in the message stream it belongs.
      const sid = s.sessionId
      if (sid) {
        persistSurfaceAnchor(sid, surfaceId, timestamp)
      }
      return {
        messages: [...s.messages, {
          id: genId(),
          role: 'surface' as const,
          content: '',
          timestamp,
          surfaceId,
        }],
      }
    })
  },

  restoreSurfaceAnchors: (surfaceIds: string[]) => {
    set((s) => {
      const existingIds = new Set(
        s.messages
          .filter((m) => m.role === 'surface' && typeof m.surfaceId === 'string')
          .map((m) => m.surfaceId as string)
      )
      const missing = surfaceIds.filter((surfaceId) => !existingIds.has(surfaceId))
      if (missing.length === 0) return {}
      const baseTimestamp = s.messages.length > 0
        ? Math.max(...s.messages.map((m) => m.timestamp))
        : Date.now()
      const anchors = missing.map((surfaceId, idx) => ({
        id: genId(),
        role: 'surface' as const,
        content: '',
        timestamp: baseTimestamp + idx + 1,
        surfaceId,
      }))
      return { messages: [...s.messages, ...anchors] }
    })
  },

  handleAcpEvent: (event: AcpEvent) => {
    const currentSessionId = get().sessionId
    const incomingSessionId = eventSessionId(event)
    if (
      incomingSessionId
      && currentSessionId
      && incomingSessionId !== currentSessionId
      && event.kind !== 'ConnectionStatus'
      && event.kind !== 'SessionInfo'
    ) {
      return
    }

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
        set({ sessionId: event.session_id, model: event.model ?? null, pendingPrompt: null })
        // Update window title with session ID
        import('@tauri-apps/api/core').then(({ invoke: inv }) => {
          inv('set_window_title', { title: `Aurora Chat — ${event.session_id.slice(0, 12)}` })
            .catch(() => {})
        })
        if (pending && (event.source_op == null || event.source_op === 'session/new')) {
          import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke('acp_send_prompt', { sessionId: event.session_id, text: pending })
              .catch((e: unknown) => console.error('Failed to send queued prompt:', e))
          })
        }

        import('../stores/projects').then(({ useProjectStore }) => {
          const ps = useProjectStore.getState()
          if (ps.activeProjectId) {
            ps.assignSession(event.session_id, ps.activeProjectId)
              .catch((e: unknown) => console.error('[chat] assignSession failed:', e))
          }
        })
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
          set((s) => ({ connectionStatus: event.status, sessionId: s.sessionId, isStreaming: false }))
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
    clearStreamBuffer()
    set({ messages: [], sessionId: null, model: null, isStreaming: false, pendingPrompt: null, usage: null })
  },
}))
