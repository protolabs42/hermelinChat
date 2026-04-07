/**
 * A2UISurface — top-level React renderer for an A2UI surface.
 *
 * Takes a SurfaceState (accumulated from createSurface + updateComponents +
 * updateDataModel messages) and renders the component tree starting at the
 * component with id="root".
 *
 * Phase 3 behaviour:
 *
 *   - Owns the MUTABLE data model + error state via useState. The initial
 *     data model comes from the prop; subsequent writes (from TextField
 *     changes, CheckBox toggles, etc.) update local state and re-render
 *     the tree.
 *
 *   - Provides A2UISurfaceContext to all children, exposing setBinding /
 *     emitAction / emitError and the validation errors map.
 *
 *   - Exposes `onAction` and `onError` callbacks so the parent can wire
 *     the A2UI client→server messages to whatever transport is active
 *     (dev preview logs to console; Phase 4 will wire it to hermes ACP).
 *
 * Wraps the whole surface in an ErrorBoundary so a crash in any component
 * can't kill the chat. Runs the runtime validator in development builds
 * and surfaces any schema errors inline as a red banner.
 */

import { useCallback, useMemo, useState } from 'react'
import type {
  ActionMessage,
  ErrorMessage,
  SurfaceState,
} from '../types'
import { validateSurface } from '../validate'
import { RenderNode } from './RenderNode'
import ErrorBoundary from '../../components/ErrorBoundary'
import { A2UISurfaceContext, type A2UISurfaceContextValue } from './context'
import { writePointer } from './resolve'

interface A2UISurfaceProps {
  surface: SurfaceState
  /** Called when an interactive component emits an action. Phase 4 wires this to hermes. */
  onAction?: (message: ActionMessage) => void
  /** Called when the renderer emits a validation error back to the agent. */
  onError?: (message: ErrorMessage) => void
}

export default function A2UISurface({
  surface,
  onAction,
  onError,
}: A2UISurfaceProps) {
  // Local mutable data model, seeded from the prop. Writes via setBinding
  // create a new object so React re-renders components that bind to paths
  // under the changed branch.
  const [dataModel, setDataModel] = useState<unknown>(surface.dataModel)

  // Validation errors keyed by JSON Pointer path. Empty string = no error.
  const [errors, setErrors] = useState<Record<string, string>>({})

  const setBinding = useCallback((path: string, value: unknown) => {
    setDataModel((prev: unknown) => writePointer(path, value, prev))
  }, [])

  const setError = useCallback((path: string, message: string) => {
    setErrors((prev) => ({ ...prev, [path]: message }))
  }, [])

  const clearError = useCallback((path: string) => {
    setErrors((prev) => {
      if (!(path in prev)) return prev
      const next = { ...prev }
      delete next[path]
      return next
    })
  }, [])

  const emitAction = useCallback(
    (message: ActionMessage) => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[A2UI] action →', message)
      }
      onAction?.(message)
    },
    [onAction]
  )

  const emitError = useCallback(
    (message: ErrorMessage) => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[A2UI] error →', message)
      }
      onError?.(message)
    },
    [onError]
  )

  const contextValue = useMemo<A2UISurfaceContextValue>(
    () => ({
      dataModel,
      setBinding,
      emitAction,
      emitError,
      errors,
      setError,
      clearError,
    }),
    [dataModel, setBinding, emitAction, emitError, errors, setError, clearError]
  )

  // Build the live surface view — components from the prop, data model from
  // local state. This is what RenderNode actually walks.
  const liveSurface = useMemo<SurfaceState>(
    () => ({
      ...surface,
      dataModel: dataModel as Record<string, unknown>,
    }),
    [surface, dataModel]
  )

  const validationErrors = useMemo(
    () => (import.meta.env.DEV ? validateSurface(liveSurface) : []),
    [liveSurface]
  )

  const rootExists = 'root' in surface.components

  return (
    <ErrorBoundary label={`A2UI surface: ${surface.surfaceId}`}>
      <A2UISurfaceContext.Provider value={contextValue}>
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
            <RenderNode id="root" surface={liveSurface} />
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
      </A2UISurfaceContext.Provider>
    </ErrorBoundary>
  )
}

/**
 * Fold a stream of A2UI server messages into a single SurfaceState. Phase 2
 * exposes this so the dev preview can load example JSONL files and show the
 * result; Phase 4 will use it in the live event stream too.
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
