import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { invoke } from '@tauri-apps/api/core'

import A2UISurface from '../a2ui/renderer/A2UISurface'
import type { ActionMessage, ErrorMessage } from '../a2ui/types'
import { ArtifactBody, EmptyRenderer } from './ArtifactPanel'
import { clampArtifactPanelWidth, useArtifactStore, type Artifact } from '../stores/artifacts'
import { usePaneStore } from '../stores/panes'
import { useSurfaceStore } from '../stores/surfaces'
import { useWorkspaceStore } from '../stores/workspaces'
import { useChatStore } from '../stores/chat'
import type { WorkspacePaneId } from '../lane2/schema'
import { buildSurfacePaneEmptyState } from '../app/right-pane-state'
import { buildWorkspaceRestoreState } from '../app/workspace-restore-state'

function paneCopy(paneId: WorkspacePaneId): {
  title: string
  eyebrow: string
  description: string
} {
  switch (paneId) {
    case 'plan':
      return {
        title: 'Plan',
        eyebrow: 'Next slice',
        description: 'Capture the next slice before you type yourself into a corner.',
      }
    case 'tasks':
      return {
        title: 'Tasks',
        eyebrow: 'Working set',
        description: 'Track the current slice instead of juggling it in your head.',
      }
    case 'surfaces':
      return {
        title: 'Surfaces',
        eyebrow: 'Live surfaces',
        description: 'Interactive surfaces stay reachable here once they leave the chat stream.',
      }
    case 'artifacts':
      return {
        title: 'Artifacts',
        eyebrow: 'Artifact detail',
        description: 'Legacy artifact detail now lives inside the formal pane stack.',
      }
    case 'context':
      return {
        title: 'Context',
        eyebrow: 'Soon',
        description: 'Shared context and memory views will land here after the shell is stable.',
      }
  }
}

const ACTION_MARKER = '[[A2UI_ACTION]] '
let rightPaneActionSeq = 0

function sendRightPaneActionEnvelope(
  kind: 'action' | 'error',
  payload: ActionMessage | ErrorMessage
) {
  const sessionId = useChatStore.getState().sessionId
  if (!sessionId) return
  rightPaneActionSeq += 1
  const envelope = {
    kind: `a2ui_${kind}`,
    version: 'v0.9',
    seq: rightPaneActionSeq,
    ...(kind === 'action' ? payload : payload),
  }
  invoke('acp_send_prompt', {
    sessionId,
    text: ACTION_MARKER + JSON.stringify(envelope),
  }).catch(() => {})
}

export function ArtifactPaneView(args: {
  activeArtifact: Artifact | null
  artifactCount: number
}) {
  if (!args.activeArtifact) {
    return <EmptyRenderer title="No artifacts" detail="Ask the agent to create one" />
  }

  return (
    <div style={{ minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          fontSize: 12,
        }}
      >
        <span style={{ color: 'var(--color-text-bright)', fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {args.activeArtifact.title || args.activeArtifact.id}
        </span>
        <span style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-mono, monospace)', fontSize: 10 }}>
          {args.artifactCount} item{args.artifactCount === 1 ? '' : 's'}
        </span>
      </div>
      <div style={{ minHeight: 0, flex: 1, overflow: 'auto' }}>
        <ArtifactBody artifact={args.activeArtifact} />
      </div>
    </div>
  )
}

function ArtifactPaneContent() {
  const artifacts = useArtifactStore((s) => s.artifacts)
  const activeId = useArtifactStore((s) => s.activeId)
  const activeArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === activeId) ?? artifacts[0] ?? null,
    [artifacts, activeId]
  )

  return <ArtifactPaneView activeArtifact={activeArtifact} artifactCount={artifacts.length} />
}

