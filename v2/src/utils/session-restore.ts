import type { ChatMessage } from '../stores/chat'

/**
 * Raw row shape returned by the Rust `get_session_messages` command.
 * Mirrors sessions.rs::SessionMessage — keep in sync.
 */
export interface SessionRow {
  id: number
  role: string
  content: string | null
  timestamp: number | null // unix seconds (sqlite REAL)
  reasoning: string | null
  tool_calls: string | null // JSON array string
  tool_call_id: string | null
  tool_name: string | null
}

/** A2UI surface anchor stored in localStorage per session. */
export interface SurfaceAnchor {
  surfaceId: string
  timestamp: number // ms since epoch
}

interface ToolCallEntry {
  id: string
  name: string
  arguments?: unknown
}

function parseToolCalls(raw: string | null): ToolCallEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is ToolCallEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as { id?: unknown }).id === 'string' &&
        typeof (e as { name?: unknown }).name === 'string'
    )
  } catch {
    return []
  }
}

function extractToolResultText(raw: string | null): string {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as { output?: unknown; error?: unknown }
      if (typeof obj.output === 'string') return obj.output
      if (typeof obj.error === 'string' && obj.error) return obj.error
    }
  } catch {
    // content isn't JSON — return raw
  }
  return raw
}

/**
 * Reconstruct the ChatMessage list for a session from persisted DB rows and
 * optional A2UI surface anchors. See tests for exact semantics.
 */
export function sessionRowsToMessages(
  rows: SessionRow[],
  anchors: SurfaceAnchor[] = []
): ChatMessage[] {
  const messages: ChatMessage[] = []
  const toolIndex = new Map<string, number>()

  for (const row of rows) {
    const ts = row.timestamp != null ? row.timestamp * 1000 : Date.now()

    if (row.role === 'user') {
      if (row.content && row.content.trim()) {
        messages.push({
          id: `hist-${row.id}`,
          role: 'user',
          content: row.content,
          timestamp: ts,
        })
      }
      continue
    }

    if (row.role === 'assistant') {
      if (row.reasoning && row.reasoning.trim()) {
        messages.push({
          id: `hist-${row.id}-thinking`,
          role: 'thinking',
          content: row.reasoning,
          timestamp: ts,
        })
      }
      if (row.content && row.content.trim()) {
        messages.push({
          id: `hist-${row.id}`,
          role: 'assistant',
          content: row.content,
          timestamp: ts,
        })
      }
      const calls = parseToolCalls(row.tool_calls)
      for (let idx = 0; idx < calls.length; idx++) {
        const call = calls[idx]
        messages.push({
          id: `hist-${row.id}-tool-${idx}`,
          role: 'tool',
          content: '',
          timestamp: ts,
          toolId: call.id,
          toolTitle: call.name,
          toolKind: 'function',
          toolStatus: 'running',
        })
        toolIndex.set(call.id, messages.length - 1)
      }
      continue
    }

    if (row.role === 'tool') {
      const outputText = extractToolResultText(row.content)
      const callId = row.tool_call_id
      if (callId && toolIndex.has(callId)) {
        const idx = toolIndex.get(callId)!
        messages[idx] = {
          ...messages[idx],
          content: outputText,
          toolStatus: 'completed',
        }
      } else {
        messages.push({
          id: `hist-${row.id}-orphan`,
          role: 'tool',
          content: outputText,
          timestamp: ts,
          toolId: callId ?? undefined,
          toolTitle: row.tool_name ?? 'tool',
          toolKind: 'function',
          toolStatus: 'completed',
        })
      }
      continue
    }

    // unknown role — skip silently
  }

  if (anchors.length === 0) return messages

  const merged: ChatMessage[] = []
  let anchorIdx = 0
  for (const msg of messages) {
    while (anchorIdx < anchors.length && anchors[anchorIdx].timestamp <= msg.timestamp) {
      const a = anchors[anchorIdx]
      merged.push({
        id: `surface-${a.surfaceId}`,
        role: 'surface',
        content: '',
        timestamp: a.timestamp,
        surfaceId: a.surfaceId,
      })
      anchorIdx++
    }
    merged.push(msg)
  }
  while (anchorIdx < anchors.length) {
    const a = anchors[anchorIdx]
    merged.push({
      id: `surface-${a.surfaceId}`,
      role: 'surface',
      content: '',
      timestamp: a.timestamp,
      surfaceId: a.surfaceId,
    })
    anchorIdx++
  }
  return merged
}
