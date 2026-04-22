import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  buildWorkspaceCreationSnapshot,
  DEFAULT_WORKSPACE_ID,
} from '../lane2/persistence'
import type { WorkspaceState } from '../lane2/schema'
import { activateWorkspace } from '../app/workspace-lifecycle'
import { buildWorkspaceRowSummary } from '../lane2/workspace-summary'
import { useSurfaceStore } from '../stores/surfaces'
import { useWorkspaceStore } from '../stores/workspaces'
import { useProjectStore } from '../stores/projects'
import { useChatStore } from '../stores/chat'
import { useArtifactStore } from '../stores/artifacts'
import { useSidebarStore } from '../stores/sidebar'

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
  workspace,
  onClick,
}: {
  isActive: boolean
  workspace: WorkspaceState
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const summary = buildWorkspaceRowSummary(workspace)
  const statusColor = summary.status === 'remembered-active'
    ? 'var(--color-accent)'
    : summary.status === 'ready'
    ? 'var(--color-text-bright)'
    : 'var(--color-text-muted)'

  return (
    <button
      data-testid={`workspace-row-${workspace.workspaceId}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 4,
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
        {workspace.workspaceId}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: statusColor,
          lineHeight: 1.3,
          maxWidth: '100%',
        }}
      >
        {summary.headline}
      </span>
      <span
        style={{
          fontSize: 11,
          color: 'var(--color-text-muted)',
          lineHeight: 1.35,
          maxWidth: '100%',
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
        }}
      >
        {summary.detail}
      </span>
      <span
        style={{
          marginTop: 2,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 8px',
          borderRadius: 999,
          border: '1px solid var(--color-border)',
          background: isActive ? 'rgba(255,255,255,0.06)' : 'var(--color-elevated)',
          color: statusColor,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.01em',
        }}
      >
        {summary.actionLabel}
      </span>
    </button>
  )
}

export default function WorkspaceSwitcher({ anchor, onClose }: WorkspaceSwitcherProps) {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces)
  const upsertWorkspace = useWorkspaceStore((s) => s.upsertWorkspace)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const orderedSurfaceIds = useSurfaceStore((s) => s.orderedIds)
  const sessionId = useChatStore((s) => s.sessionId)
  const artifactPanelOpen = useArtifactStore((s) => s.panelOpen)
  const artifactPanelWidth = useArtifactStore((s) => s.panelWidth)
  const activeArtifactId = useArtifactStore((s) => s.activeId)
  const pinnedSurfaceId = useArtifactStore((s) => s.pinnedSurfaceId)
  const sidebarOpen = useSidebarStore((s) => s.isOpen)
  const sidebarWidth = useSidebarStore((s) => s.width)
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [creatingMode, setCreatingMode] = useState<'blank' | 'duplicate' | null>(null)

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

  const handleCreate = async (mode: 'blank' | 'duplicate') => {
    if (creatingMode) return
    const suggestedName = mode === 'duplicate'
      ? `${activeWorkspace?.workspaceId ?? DEFAULT_WORKSPACE_ID}-copy`
      : DEFAULT_WORKSPACE_ID
    const workspaceId = window.prompt(
      mode === 'blank' ? 'New blank workspace name / id' : 'Duplicate workspace name / id',
      suggestedName
    )
    if (!workspaceId) return
    setCreatingMode(mode)
    try {
      const snapshot = buildWorkspaceCreationSnapshot({
        mode,
        existing: activeWorkspace,
        workspaceId,
        chrome: {
          sidebarOpen,
          sidebarWidth,
          artifactPanelOpen,
          artifactPanelWidth,
          activeArtifactId,
          pinnedSurfaceId,
        },
        anchorSurfaceIds: useChatStore.getState().messages
          .filter((message) => message.role === 'surface' && typeof message.surfaceId === 'string')
          .map((message) => message.surfaceId as string),
        orderedSurfaceIds,
        projectId: activeProjectId,
        sessionId,
      })
      const saved = await upsertWorkspace(snapshot, false)
      await loadWorkspaces()
      await activateWorkspace(saved)
      onClose()
    } finally {
      setCreatingMode(null)
    }
  }

  const handleSelect = async (workspace: WorkspaceState) => {
    try {
      await activateWorkspace(workspace)
      onClose()
    } catch (error) {
      console.error(`Failed to activate workspace ${workspace.workspaceId}:`, error)
    }
  }

  const dropdownStyle = getDropdownStyle(anchor)

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
      <div
        data-testid="workspace-switcher"
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
            data-testid="workspace-search"
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
              workspace={workspace}
              onClick={() => void handleSelect(workspace)}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '16px 12px', color: 'var(--color-muted)', fontSize: 12 }}>
              No workspaces found.
            </div>
          )}
        </div>
        <div style={{ padding: 8, borderTop: '1px solid var(--color-border)', display: 'grid', gap: 8 }}>
          <button
            data-testid="workspace-create-blank"
            onClick={() => void handleCreate('blank')}
            disabled={creatingMode !== null}
            style={{
              width: '100%',
              background: 'var(--color-elevated)',
              color: 'var(--color-text-bright)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: '8px 12px',
              cursor: creatingMode ? 'default' : 'pointer',
              fontSize: 12,
              opacity: creatingMode === 'duplicate' ? 0.65 : 1,
            }}
          >
            {creatingMode === 'blank' ? 'Creating blank workspace…' : 'New blank workspace'}
          </button>
          <button
            data-testid="workspace-create-duplicate"
            onClick={() => void handleCreate('duplicate')}
            disabled={creatingMode !== null}
            style={{
              width: '100%',
              background: 'transparent',
              color: 'var(--color-text-bright)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: '8px 12px',
              cursor: creatingMode ? 'default' : 'pointer',
              fontSize: 12,
              opacity: creatingMode === 'blank' ? 0.65 : 1,
            }}
          >
            {creatingMode === 'duplicate' ? 'Duplicating current workspace…' : 'Duplicate current workspace'}
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}