export function SurfacePaneView(args: {
  pinnedSurfaceId: string | null
  pinnedSurfaceTitle: string | null
  surfaceIds: string[]
}) {
  const emptyState = buildSurfacePaneEmptyState({
    liveSurfaceCount: args.surfaceIds.length,
    pinnedSurfaceId: args.pinnedSurfaceId,
    pinnedSurfaceTitle: args.pinnedSurfaceTitle,
  })

  return (
    <div style={{ minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 14 }}>
      {args.pinnedSurfaceId ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ color: 'var(--color-accent)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {args.surfaceIds.length > 0 ? 'Pinned Surface' : 'Restoring pinned surface'}
          </div>
          <div style={{ color: 'var(--color-text-bright)', fontSize: 13, fontWeight: 700 }}>
            {args.pinnedSurfaceTitle || args.pinnedSurfaceId}
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--color-muted)', fontSize: 12 }}>
          No surface is pinned yet.
        </div>
      )}

      {args.surfaceIds.length > 0 ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: 'var(--color-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Available surfaces
          </div>
          {args.surfaceIds.map((surfaceId) => (
            <div
              key={surfaceId}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                padding: '10px 12px',
                color: 'var(--color-text)',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 12,
                background: 'color-mix(in srgb, var(--color-elevated) 80%, transparent)',
              }}
            >
              {surfaceId}
            </div>
          ))}
        </div>
      ) : (
        <EmptyRenderer title={emptyState.title} detail={emptyState.detail} />
      )}
    </div>
  )
}

function SurfacePaneContent() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const pinnedSurfaceId = useArtifactStore((s) => s.pinnedSurfaceId)
  const unpinSurface = useArtifactStore((s) => s.unpinSurface)
  const orderedIds = useSurfaceStore((s) => s.orderedIds)
  const surfaces = useSurfaceStore((s) => s.surfaces)
  const pinnedSurface = pinnedSurfaceId ? surfaces[pinnedSurfaceId] ?? null : null
  const restoreState = buildWorkspaceRestoreState({
    activeWorkspaceId: activeWorkspace?.workspaceId ?? null,
    liveSurfaceIds: orderedIds,
    pinnedSurfaceId,
    primaryFocus: activeWorkspace?.attention.primaryFocus ?? null,
    surfaceAnchorIds: activeWorkspace?.continuity.localAnchorIds ?? [],
  })

  if (!pinnedSurface) {
    return (
      <SurfacePaneView
        pinnedSurfaceId={restoreState?.surfaceId ?? pinnedSurfaceId}
        pinnedSurfaceTitle={restoreState?.label ?? null}
        surfaceIds={orderedIds}
      />
    )
  }

  return (
    <div style={{ minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ color: 'var(--color-accent)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Pinned Surface
          </div>
          <div style={{ color: 'var(--color-text-bright)', fontSize: 13, fontWeight: 700 }}>
            {pinnedSurface.surfaceId}
          </div>
        </div>
        <button
          onClick={unpinSurface}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: '4px 8px',
            fontSize: 11,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--color-muted)',
            cursor: 'pointer',
          }}
        >
          unpin
        </button>
      </div>
      <div style={{ minHeight: 0, flex: 1, overflow: 'auto', padding: 12 }}>
        <A2UISurface
          surface={pinnedSurface}
          onAction={(msg) => sendRightPaneActionEnvelope('action', msg)}
          onError={(msg) => sendRightPaneActionEnvelope('error', msg)}
        />
      </div>
    </div>
  )
}

function PaneContent({ paneId }: { paneId: WorkspacePaneId }) {
  if (paneId === 'artifacts') return <ArtifactPaneContent />
  if (paneId === 'surfaces') return <SurfacePaneContent />
  return null
}

function PaneCard({ paneId, closePane }: {
  paneId: WorkspacePaneId
  closePane: (paneId: WorkspacePaneId) => void
}) {
  const copy = paneCopy(paneId)

  return (
    <section
      aria-label={`${copy.title} pane`}
      style={{
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'color-mix(in srgb, var(--color-surface) 96%, transparent)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 14px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: 'var(--color-muted)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 4,
            }}
          >
            {copy.eyebrow}
          </div>
          <div style={{ color: 'var(--color-text-bright)', fontSize: 13, fontWeight: 700 }}>
            {copy.title}
          </div>
        </div>
        <button
          onClick={() => closePane(paneId)}
          title={`Hide ${paneId} pane`}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border)',
            color: 'var(--color-muted)',
            borderRadius: 8,
            cursor: 'pointer',
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          color: 'var(--color-text)',
          minHeight: 0,
          flex: 1,
        }}
      >
        {paneId === 'artifacts' || paneId === 'surfaces' ? (
          <PaneContent paneId={paneId} />
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
              {copy.description}
            </p>
            <div
              style={{
                border: '1px dashed var(--color-border)',
                borderRadius: 12,
                padding: 12,
                background: 'color-mix(in srgb, var(--color-elevated) 80%, transparent)',
                color: 'var(--color-muted)',
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              This pane shell is workspace-scoped now. Real {copy.title.toLowerCase()} content plugs into the same slot next.
            </div>
          </>
        )}
      </div>
    </section>
  )
}

