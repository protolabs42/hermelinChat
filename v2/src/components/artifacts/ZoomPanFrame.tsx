/**
 * ZoomPanFrame — reusable wrapper that gives any artifact body a zoom/pan
 * surface plus a small floating control toolbar (zoom in / out / reset).
 *
 * Used by mermaid, image, and any future renderer that benefits from
 * exploring large content.
 *
 * Mouse wheel zooms toward cursor (gentle step), drag pans, double-click
 * resets, and the toolbar gives explicit buttons for accessibility.
 *
 * The toolbar is rendered as a sibling of TransformWrapper (not a child)
 * so its native pointer events don't bubble into the wrapper's drag handler.
 * Controls are wired through an imperative ref instead of the render prop.
 */

import { useCallback, useRef, type ReactNode } from 'react'
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch'

interface ZoomPanFrameProps {
  children: ReactNode
  /** Initial zoom (1 = 100%). Default 1. */
  initialScale?: number
  /** Minimum allowed zoom. Default 0.25. */
  minScale?: number
  /** Maximum allowed zoom. Default 8. */
  maxScale?: number
  /** Center the content on first mount. Default true. */
  centerOnInit?: boolean
  /** Background color of the framed area. Defaults to var(--color-bg). */
  background?: string
}

export default function ZoomPanFrame({
  children,
  initialScale = 1,
  minScale = 0.25,
  maxScale = 8,
  centerOnInit = true,
  background,
}: ZoomPanFrameProps) {
  const ref = useRef<ReactZoomPanPinchRef | null>(null)

  const onZoomIn = useCallback(() => ref.current?.zoomIn(), [])
  const onZoomOut = useCallback(() => ref.current?.zoomOut(), [])
  const onReset = useCallback(() => ref.current?.resetTransform(), [])

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        width: '100%',
        background: background || 'var(--color-bg)',
        overflow: 'hidden',
      }}
    >
      <TransformWrapper
        ref={ref}
        initialScale={initialScale}
        minScale={minScale}
        maxScale={maxScale}
        centerOnInit={centerOnInit}
        // step is a per-event multiplier — smooth-scroll wheels fire many
        // events per rotation, so even 0.05 was too aggressive. 0.005 gives
        // a steady, gentle zoom on touchpads and HiDPI mice alike.
        wheel={{ step: 0.005 }}
        pinch={{ step: 5 }}
        doubleClick={{ mode: 'reset' }}
        limitToBounds={false}
      >
        <TransformComponent
          wrapperStyle={{
            width: '100%',
            height: '100%',
            cursor: 'grab',
          }}
          contentStyle={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </TransformComponent>
      </TransformWrapper>

      {/* Floating toolbar — sibling of TransformWrapper, not a child.
          Native events on the toolbar can no longer bubble into the
          wrapper's pointer handlers, so the buttons stay clickable. */}
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          display: 'flex',
          gap: 4,
          padding: 4,
          background: 'color-mix(in srgb, var(--color-elevated) 85%, transparent)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 10,
        }}
      >
        <ZoomButton onClick={onZoomOut} title="Zoom out (wheel down)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </ZoomButton>
        <ZoomButton onClick={onZoomIn} title="Zoom in (wheel up)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </ZoomButton>
        <ZoomButton
          onClick={onReset}
          title="Reset (double-click)"
          style={{ marginLeft: 4, paddingLeft: 8, borderLeft: '1px solid var(--color-border)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <polyline points="3 4 3 10 9 10" />
          </svg>
        </ZoomButton>
      </div>
    </div>
  )
}

function ZoomButton({
  onClick,
  title,
  children,
  style,
}: {
  onClick: () => void
  title: string
  children: ReactNode
  style?: React.CSSProperties
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 0,
        borderRadius: 4,
        color: 'var(--color-text)',
        cursor: 'pointer',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-border)'
        e.currentTarget.style.color = 'var(--color-text-bright)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--color-text)'
      }}
    >
      {children}
    </button>
  )
}
