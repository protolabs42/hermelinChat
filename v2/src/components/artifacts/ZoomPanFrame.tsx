/**
 * ZoomPanFrame — reusable wrapper that gives any artifact body a zoom/pan
 * surface plus a small floating control toolbar (zoom in / out / reset).
 *
 * Used by mermaid, image, and any future renderer that benefits from
 * exploring large content.
 *
 * Mouse wheel zooms toward cursor, drag pans, double-click resets, and the
 * toolbar gives explicit buttons for accessibility.
 */

import { useRef, type ReactNode } from 'react'
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
        // events per rotation, so anything above ~0.05 jumps straight to max.
        wheel={{ step: 0.05 }}
        pinch={{ step: 5 }}
        doubleClick={{ mode: 'reset' }}
        limitToBounds={false}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
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

            {/* Floating toolbar — bottom right.
                stopPropagation on the toolbar itself is the belt-and-suspenders
                guard so any stray drag-start on padding or gap regions doesn't
                hit TransformWrapper either. */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
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
              <ZoomButton onClick={() => zoomOut()} title="Zoom out (wheel down)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </ZoomButton>
              <ZoomButton onClick={() => zoomIn()} title="Zoom in (wheel up)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </ZoomButton>
              <ZoomButton
                onClick={() => resetTransform()}
                title="Reset (double-click)"
                style={{ marginLeft: 4, paddingLeft: 8, borderLeft: '1px solid var(--color-border)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <polyline points="3 4 3 10 9 10" />
                </svg>
              </ZoomButton>
            </div>
          </>
        )}
      </TransformWrapper>
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
  // Stop pointer events from bubbling up to TransformWrapper, which would
  // otherwise interpret them as a drag start and consume the click.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
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

