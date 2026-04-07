/**
 * A2UISurfaceContext — runtime glue for Phase 3 interactivity.
 *
 * The Phase 2 renderer was read-only: it took an immutable SurfaceState and
 * rendered it. Phase 3 needs mutation (inputs writing to the data model on
 * change) and callbacks (buttons emitting actions back to the agent).
 *
 * This file provides a React context that owns those runtime concerns:
 *
 *   - `dataModel`          — the live, mutable surface data model
 *   - `setBinding(path, v)` — write a value into the data model at a JSON
 *                             Pointer path, triggering a re-render of any
 *                             component that reads from it
 *   - `emitAction(msg)`    — push an A2UI ActionMessage back through the
 *                             onAction callback (Phase 4 will wire that to
 *                             the hermes ACP channel; Phase 3 just logs)
 *   - `emitError(err)`     — push a validation error back through the same
 *                             onError callback for self-correction loops
 *   - `errors`             — validation errors keyed by JSON Pointer path,
 *                             consumed by input components for red-border UI
 *   - `setError(path, msg)` / `clearError(path)` — store mutation helpers
 *                             used by the validation runner
 *
 * The context is provided by A2UISurface, which owns the internal useState
 * for the data model and errors map. When Phase 4 swaps in a zustand-backed
 * store, only A2UISurface changes — every consumer (input components, button,
 * validation runner) just keeps using the useA2UI() hook.
 */

import { createContext, useContext } from 'react'
import type { ActionMessage, ErrorMessage } from '../types'

export interface A2UISurfaceContextValue {
  /** Mutable data model for the surface — JSON Pointer root. */
  dataModel: unknown

  /**
   * Write a value into the data model at a JSON Pointer path. Intermediate
   * objects are created as needed. Triggers a re-render of the surface.
   */
  setBinding(path: string, value: unknown): void

  /**
   * Emit an A2UI action back to the agent. In Phase 3 dev mode this logs
   * to console and invokes the onAction prop; in Phase 4 this sends the
   * message through the ACP channel.
   */
  emitAction(message: ActionMessage): void

  /**
   * Emit a validation error back to the agent for self-correction. Same
   * shape as A2UI's spec-defined error message.
   */
  emitError(message: ErrorMessage): void

  /**
   * Current validation errors keyed by JSON Pointer path. Empty string
   * value means no error. Used by input components to show inline error UI.
   */
  errors: Record<string, string>

  /** Set an error for a given path. */
  setError(path: string, message: string): void

  /** Clear the error for a given path. */
  clearError(path: string): void
}

/**
 * Default noop context — used when an A2UI component is accidentally
 * rendered outside an A2UISurface. Every mutation logs a warning so the
 * developer notices the missing provider rather than silently swallowing
 * user input.
 */
const defaultContext: A2UISurfaceContextValue = {
  dataModel: {},
  setBinding: (path, value) => {
    // eslint-disable-next-line no-console
    console.warn('[A2UI] setBinding called outside A2UISurface:', path, value)
  },
  emitAction: (message) => {
    // eslint-disable-next-line no-console
    console.warn('[A2UI] emitAction called outside A2UISurface:', message)
  },
  emitError: (message) => {
    // eslint-disable-next-line no-console
    console.warn('[A2UI] emitError called outside A2UISurface:', message)
  },
  errors: {},
  setError: () => {},
  clearError: () => {},
}

export const A2UISurfaceContext = createContext<A2UISurfaceContextValue>(defaultContext)

/** Hook for any component inside an A2UI surface to access runtime services. */
export function useA2UI(): A2UISurfaceContextValue {
  return useContext(A2UISurfaceContext)
}
