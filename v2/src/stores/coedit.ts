import { create } from 'zustand'

export interface PatchOp {
  op: string
  path: string
  value: unknown
}

export interface TextSelectionRange {
  start: number
  end: number
}

export interface PendingOutboundPatch {
  baseRevision: number
  patch: PatchOp[]
  selection: TextSelectionRange | null
}

export interface CoeditSurfaceInstance {
  surfaceInstanceId: string
  sessionId: string
  surfaceId: string
  server: string
  resourceUri: string
  state: Record<string, unknown>
  revision: number
  updatedAt: number
  selection: TextSelectionRange | null
  pendingOutboundPatch: PendingOutboundPatch | null
  presence: Record<string, string>
}

function now(): number {
  return Date.now()
}

function applyReplace(target: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  if (!path.startsWith('/')) {
    throw new Error(`unsupported patch path: ${path}`)
  }
  const segments = path
    .slice(1)
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))

  if (segments.length === 0) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('root replacement requires an object value')
    }
    return { ...(value as Record<string, unknown>) }
  }

  const next: Record<string, unknown> = { ...target }
  let cursor: Record<string, unknown> = next
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]
    const existing = cursor[key]
    const branch =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {}
    cursor[key] = branch
    cursor = branch
  }
  cursor[segments[segments.length - 1]] = value
  return next
}

export function applyPatchOps(
  state: Record<string, unknown>,
  patch: PatchOp[]
): Record<string, unknown> {
  return patch.reduce((acc, op) => {
    if (op.op !== 'replace') {
      throw new Error(`unsupported patch op: ${op.op}`)
    }
    return applyReplace(acc, op.path, op.value)
  }, state)
}

export function recordLocalPatch(
  current: CoeditSurfaceInstance,
  patch: PatchOp[],
  selection: TextSelectionRange | null = null
): CoeditSurfaceInstance {
  return {
    ...current,
    state: applyPatchOps(current.state, patch),
    revision: current.revision + 1,
    updatedAt: now(),
    selection,
    pendingOutboundPatch: {
      baseRevision: current.revision,
      patch,
      selection,
    },
    presence: { ...current.presence, user: 'editing' },
  }
}

export function applyHostPatch(
  current: CoeditSurfaceInstance,
  baseRevision: number,
  patch: PatchOp[],
  authoredBy: string
): CoeditSurfaceInstance {
  if (current.revision !== baseRevision) {
    throw new Error(`revision conflict: current=${current.revision} base=${baseRevision}`)
  }
  return {
    ...current,
    state: applyPatchOps(current.state, patch),
    revision: current.revision + 1,
    updatedAt: now(),
    pendingOutboundPatch: null,
    presence: { ...current.presence, [authoredBy]: 'patched' },
  }
}

export function createCoeditStore() {
  const instances = new Map<string, CoeditSurfaceInstance>()
  return {
    registerInstance(instance: CoeditSurfaceInstance) {
      instances.set(instance.surfaceInstanceId, instance)
    },
    get(surfaceInstanceId: string) {
      return instances.get(surfaceInstanceId)
    },
  }
}

interface CoeditStore {
  instances: Record<string, CoeditSurfaceInstance>
  registerInstance: (instance: CoeditSurfaceInstance) => void
  recordLocalPatch: (
    surfaceInstanceId: string,
    patch: PatchOp[],
    selection?: TextSelectionRange | null
  ) => void
  applyHostPatch: (
    surfaceInstanceId: string,
    baseRevision: number,
    patch: PatchOp[],
    authoredBy: string
  ) => void
  setPresence: (surfaceInstanceId: string, actor: string, status: string) => void
  clearPendingOutboundPatch: (surfaceInstanceId: string) => void
}

export const useCoeditStore = create<CoeditStore>((set) => ({
  instances: {},
  registerInstance: (instance) =>
    set((state) => ({
      instances: {
        ...state.instances,
        [instance.surfaceInstanceId]: instance,
      },
    })),
  recordLocalPatch: (surfaceInstanceId, patch, selection = null) =>
    set((state) => {
      const current = state.instances[surfaceInstanceId]
      if (!current) return state
      return {
        instances: {
          ...state.instances,
          [surfaceInstanceId]: recordLocalPatch(current, patch, selection),
        },
      }
    }),
  applyHostPatch: (surfaceInstanceId, baseRevision, patch, authoredBy) =>
    set((state) => {
      const current = state.instances[surfaceInstanceId]
      if (!current) return state
      return {
        instances: {
          ...state.instances,
          [surfaceInstanceId]: applyHostPatch(current, baseRevision, patch, authoredBy),
        },
      }
    }),
  setPresence: (surfaceInstanceId, actor, status) =>
    set((state) => {
      const current = state.instances[surfaceInstanceId]
      if (!current) return state
      return {
        instances: {
          ...state.instances,
          [surfaceInstanceId]: {
            ...current,
            presence: {
              ...current.presence,
              [actor]: status,
            },
          },
        },
      }
    }),
  clearPendingOutboundPatch: (surfaceInstanceId) =>
    set((state) => {
      const current = state.instances[surfaceInstanceId]
      if (!current) return state
      return {
        instances: {
          ...state.instances,
          [surfaceInstanceId]: {
            ...current,
            pendingOutboundPatch: null,
          },
        },
      }
    }),
}))
