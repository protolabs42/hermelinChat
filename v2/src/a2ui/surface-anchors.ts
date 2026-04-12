/**
 * Surface anchor persistence — remember which surfaces appeared WHERE
 * in a session's message stream so they survive aurora-chat restarts.
 *
 * The surface DATA itself persists on disk (hermes writes JSON files to
 * ~/.hermes/a2ui-surfaces/session/ and the Rust watcher re-scans them on
 * startup). What ISN'T persisted is the chat-side `role: 'surface'`
 * message that tells the message stream where to render a SurfaceAnchor.
 *
 * This module stores a small `{surfaceId, timestamp}` record per anchor
 * per session in localStorage. On session restore, these are merged back
 * into the loaded messages by timestamp so surfaces re-appear at their
 * original position in the conversation.
 *
 * localStorage is fine for this data: a few dozen bytes per anchor,
 * hundreds of sessions would still be under 50KB.
 */

const STORAGE_PREFIX = 'aurora.surface-anchors.'

interface PersistedAnchor {
  surfaceId: string
  timestamp: number
}

function storageKey(sessionId: string): string {
  return STORAGE_PREFIX + sessionId
}

/** Append a new surface anchor for the given session. */
export function persistSurfaceAnchor(
  sessionId: string,
  surfaceId: string,
  timestamp: number
): void {
  if (typeof localStorage === 'undefined') return
  const key = storageKey(sessionId)
  const existing = loadAnchors(sessionId)
  // Don't double-persist the same surfaceId
  if (existing.some((a) => a.surfaceId === surfaceId)) return
  existing.push({ surfaceId, timestamp })
  localStorage.setItem(key, JSON.stringify(existing))
}

/** Load all persisted surface anchors for a session. */
export function loadAnchors(sessionId: string): PersistedAnchor[] {
  if (typeof localStorage === 'undefined') return []
  const key = storageKey(sessionId)
  const raw = localStorage.getItem(key)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (a: unknown): a is PersistedAnchor =>
        !!a &&
        typeof a === 'object' &&
        typeof (a as PersistedAnchor).surfaceId === 'string' &&
        typeof (a as PersistedAnchor).timestamp === 'number'
    )
  } catch {
    return []
  }
}

/** Remove all persisted anchors for a session (e.g. on session delete). */
export function clearAnchors(sessionId: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(storageKey(sessionId))
}
