import { useState, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { startFreshSession } from '../app/session-start'
import { restoreSessionIntoActiveWorkspace } from '../app/workspace-lifecycle'
import {
  clampSidebarWidth,
  useSidebarStore,
  type SessionSummary,
} from '../stores/sidebar'
import { useChatStore } from '../stores/chat'
import { useProjectStore, SCRATCHPAD_ID } from '../stores/projects'
import { groupByTime } from '../utils/time-groups'
import ProjectSwitcher from './ProjectSwitcher'

// ── Project header ──────────────────────────────────────────────────────────────

function ProjectHeader({ onClose }: { onClose: () => void }) {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const gitInfo = useProjectStore((s) => s.gitInfo)
  const getActiveProject = useProjectStore((s) => s.getActiveProject)

  const [switcherOpen, setSwitcherOpen] = useState(false)
  const headerRef = useRef<HTMLDivElement>(null)

  const activeProject = getActiveProject() ?? { name: 'Scratchpad', id: SCRATCHPAD_ID, path: '', createdAt: 0, lastOpenedAt: 0, pinned: false }
  const isScratchpad = !activeProjectId || activeProjectId === SCRATCHPAD_ID
  const info = activeProjectId ? gitInfo[activeProjectId] : null

  const handleHeaderClick = () => {
    setSwitcherOpen(true)
  }

  const headerRect = headerRef.current?.getBoundingClientRect() ?? null

  return (
    <>
      <div
        ref={headerRef}
        onClick={handleHeaderClick}
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px 0 16px',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Left: project name + chevron */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            minWidth: 0,
            flex: 1,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: '0.8125rem',
              color: 'var(--color-accent)',
              fontStyle: isScratchpad ? 'italic' : 'normal',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {activeProject.name}
          </span>
          <span
            style={{
              fontSize: '0.625rem',
              color: 'var(--color-muted)',
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ▼
          </span>
        </div>

        {/* Right: git branch + dirty dot + close button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
          }}
        >
          {!isScratchpad && info?.branch && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  color: 'var(--color-success)',
                  whiteSpace: 'nowrap',
                  maxWidth: 80,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {info.branch}
              </span>
              {info.dirty && (
                <div
                  title="Uncommitted changes"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--color-warning)',
                    flexShrink: 0,
                  }}
                />
              )}
            </div>
          )}

          {/* Close button — stop propagation so it doesn't open the switcher */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            title="Close sidebar"
            style={{
              width: 34,
              height: 34,
              background: 'transparent',
              border: 'none',
              color: 'var(--color-muted)',
              cursor: 'pointer',
              borderRadius: 8,
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            &#x2715;
          </button>
        </div>
      </div>

      {switcherOpen && headerRect && (
        <ProjectSwitcher
          anchor={headerRect}
          onClose={() => setSwitcherOpen(false)}
        />
      )}
    </>
  )
}

// ── Group label ─────────────────────────────────────────────────────────────────

function GroupLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: '0.5625rem',
        fontWeight: 700,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        color: 'var(--color-muted)',
        padding: '4px 8px',
        marginTop: 4,
      }}
    >
      {label}
    </div>
  )
}

// ── Session row ─────────────────────────────────────────────────────────────────

function refreshSessions() {
  void useSidebarStore.getState().refreshSessionsForActiveProject()
}

function SessionRow({ session, isActive }: { session: SessionSummary; isActive: boolean }) {
  const [hover, setHover] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(session.title)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadSession = async () => {
    try {
      await restoreSessionIntoActiveWorkspace(session)
    } catch (e) {
      console.error('Failed to load session:', e)
    }
  }

  const commitRename = async () => {
    const next = title.trim()
    if (!next || next === session.title) {
      setTitle(session.title)
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      await invoke('rename_session', { sessionId: session.id, title: next })
      refreshSessions()
    } catch (e) {
      console.error('rename failed:', e)
      setTitle(session.title)
    } finally {
      setBusy(false)
      setEditing(false)
    }
  }

  const commitDelete = async () => {
    setBusy(true)
    try {
      await invoke('delete_session', { sessionId: session.id })
      refreshSessions()
    } catch (e) {
      console.error('delete failed:', e)
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  const interactive = !editing && !confirming && !busy

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={interactive ? loadSession : undefined}
      onKeyDown={(e) => {
        if (interactive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          loadSession()
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        width: '100%',
        textAlign: 'left',
        background: isActive ? 'var(--color-elevated)' : 'transparent',
        border: 'none',
        borderLeft: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
        color: 'var(--color-text)',
        fontFamily: 'inherit',
        fontSize: '0.8125rem',
        padding: '8px 12px',
        borderRadius: 8,
        cursor: interactive ? 'pointer' : 'default',
        marginBottom: 4,
        gap: 8,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setTitle(session.title)
                setEditing(false)
              }
            }}
            style={{
              width: '100%',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-accent)',
              borderRadius: 4,
              color: 'var(--color-text-bright)',
              fontFamily: 'inherit',
              fontSize: '0.8125rem',
              fontWeight: 500,
              padding: '4px 8px',
              outline: 'none',
              marginBottom: 4,
            }}
          />
        ) : (
          <div
            style={{
              color: 'var(--color-text-bright)',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginBottom: 4,
              lineHeight: 1.3,
            }}
          >
            {session.title}
          </div>
        )}
        <div
          style={{
            fontSize: '0.6875rem',
            color: 'var(--color-muted)',
            display: 'flex',
            gap: 12,
            lineHeight: 1,
          }}
        >
          <span>{session.message_count} msgs</span>
        </div>
      </div>

      {/* Actions */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          opacity: hover || confirming || editing ? 1 : 0,
          transition: 'opacity 120ms ease',
          flexShrink: 0,
        }}
      >
        {confirming ? (
          <>
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-muted)', marginRight: 4 }}>Delete?</span>
            <button
              onClick={commitDelete}
              disabled={busy}
              title="Confirm delete"
              style={actionBtnStyle('var(--color-danger)')}
            >
              ✓
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              title="Cancel"
              style={actionBtnStyle('var(--color-muted)')}
            >
              ✕
            </button>
          </>
        ) : editing ? null : (
          <>
            <button
              onClick={() => setEditing(true)}
              title="Rename"
              style={actionBtnStyle('var(--color-muted)')}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 2l3 3-8 8H3v-3l8-8z" />
              </svg>
            </button>
            <button
              onClick={() => setConfirming(true)}
              title="Delete"
              style={actionBtnStyle('var(--color-muted)')}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4h10M6 4V2h4v2M5 4l1 10h4l1-10" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    width: 24,
    height: 24,
    background: 'transparent',
    border: 'none',
    color,
    cursor: 'pointer',
    borderRadius: 4,
    fontSize: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
}

// ── New session bar ─────────────────────────────────────────────────────────────

function NewSessionBar() {
  const getActiveProject = useProjectStore((s) => s.getActiveProject)

  const handleNewSession = async () => {
    try {
      const activeProject = getActiveProject()

      await startFreshSession({
        projectPath: activeProject?.path || null,
        resetChat: true,
      })

      useSidebarStore.getState().close()
    } catch (e) {
      console.error('Failed to create new session:', e)
    }
  }

  return (
    <button
      onClick={handleNewSession}
      style={{
        flexShrink: 0,
        width: '100%',
        padding: '10px 16px',
        background: 'transparent',
        border: 'none',
        borderTop: '1px solid var(--color-border)',
        borderStyle: 'dashed',
        borderLeftStyle: 'none',
        borderRightStyle: 'none',
        borderBottomStyle: 'none',
        color: 'var(--color-muted)',
        fontSize: '0.75rem',
        cursor: 'pointer',
        textAlign: 'center',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text)'
        ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--color-elevated)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-muted)'
        ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
    >
      + new session
    </button>
  )
}

