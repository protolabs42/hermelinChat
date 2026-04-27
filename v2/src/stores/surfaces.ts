/**
 * A2UI surface store (Phase 4).
 *
 * Receives ordered batches of A2UI v0.9 messages from the Rust a2ui watcher
 * (which reads them out of ~/.hermes/a2ui-surfaces/session/) and folds each
 * batch into the live surface state. Components that render surfaces pull
 * from this store by id.
 *
 * Why a separate store from artifacts: artifacts are legacy blob-typed
 * side-panel content (tables, charts, logs). Surfaces are interactive A2UI
 * component trees inline in the chat stream. Overlap is zero, and mixing
 * would blur which renderer handles which event type.
 *
 * Ordering guarantees: batches carry a monotonic per-session `seq` set by
 * hermes. We drop stale batches (seq <= last applied) to survive file-watch
 * re-fires, and we detect gaps for logging but still apply them — the file
 * transport doesn't guarantee at-most-once delivery, but A2UI messages are
 * already idempotent (components are upserts, data-model patches are
 * absolute at their path).
 */

import { create } from 'zustand'
import type {
  Component,
  SurfaceState,
  A2UIServerMessage,
} from '../a2ui/types'
import type { SurfaceRuntimeState, WorkspaceState } from '../lane2/schema'
import { useChatStore } from './chat'

type ScopedSurfaceState = SurfaceState & { __sessionId: string | null }

/**
 * Envelope for one ordered batch of A2UI messages, as written to disk by
 * hermes and emitted to the frontend via the Tauri `a2ui:event` channel.
 */
export interface A2UIBatch {
  kind: 'a2ui-surface-batch'
  sessionId: string
  seq: number
  timestamp: number
  messages: A2UIServerMessage[]
}

export type A2UIEvent =
  | { kind: 'Batch'; batch: A2UIBatch }
  | { kind: 'List'; batches: A2UIBatch[] }
  | { kind: 'Remove'; surfaceId: string }

export function scopeA2UIEventToSession(
  event: A2UIEvent,
  activeSessionId: string | null
): A2UIEvent | null {
  if (!activeSessionId) {
    return null
  }

  switch (event.kind) {
    case 'Batch':
      return event.batch.sessionId === activeSessionId ? event : null
    case 'List': {
      const batches = event.batches.filter((batch) => batch.sessionId === activeSessionId)
      return batches.length > 0 ? { kind: 'List', batches } : null
    }
    case 'Remove':
      return event
    default:
      return null
  }
}

export function extractCreatedSurfaceIds(event: A2UIEvent): string[] {
  const batches = event.kind === 'Batch'
    ? [event.batch]
    : event.kind === 'List'
      ? event.batches
      : []

  return batches.flatMap((batch) => batch.messages)
    .filter((msg): msg is Extract<A2UIServerMessage, { createSurface: { surfaceId: string } }> => (
      !!msg && typeof msg === 'object' && 'createSurface' in msg
    ))
    .map((msg) => msg.createSurface.surfaceId)
}

export function snapshotSurfaceRuntime(surface: SurfaceState): SurfaceRuntimeState {
  return {
    revision: surface.revision ?? 0,
    currentState: {
      catalogId: surface.catalogId,
      theme: surface.theme,
      sendDataModel: surface.sendDataModel,
      dataModel: surface.dataModel,
      components: surface.components,
    },
    pendingOutbound: null,
    pendingInbound: null,
    localAttention: null,
  }
}

export function hydrateSurfaceState(
  surfaceId: string,
  runtime: SurfaceRuntimeState
): SurfaceState | null {
  const currentState = runtime.currentState ?? {}
  const catalogId = currentState.catalogId
  const theme = currentState.theme
  const components = currentState.components
  const dataModel = currentState.dataModel
  const sendDataModel = currentState.sendDataModel

  if (typeof catalogId !== 'string') return null
  if (!theme || typeof theme !== 'object') return null
  if (!components || typeof components !== 'object') return null
  if (!dataModel || typeof dataModel !== 'object') return null
  if (typeof sendDataModel !== 'boolean') return null

  return {
    surfaceId,
    catalogId,
    theme: theme as Record<string, unknown>,
    sendDataModel,
    components: components as Record<string, Component>,
    dataModel: dataModel as Record<string, unknown>,
    revision: runtime.revision,
  }
}

