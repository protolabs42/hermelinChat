import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'

import { clampArtifactPanelWidth, useArtifactStore } from '../stores/artifacts'
import { usePaneStore } from '../stores/panes'
import type { WorkspacePaneId } from '../lane2/schema'

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
        eyebrow: 'Soon',
        description: 'Surface control is next once the right rail shell settles.',
      }
    case 'artifacts':
      return {
        title: 'Artifacts',
        eyebrow: 'Soon',
        description: 'Artifact detail will move into the formal pane stack in a follow-up slice.',
      }
    case 'context':
      return {
        title: 'Context',
        eyebrow: 'Soon',
        description: 'Shared context and memory views will land here after the shell is stable.',
      }
  }
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

export default function RightPaneStack() {
  const closePane = usePaneStore((s) => s.closePane)
  const layout = usePaneStore((s) => s.layout)
  const panelWidth = useArtifactStore((s) => s.panelWidth)
  const setPanelWidth = useArtifactStore((s) => s.setPanelWidth)

  return (
    <RightPaneStackView
      closePane={closePane}
      layout={layout}
      panelWidth={panelWidth}
      setPanelWidth={setPanelWidth}
    />
  )
}