export function RightPaneStackView(args: {
  closePane: (paneId: WorkspacePaneId) => void
  layout: ReturnType<typeof usePaneStore.getState>['layout']
  panelWidth: number
  setPanelWidth: (width: number) => void
}) {
  const { closePane, layout, panelWidth, setPanelWidth } = args
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  const paneIds = useMemo(() => {
    if (layout.mode === 'hidden') return []
    if (layout.mode === 'single') return [layout.primaryPane]
    return [layout.primaryPane, layout.secondaryPane]
  }, [layout])

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.()
    }
  }, [])

  if (paneIds.length === 0) {
    return null
  }

  const shellStyle: CSSProperties = {
    flexShrink: 0,
    width: panelWidth,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    borderLeft: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    position: 'relative',
    zIndex: 20,
    overflow: 'hidden',
  }

  const stackStyle: CSSProperties = layout.mode === 'stacked'
    ? {
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
        minHeight: 0,
        flex: 1,
      }
    : {
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr)',
        minHeight: 0,
        flex: 1,
      }

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    resizeCleanupRef.current?.()

    const handle = e.currentTarget
    const pointerId = e.pointerId
    try { handle.setPointerCapture(pointerId) } catch {}

    const startX = e.clientX
    const startWidth = panelWidth
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
      try { handle.releasePointerCapture(pointerId) } catch {}
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
      resizeCleanupRef.current = null
    }

    const handleMove = (ev: PointerEvent) => {
      if (typeof ev.buttons === 'number' && ev.buttons === 0) {
        cleanup()
        return
      }
      const dx = startX - ev.clientX
      const next = clampArtifactPanelWidth(startWidth + dx, window.innerWidth)
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = null
        setPanelWidth(next)
      })
    }

    resizeCleanupRef.current = cleanup
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
  }

  return (
    <aside aria-label="Right pane stack" style={shellStyle}>
      <div
        onPointerDown={handleResizePointerDown}
        title="Drag to resize right rail"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 12,
          cursor: 'col-resize',
          zIndex: 40,
          touchAction: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 4,
            height: 40,
            borderRadius: 99,
            background: 'var(--color-border)',
            opacity: 0.6,
          }}
        />
      </div>

      <div style={stackStyle}>
        {paneIds.map((paneId, index) => (
          <div
            key={`${paneId}-${index}`}
            style={{
              minHeight: 0,
              borderTop: index > 0 ? '1px solid var(--color-border)' : undefined,
            }}
          >
            <PaneCard paneId={paneId} closePane={closePane} />
          </div>
        ))}
      </div>
    </aside>
  )
}

export default function RightPaneStack(args?: {
  layoutOverride?: ReturnType<typeof usePaneStore.getState>['layout']
}) {
  const closePane = usePaneStore((s) => s.closePane)
  const closeLegacyPanel = useArtifactStore((s) => s.closePanel)
  const storedLayout = usePaneStore((s) => s.layout)
  const panelWidth = useArtifactStore((s) => s.panelWidth)
  const setPanelWidth = useArtifactStore((s) => s.setPanelWidth)

  const handleClosePane = (paneId: WorkspacePaneId) => {
    closePane(paneId)
    if (paneId === 'artifacts' || paneId === 'surfaces') {
      closeLegacyPanel()
    }
  }

  return (
    <RightPaneStackView
      closePane={handleClosePane}
      layout={args?.layoutOverride ?? storedLayout}
      panelWidth={panelWidth}
      setPanelWidth={setPanelWidth}
    />
  )
}