interface SurfaceStore {
  /** Live surfaces keyed by surfaceId. */
  surfaces: Record<string, ScopedSurfaceState>
  /** Last applied seq per session, used to drop stale/duplicate batches. */
  appliedSeq: Record<string, number>
  /** Chronological list of surface ids — order they first appeared. */
  orderedIds: string[]
  handleEvent: (event: A2UIEvent) => void
  hydrateWorkspaceRuntime: (workspace: WorkspaceState | null) => void
  reset: () => void
}

/* =============================================================================
 * Fold logic — apply a single A2UI server message to the store
 * ============================================================================= */

function applyMessage(
  surfaces: Record<string, ScopedSurfaceState>,
  orderedIds: string[],
  msg: A2UIServerMessage,
  sessionId: string
): { surfaces: Record<string, ScopedSurfaceState>; orderedIds: string[] } {
  // createSurface — fresh surface, empty components, empty data model
  if ('createSurface' in msg) {
    const s = msg.createSurface
    if (surfaces[s.surfaceId]) {
      // Re-create wipes the prior state; bump revision so renderer re-seeds.
      const prev = surfaces[s.surfaceId]
      return {
        surfaces: {
          ...surfaces,
          [s.surfaceId]: {
            surfaceId: s.surfaceId,
            catalogId: s.catalogId,
            theme: s.theme,
            sendDataModel: s.sendDataModel,
            components: {},
            dataModel: {},
            revision: (prev.revision ?? 0) + 1,
            __sessionId: sessionId,
          }
        },
        orderedIds,
      }
    }
    return {
      surfaces: {
        ...surfaces,
        [s.surfaceId]: {
          surfaceId: s.surfaceId,
          catalogId: s.catalogId,
          theme: s.theme,
          sendDataModel: s.sendDataModel,
          components: {},
          dataModel: {},
          revision: 1,
          __sessionId: sessionId,
        }
      },
      orderedIds: [...orderedIds, s.surfaceId],
    }
  }

  // updateComponents — upsert components by id
  if ('updateComponents' in msg) {
    const u = msg.updateComponents
    const target = surfaces[u.surfaceId]
    if (!target) return { surfaces, orderedIds }
    const nextComponents = { ...target.components }
    for (const comp of u.components) {
      nextComponents[comp.id] = comp as Component
    }
    return {
      surfaces: {
        ...surfaces,
        [u.surfaceId]: {
          ...target,
          components: nextComponents,
          revision: (target.revision ?? 0) + 1,
        },
      },
      orderedIds,
    }
  }

  // updateDataModel — spec allows either a full replace (no path) or a
  // partial write at a JSON Pointer path. We mirror both.
  if ('updateDataModel' in msg) {
    const u = msg.updateDataModel
    const target = surfaces[u.surfaceId]
    if (!target) return { surfaces, orderedIds }
    let nextModel: Record<string, unknown>
    if (!u.path || u.path === '/') {
      nextModel = (u.value ?? {}) as Record<string, unknown>
    } else {
      nextModel = { ...target.dataModel }
      const segments = u.path
        .slice(1)
        .split('/')
        .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
      let cursor: Record<string, unknown> = nextModel
      for (let i = 0; i < segments.length - 1; i++) {
        const k = segments[i]
        const existing = cursor[k]
        cursor[k] =
          existing && typeof existing === 'object'
            ? { ...(existing as Record<string, unknown>) }
            : {}
        cursor = cursor[k] as Record<string, unknown>
      }
      cursor[segments[segments.length - 1]] = u.value
    }
    return {
      surfaces: {
        ...surfaces,
        [u.surfaceId]: {
          ...target,
          dataModel: nextModel,
          revision: (target.revision ?? 0) + 1,
        },
      },
      orderedIds,
    }
  }

  // deleteSurface — remove from map and ordered list
  if ('deleteSurface' in msg) {
    const d = msg.deleteSurface
    if (!surfaces[d.surfaceId]) return { surfaces, orderedIds }
    const { [d.surfaceId]: _removed, ...rest } = surfaces
    void _removed
    return {
      surfaces: rest,
      orderedIds: orderedIds.filter((id) => id !== d.surfaceId),
    }
  }

  return { surfaces, orderedIds }
}