// ── Main component ──────────────────────────────────────────────────────────────

export default function SessionSidebar() {
  const isOpen = useSidebarStore((s) => s.isOpen)
  const width = useSidebarStore((s) => s.width)
  const setWidth = useSidebarStore((s) => s.setWidth)
  const sessions = useSidebarStore((s) => s.sessions)
  const close = useSidebarStore((s) => s.close)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const currentSessionId = useChatStore((s) => s.sessionId)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => { resizeCleanupRef.current?.() }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    refreshSessions()
  }, [isOpen, activeProjectId, currentSessionId])

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    resizeCleanupRef.current?.()

    const handle = e.currentTarget
    const pointerId = e.pointerId
    try { handle.setPointerCapture(pointerId) } catch { /* ignore */ }

    const startX = e.clientX
    const startWidth = width
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    let raf: number | null = null

    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
      if (raf) cancelAnimationFrame(raf)
      try { handle.releasePointerCapture(pointerId) } catch { /* ignore */ }
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
      resizeCleanupRef.current = null
    }

    const handleMove = (ev: PointerEvent) => {
      if (typeof ev.buttons === 'number' && ev.buttons === 0) { cleanup(); return }
      const dx = ev.clientX - startX
      const next = clampSidebarWidth(startWidth + dx, window.innerWidth)
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => { raf = null; setWidth(next) })
    }

    resizeCleanupRef.current = cleanup
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
  }

  const groups = groupByTime(sessions, (s) => (s.started_at ?? 0) * 1000)

  return (
    <div
      className={isOpen ? 'animate-slide-left' : ''}
      style={{
        width: isOpen ? width : 0,
        minWidth: isOpen ? width : 0,
        height: '100vh',
        background: 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 200ms ease-out, min-width 200ms ease-out',
        borderRight: isOpen ? '1px solid var(--color-border)' : 'none',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {isOpen && (
        <div
          onPointerDown={handleResizePointerDown}
          title="Drag to resize"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 12,
            cursor: 'col-resize',
            zIndex: 60,
            touchAction: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{
            width: 4,
            height: 40,
            borderRadius: 99,
            background: 'var(--color-border)',
            opacity: 0.6,
          }} />
        </div>
      )}

      {/* Project header */}
      <ProjectHeader onClose={close} />

      {/* Session list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 4px 0',
        }}
      >
        {sessions.length === 0 && (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              fontSize: '0.8125rem',
              color: 'var(--color-muted)',
            }}
          >
            No sessions found
          </div>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <GroupLabel label={group.label} />
            {group.items.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                isActive={session.id === currentSessionId}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Bottom: new session bar */}
      <NewSessionBar />
    </div>
  )
}
