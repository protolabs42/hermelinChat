export type ResidentId = 'aurora'

export type ResidentStance =
  | 'attending'
  | 'drafting'
  | 'building'
  | 'remembering'
  | 'waiting'
  | 'invoking'

export type FocusTargetKind = 'surface' | 'thread' | 'memory' | 'artifact' | 'invocation'

export type UnresolvedTargetReason =
  | 'waiting-for-tool'
  | 'draft-in-progress'
  | 'coedit-open'
  | 'session-booting'

export type WorkspacePaneId = 'plan' | 'tasks' | 'surfaces' | 'artifacts' | 'context'

export type WorkspacePaneLayout =
  | { mode: 'hidden' }
  | { mode: 'single'; primaryPane: WorkspacePaneId }
  | { mode: 'stacked'; primaryPane: WorkspacePaneId; secondaryPane: WorkspacePaneId }

export interface FocusTarget {
  kind: FocusTargetKind
  id: string
}

export interface UnresolvedTarget extends FocusTarget {
  reason?: UnresolvedTargetReason
  label?: string
}

export interface ResidentState {
  residentId: 'aurora'
  stance: ResidentStance
  activeThreadId: string | null
  focusTarget: FocusTarget | null
  activeSurfaceIds: string[]
  heldContextIds: string[]
  activeInvocationId: string | null
  sessionId: string | null
  workspaceId: string
  updatedAt: number
}

export type InvocationKind = 'tool' | 'subagent' | 'external_cli' | 'background'

export type InvocationStatus =
  | 'pending'
  | 'active'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface InvocationContextRef {
  kind: FocusTargetKind | 'workspace'
  id: string
}

export interface InvocationEnvelope {
  invocationId: string
  kind: InvocationKind
  target: string
  summary: string | null
  recoveryActionLabel: string | null
  initiatedBy: 'aurora'
  workspaceId: string
  sessionId: string | null
  surfaceId: string | null
  threadId: string | null
  contextRefs: InvocationContextRef[]
  status: InvocationStatus
  createdAt: number
  updatedAt: number
}

export interface WorkspaceSurface {
  surfaceId: string
  surfaceKind: string
  title: string
  workspaceId: string
  sessionId: string | null
  createdBy: string
  heldBy: string | null
  createdAt: number
  updatedAt: number
  status: 'active' | 'suspended' | 'stale' | 'archived'
}

export interface SurfaceBinding {
  boundEntityId?: string | null
  boundWorkstreamId?: string | null
  boundArtifactIds: string[]
  boundMemoryRefs: string[]
  boundInvocationIds: string[]
  boundSessionIds: string[]
}

export interface SurfaceLineage {
  parentSurfaceId?: string | null
  derivedFromSurfaceId?: string | null
  supersedesSurfaceId?: string | null
  relatedSurfaceIds: string[]
}

export interface SurfaceRuntimeState {
  revision: number
  currentState: Record<string, unknown>
  pendingOutbound: unknown | null
  pendingInbound: unknown | null
  localAttention: Record<string, unknown> | null
}

export interface WorkspaceAttention {
  primaryFocus: FocusTarget | null
  backgroundHoldings: FocusTarget[]
  pinnedTargets: FocusTarget[]
  unresolvedTargets: UnresolvedTarget[]
  updatedAt: number
}

export interface WorkspaceContinuityState {
  lastActiveSurfaceId: string | null
  pinnedSurfaceIds: string[]
  suspendedSurfaceIds: string[]
  activeThreadId: string | null
  localAnchorIds: string[]
}

export interface WorkspaceChromeState {
  sidebarOpen: boolean
  sidebarWidth: number
  artifactPanelOpen: boolean
  artifactPanelWidth: number
  activeArtifactId: string | null
  pinnedSurfaceId: string | null
  rightRail?: WorkspacePaneLayout
}

export interface WorkspaceState {
  workspaceId: string
  resident: ResidentState
  attention: WorkspaceAttention
  surfaces: Record<string, WorkspaceSurface>
  bindings: Record<string, SurfaceBinding>
  lineage: Record<string, SurfaceLineage>
  runtime: Record<string, SurfaceRuntimeState>
  invocations: Record<string, InvocationEnvelope>
  continuity: WorkspaceContinuityState
  chrome: WorkspaceChromeState
  updatedAt: number
}

export function createEmptyWorkspaceState(
  args: { workspaceId: string; sessionId?: string | null; now?: number }
): WorkspaceState {
  const now = args.now ?? Date.now()
  return {
    workspaceId: args.workspaceId,
    resident: {
      residentId: 'aurora',
      stance: 'attending',
      activeThreadId: null,
      focusTarget: null,
      activeSurfaceIds: [],
      heldContextIds: [],
      activeInvocationId: null,
      sessionId: args.sessionId ?? null,
      workspaceId: args.workspaceId,
      updatedAt: now,
    },
    attention: {
      primaryFocus: null,
      backgroundHoldings: [],
      pinnedTargets: [],
      unresolvedTargets: [],
      updatedAt: now,
    },
    surfaces: {},
    bindings: {},
    lineage: {},
    runtime: {},
    invocations: {},
    continuity: {
      lastActiveSurfaceId: null,
      pinnedSurfaceIds: [],
      suspendedSurfaceIds: [],
      activeThreadId: null,
      localAnchorIds: [],
    },
    chrome: {
      sidebarOpen: false,
      sidebarWidth: 280,
      artifactPanelOpen: false,
      artifactPanelWidth: 420,
      activeArtifactId: null,
      pinnedSurfaceId: null,
      rightRail: { mode: 'hidden' },
    },
    updatedAt: now,
  }
}
