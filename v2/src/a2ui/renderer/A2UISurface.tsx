/**
 * A2UISurface — top-level React renderer for an A2UI surface.
 *
 * Takes a SurfaceState (accumulated from createSurface + updateComponents +
 * updateDataModel messages) and renders the component tree starting at the
 * component with id="root".
 *
 * Wraps the whole surface in an ErrorBoundary so a crash in any component
 * can't kill the chat. Also runs the runtime validator in development
 * builds and surfaces any schema errors inline as a red banner — invisible
 * in production.
 *
 * This is the primary public entry point for Phase 2. Phase 3 will add the
 * action dispatcher; Phase 4 will wire it to the hermes channel.
 */

import { useMemo } from 'react'
import type { SurfaceState } from '../types'
import { validateSurface } from '../validate'
import { RenderNode } from './RenderNode'
import ErrorBoundary from '../../components/ErrorBoundary'

interface A2UISurfaceProps {
  surface: SurfaceState
}

export default function A2UISurface({ surface }: A2UISurfaceProps) {
  const validationErrors = useMemo(
    () => (import.meta.env.DEV ? validateSurface(surface) : []),
    [surface]
  )

  const rootExists = 'root' in surface.components

  return (
    <ErrorBoundary label={`A2UI surface: ${surface.surfaceId}`}>
      <div
        data-a2ui-surface={surface.surfaceId}
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {validationErrors.length > 0 && (
          <div
            style={{
              padding: 8,
              borderRadius: 8,
              background: 'color-mix(in srgb, var(--color-danger) 15%, var(--color-bg))',
              border: '1px solid var(--color-danger)',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11,
              color: 'var(--color-danger)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {validationErrors.length} A2UI validation error{validationErrors.length === 1 ? '' : 's'}
            </div>
            {validationErrors.map((err, i) => (
              <div key={i}>
                <code style={{ color: 'var(--color-muted)' }}>{err.path}</code>: {err.message}
              </div>
            ))}
          </div>
        )}

        {rootExists ? (
          <RenderNode id="root" surface={surface} />
        ) : (
          <div
            style={{
              padding: 16,
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 12,
              color: 'var(--color-muted)',
              background: 'var(--color-elevated)',
              border: '1px dashed var(--color-border)',
              borderRadius: 8,
              textAlign: 'center',
            }}
          >
            A2UI surface has no root component yet (streaming...)
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}

/**
 * Fold a stream of A2UI server messages into a single SurfaceState. Phase 2
 * exposes this so the dev preview can load example JSONL files and show the
 * result; Phase 3 will use it in the live event stream too.
 */
export function foldMessages(
  messages: Array<Record<string, unknown>>
): SurfaceState | null {
  let state: SurfaceState | null = null

  for (const msg of messages) {
    if ('createSurface' in msg) {
      const s = msg.createSurface as {
        surfaceId: string
        catalogId: string
        theme?: Record<string, unknown>
        sendDataModel?: boolean
      }
      state = {
        surfaceId: s.surfaceId,
        catalogId: s.catalogId,
        theme: s.theme,
        sendDataModel: s.sendDataModel,
        components: {},
        dataModel: {},
      }
      continue
    }

    if (!state) continue

    if ('updateComponents' in msg) {
      const u = msg.updateComponents as { surfaceId: string; components: Array<{ id: string }> }
      for (const comp of u.components) {
        state.components[comp.id] = comp as never
      }
      continue
    }

    if ('updateDataModel' in msg) {
      const u = msg.updateDataModel as { surfaceId: string; path?: string; value?: unknown }
      if (!u.path || u.path === '/') {
        state.dataModel = (u.value ?? {}) as Record<string, unknown>
      } else {
        // Minimal partial-path update: walk the pointer and set the leaf.
        // Good enough for Phase 2 example loading.
        const segments = u.path.slice(1).split('/')
        let cursor: Record<string, unknown> = state.dataModel
        for (let i = 0; i < segments.length - 1; i++) {
          const k = segments[i]
          if (typeof cursor[k] !== 'object' || cursor[k] === null) {
            cursor[k] = {}
          }
          cursor = cursor[k] as Record<string, unknown>
        }
        cursor[segments[segments.length - 1]] = u.value
      }
      continue
    }

    if ('deleteSurface' in msg) {
      state = null
    }
  }

  return state
}