function applyBatch(
  state: SurfaceStore,
  batch: A2UIBatch
): Partial<SurfaceStore> {
  const last = state.appliedSeq[batch.sessionId] ?? 0
  if (batch.seq <= last) {
    // Already applied — drop silently
    return {}
  }
  if (batch.seq > last + 1 && last > 0) {
    // Gap — log for diagnostics but still apply (messages are idempotent)
    // eslint-disable-next-line no-console
    console.warn(
      `[A2UI] batch seq gap: session=${batch.sessionId} last=${last} seq=${batch.seq}`
    )
  }

  let surfaces = state.surfaces
  let orderedIds = state.orderedIds
  for (const msg of batch.messages) {
    const next = applyMessage(surfaces, orderedIds, msg, batch.sessionId)
    surfaces = next.surfaces
    orderedIds = next.orderedIds
  }

  return {
    surfaces,
    orderedIds,
    appliedSeq: { ...state.appliedSeq, [batch.sessionId]: batch.seq },
  }
}

/* =============================================================================
 * Zustand store
 * ============================================================================= */

export const useSurfaceStore = create<SurfaceStore>((set, get) => ({
  surfaces: {},
  appliedSeq: {},
  orderedIds: [],

  handleEvent: (event: A2UIEvent) => {
    switch (event.kind) {
      case 'Batch': {
        const patch = applyBatch(get(), event.batch)
        if (Object.keys(patch).length > 0) set(patch)
        break
      }
      case 'List': {
        // Initial load — sort by seq per-session so we fold in order
        const sorted = [...event.batches].sort(
          (a, b) => a.sessionId.localeCompare(b.sessionId) || a.seq - b.seq
        )
        let state = get()
        for (const batch of sorted) {
          const patch = applyBatch(state, batch)
          if (Object.keys(patch).length > 0) {
            state = { ...state, ...patch }
          }
        }
        set({
          surfaces: state.surfaces,
          orderedIds: state.orderedIds,
          appliedSeq: state.appliedSeq,
        })
        break
      }
      case 'Remove': {
        const s = get()
        const target = s.surfaces[event.surfaceId] as ScopedSurfaceState | undefined
        const activeSessionId = useChatStore.getState().sessionId
        if (!target || !activeSessionId || target.__sessionId !== activeSessionId) break
        const { [event.surfaceId]: _removed, ...rest } = s.surfaces
        void _removed
        set({
          surfaces: rest,
          orderedIds: s.orderedIds.filter((id) => id !== event.surfaceId),
        })
        break
      }
    }
  },

  hydrateWorkspaceRuntime: (workspace) => {
    if (!workspace) {
      set({ surfaces: {}, orderedIds: [], appliedSeq: {} })
      return
    }
    const hydratedEntries = Object.entries(workspace.runtime)
      .map(([surfaceId, runtime]) => {
        const hydrated = hydrateSurfaceState(surfaceId, runtime)
        if (!hydrated) return [surfaceId, null] as const
        return [surfaceId, {
          ...hydrated,
          __sessionId: workspace.continuity.activeThreadId ?? workspace.resident.sessionId ?? null,
        }] as const
      })
      .filter((entry): entry is [string, ScopedSurfaceState] => entry[1] !== null)
    set({
      surfaces: Object.fromEntries(hydratedEntries),
      orderedIds: workspace.resident.activeSurfaceIds.filter((surfaceId) =>
        hydratedEntries.some(([id]) => id === surfaceId)
      ),
      appliedSeq: {},
    })
  },

  reset: () => set({ surfaces: {}, appliedSeq: {}, orderedIds: [] }),
}))
