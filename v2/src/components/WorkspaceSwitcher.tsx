import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'

import { buildWorkspaceSnapshot, DEFAULT_WORKSPACE_ID, extractProjectIdFromWorkspace } from '../lane2/persistence'
import type { WorkspaceState } from '../lane2/schema'
import { useSurfaceStore } from '../stores/surfaces'
import { useWorkspaceStore } from '../stores/workspaces'
import { useProjectStore } from '../stores/projects'
import { useChatStore } from '../stores/chat'

export interface WorkspaceSwitcherProps {
  anchor: DOMRect | 'center'
  onClose: () => void
}

function getDropdownStyle(anchor: DOMRect | 'center'): React.CSSProperties {
  const width = 280
  const gap = 4

  if (anchor === 'center') {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width,
    }
  }

  return {
    position: 'fixed',
    top: anchor.bottom + gap,
    left: anchor.left,
    width,
  }
}

function WorkspaceRow({
  isActive,
  name,
  onClick,
}: {
  isActive: boolean
  name: string
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1,
        width: '100%',
        padding: '8px 12px',
        background: hovered
          ? 'var(--color-elevated)'
          : isActive
          ? 'var(--color-accent-900)'
          : 'transparent',
        border: 'none',
        borderLeft: isActive
          ? '3px solid var(--color-accent)'
          : '3px solid transparent',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          fontSize: 13,
          color: isActive ? 'var(--color-accent)' : 'var(--color-text-bright)',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
        }}
      >
        {name}
      </span>
    </button>
  )
}

export default function WorkspaceSwitcher({ anchor, onClose }: WorkspaceSwitcherProps) {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces)
  const upsertWorkspace = useWorkspaceStore((s) => s.upsertWorkspace)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const orderedSurfaceIds = useSurfaceStore((s) => s.orderedIds)
  const sessionId = useChatStore((s) => s.sessionId)
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    void loadWorkspaces()
    const id = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [loadWorkspaces])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? workspaces.filter((w) => w.workspaceId.toLowerCase().includes(q)) : workspaces),
    [q, workspaces]
  )

  const handleCreate = async () => {
    if (creating) return
    const workspaceId = window.prompt('Workspace name / id', activeWorkspace?.workspaceId ?? DEFAULT_WORKSPACE_ID)
    if (!workspaceId) return
    setCreating(true)
    try {
      const snapshot = buildWorkspaceSnapshot({
        existing: activeWorkspace,
        workspaceId,
        orderedSurfaceIds,
        projectId: activeProjectId,
        sessionId,
      })
      await upsertWorkspace(snapshot, true)
      await loadWorkspaces()
      onClose()
    } finally {
      setCreating(false)
    }
  }

  const handleSelect = async (workspace: WorkspaceState) => {
    await setActiveWorkspace(workspace.workspaceId)
    const { useProjectStore } = await import('../stores/projects')
    const { useChatStore } = await import('../stores/chat')
    const restoredProjectId = extractProjectIdFromWorkspace(workspace)
    const restoredSessionId = workspace.continuity.activeThreadId ?? workspace.resident.sessionId ?? null

    if (restoredProjectId) {
      await useProjectStore.getState().hydrateActiveProject(restoredProjectId)
    }

    useChatStore.getState().reset()

    if (restoredSessionId) {
      const project = restoredProjectId ? useProjectStore.getState().projects[restoredProjectId] : null
      const cwd = restoredProjectId === 'scratchpad'
        ? await invoke<string>('get_home_dir').catch(() => null)
        : project?.path ?? null
      await invoke('acp_load_session', { sessionId: restoredSessionId, cwd })
    } else {
      const activeProject = useProjectStore.getState().getActiveProject()
      const cwd = restoredProjectId === 'scratchpad'
        ? await invoke<string>('get_home_dir').catch(() => null)
        : activeProject?.path || null
      await invoke('acp_new_session', { cwd })
    }
    onClose()
  }

  const dropdownStyle = getDropdownStyle(anchor)

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...dropdownStyle,
          zIndex: 1001,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          maxHeight: 400,
        }}
      >
        <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--color-border)' }}>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workspaces..."
            style={{
              width: '100%',
              background: 'var(--color-elevated)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: '8px',
              color: 'var(--color-text)',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
        <div style={{ overflowY: 'auto', maxHeight: 320 }}>
          {filtered.map((workspace) => (
            <WorkspaceRow
              key={workspace.workspaceId}
              isActive={workspace.workspaceId === activeWorkspace?.workspaceId}
              name={workspace.workspaceId}
              onClick={() => void handleSelect(workspace)}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '16px 12px', color: 'var(--color-muted)', fontSize: 12 }}>
              No workspaces found.
            </div>
          )}
        </div>
        <div style={{ padding: 8, borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={() => void handleCreate()}
            style={{
              width: '100%',
              background: 'var(--color-elevated)',
              color: 'var(--color-text-bright)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {creating ? 'Creating…' : 'New workspace from current state'}
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}
