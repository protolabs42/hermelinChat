import {
  createEmptyWorkspaceState,
  type FocusTarget,
  type UnresolvedTarget,
  type WorkspaceState,
  type WorkspaceSurface,
  type WorkspaceChromeState,
} from './schema'
import type { SurfaceState } from '../a2ui/types'
import {
  hydrateSurfaceState,
  snapshotSurfaceRuntime,
} from '../stores/surfaces'
import {
  clampArtifactPanelWidth,
  DEFAULT_ARTIFACT_PANEL_WIDTH,
} from '../stores/artifacts'
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
} from '../stores/sidebar'
import { normalizePaneLayout } from '../stores/panes'

export const DEFAULT_WORKSPACE_ID = 'default'

export type WorkspaceCreationMode = 'blank' | 'duplicate'

export function projectContextId(projectId: string | null): string | null {
  if (!projectId) return null
  return `project:${projectId}`
}

export function extractProjectIdFromWorkspace(workspace: WorkspaceState | null): string | null {
  if (!workspace) return null
  const match = workspace.resident.heldContextIds.find((id) => id.startsWith('project:'))
  return match ? match.slice('project:'.length) : null
}

function buildChromeState(
  chrome: WorkspaceChromeState | undefined,
  base: WorkspaceState
): WorkspaceChromeState {
  return {
    sidebarOpen: chrome?.sidebarOpen ?? base.chrome.sidebarOpen,
    sidebarWidth: clampSidebarWidth(
      chrome?.sidebarWidth ?? base.chrome.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH
    ),
    artifactPanelOpen: chrome?.artifactPanelOpen ?? base.chrome.artifactPanelOpen,
    artifactPanelWidth: clampArtifactPanelWidth(
      chrome?.artifactPanelWidth ?? base.chrome.artifactPanelWidth ?? DEFAULT_ARTIFACT_PANEL_WIDTH
    ),
    activeArtifactId: chrome?.activeArtifactId ?? base.chrome.activeArtifactId,
    pinnedSurfaceId: chrome?.pinnedSurfaceId ?? base.chrome.pinnedSurfaceId,
    rightRail: normalizePaneLayout(chrome?.rightRail ?? base.chrome.rightRail),
  }
}

function buildPrimaryFocus(
  chrome: WorkspaceChromeState,
  orderedSurfaceIds: string[],
  sessionId: string | null
): FocusTarget | null {
  if (chrome.pinnedSurfaceId) {
    return { kind: 'surface', id: chrome.pinnedSurfaceId }
  }
  if (chrome.artifactPanelOpen && chrome.activeArtifactId) {
    return { kind: 'artifact', id: chrome.activeArtifactId }
  }
  const lastSurfaceId = orderedSurfaceIds.length > 0
    ? orderedSurfaceIds[orderedSurfaceIds.length - 1]
    : null
  if (lastSurfaceId) {
    return { kind: 'surface', id: lastSurfaceId }
  }
  if (sessionId) {
    return { kind: 'thread', id: sessionId }
  }
  return null
}

function buildResidentStance(
  isStreaming: boolean | undefined,
  sessionId: string | null
): WorkspaceState['resident']['stance'] {
  if (isStreaming) return 'building'
  if (sessionId) return 'attending'
  return 'waiting'
}

function buildBackgroundHoldings(
  primaryFocus: FocusTarget | null,
  chrome: WorkspaceChromeState,
  orderedSurfaceIds: string[]
): FocusTarget[] {
  const holdings: FocusTarget[] = []
  for (const surfaceId of orderedSurfaceIds) {
    if (primaryFocus?.kind === 'surface' && primaryFocus.id === surfaceId) continue
    holdings.push({ kind: 'surface', id: surfaceId })
  }
  if (
    chrome.artifactPanelOpen
    && chrome.activeArtifactId
    && !(primaryFocus?.kind === 'artifact' && primaryFocus.id === chrome.activeArtifactId)
  ) {
    holdings.push({ kind: 'artifact', id: chrome.activeArtifactId })
  }
  return holdings
}

function formatInvocationSummary(primaryFocus: FocusTarget | null): string | null {
  if (!primaryFocus) return 'Working in remembered context'
  return `Working in ${primaryFocus.kind} ${primaryFocus.id}`
}

function buildLiveInvocation(
  isStreaming: boolean | undefined,
  workspaceId: string,
  sessionId: string | null,
  primaryFocus: FocusTarget | null,
  now: number
): WorkspaceState['invocations'] {
  if (!isStreaming || !sessionId) return {}
  const invocationId = `live:${sessionId}`
  const surfaceId = primaryFocus?.kind === 'surface' ? primaryFocus.id : null
  const contextRefs: WorkspaceState['invocations'][string]['contextRefs'] = [
    { kind: 'workspace', id: workspaceId },
    { kind: 'thread', id: sessionId },
  ]
  if (surfaceId) {
    contextRefs.push({ kind: 'surface', id: surfaceId })
  }
  return {
    [invocationId]: {
      invocationId,
      kind: 'background',
      target: 'live-session',
      summary: formatInvocationSummary(primaryFocus),
      recoveryActionLabel: sessionId ? `Resume thread ${sessionId}` : 'Resume remembered work',
      initiatedBy: 'aurora',
      workspaceId,
      sessionId,
      surfaceId,
      threadId: sessionId,
      contextRefs,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  }
}

function buildUnresolvedTargets(
  isStreaming: boolean | undefined,
  primaryFocus: FocusTarget | null
): UnresolvedTarget[] {
  if (!isStreaming || !primaryFocus) return []
  return [{
    ...primaryFocus,
    reason: 'draft-in-progress',
    label: 'Draft in progress',
  }]
}

function buildRuntimeState(
  surfaceIds: string[],
  liveSurfaces: Record<string, SurfaceState> | undefined,
  base: WorkspaceState
): WorkspaceState['runtime'] {
  const nextRuntime: WorkspaceState['runtime'] = {}
  for (const surfaceId of surfaceIds) {
    const live = liveSurfaces?.[surfaceId]
    if (live) {
      nextRuntime[surfaceId] = snapshotSurfaceRuntime(live)
      continue
    }
    if (base.runtime[surfaceId]) {
      nextRuntime[surfaceId] = base.runtime[surfaceId]
    }
  }
  return nextRuntime
}

export function buildWorkspaceCreationSnapshot(args: {
  mode: WorkspaceCreationMode
  workspaceId: string
  projectId: string | null
  existing?: WorkspaceState | null
  sessionId: string | null
  orderedSurfaceIds: string[]
  anchorSurfaceIds?: string[]
  chrome?: WorkspaceChromeState
  liveSurfaces?: Record<string, SurfaceState>
  isStreaming?: boolean
  now?: number
}): WorkspaceState {
  if (args.mode === 'duplicate') {
    return buildWorkspaceSnapshot({
      anchorSurfaceIds: args.anchorSurfaceIds,
      chrome: args.chrome,
      existing: args.existing,
      isStreaming: args.isStreaming,
      liveSurfaces: args.liveSurfaces,
      now: args.now,
      orderedSurfaceIds: args.orderedSurfaceIds,
      projectId: args.projectId,
      sessionId: args.sessionId,
      workspaceId: args.workspaceId,
    })
  }

  const now = args.now ?? Date.now()
  const workspace = createEmptyWorkspaceState({ workspaceId: args.workspaceId, now })
  const heldContextId = projectContextId(args.projectId)

  return {
    ...workspace,
    resident: {
      ...workspace.resident,
      stance: 'waiting',
      heldContextIds: heldContextId ? [heldContextId] : [],
      workspaceId: args.workspaceId,
      updatedAt: now,
    },
    updatedAt: now,
  }
}

export function hydrateWorkspaceSurfaceState(workspace: WorkspaceState): {
  surfaces: Record<string, SurfaceState>
  orderedIds: string[]
} {
  const surfaces = Object.fromEntries(
    Object.entries(workspace.runtime)
      .map(([surfaceId, runtime]) => [surfaceId, hydrateSurfaceState(surfaceId, runtime)])
      .filter((entry): entry is [string, SurfaceState] => entry[1] !== null)
  )
  const orderedIds = workspace.resident.activeSurfaceIds.filter((surfaceId) => Boolean(surfaces[surfaceId]))
  return { surfaces, orderedIds }
}

function buildSurface(
  surfaceId: string,
  workspaceId: string,
  sessionId: null | string,
  now: number,
  previous?: WorkspaceSurface
): WorkspaceSurface {
  return {
    surfaceId,
    surfaceKind: previous?.surfaceKind ?? 'a2ui',
    title: previous?.title ?? surfaceId,
    workspaceId,
    sessionId,
    createdBy: previous?.createdBy ?? 'aurora',
    heldBy: previous?.heldBy ?? 'aurora',
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    status: 'active',
  }
}

export function buildWorkspaceSnapshot(args: {
  anchorSurfaceIds?: string[]
  chrome?: WorkspaceChromeState
  existing?: WorkspaceState | null
  isStreaming?: boolean
  liveSurfaces?: Record<string, SurfaceState>
  now?: number
  orderedSurfaceIds: string[]
  projectId: string | null
  sessionId: string | null
  workspaceId?: string
}): WorkspaceState {
  const now = args.now ?? Date.now()
  const workspaceId = args.workspaceId ?? args.existing?.workspaceId ?? DEFAULT_WORKSPACE_ID
  const base = args.existing ?? createEmptyWorkspaceState({ workspaceId, sessionId: args.sessionId, now })
  const chrome = buildChromeState(args.chrome, base)
  const primaryFocus = buildPrimaryFocus(chrome, args.orderedSurfaceIds, args.sessionId)
  const stance = buildResidentStance(args.isStreaming, args.sessionId)
  const backgroundHoldings = buildBackgroundHoldings(primaryFocus, chrome, args.orderedSurfaceIds)
  const unresolvedTargets = buildUnresolvedTargets(args.isStreaming, primaryFocus)
  const pinnedTargets: FocusTarget[] = chrome.pinnedSurfaceId
    ? [{ kind: 'surface', id: chrome.pinnedSurfaceId }]
    : []
  const invocations = buildLiveInvocation(args.isStreaming, workspaceId, args.sessionId, primaryFocus, now)
  const runtime = buildRuntimeState(args.orderedSurfaceIds, args.liveSurfaces, base)
  const heldContextIds = projectContextId(args.projectId) ? [projectContextId(args.projectId)!] : []
  const localAnchorIds = args.anchorSurfaceIds && args.anchorSurfaceIds.length > 0
    ? [...args.anchorSurfaceIds]
    : [...args.orderedSurfaceIds]
  const surfaces = Object.fromEntries(
    args.orderedSurfaceIds.map((surfaceId) => [
      surfaceId,
      buildSurface(surfaceId, workspaceId, args.sessionId, now, base.surfaces[surfaceId]),
    ])
  )

  return {
    ...base,
    workspaceId,
    resident: {
      ...base.resident,
      activeSurfaceIds: [...args.orderedSurfaceIds],
      focusTarget: primaryFocus,
      heldContextIds,
      sessionId: args.sessionId,
      stance,
      activeInvocationId: args.isStreaming && args.sessionId ? `live:${args.sessionId}` : null,
      workspaceId,
      updatedAt: now,
    },
    attention: {
      ...base.attention,
      primaryFocus,
      backgroundHoldings,
      pinnedTargets,
      unresolvedTargets,
      updatedAt: now,
    },
    surfaces,
    runtime,
    invocations,
    continuity: {
      ...base.continuity,
      activeThreadId: args.sessionId,
      lastActiveSurfaceId: args.orderedSurfaceIds.length > 0 ? args.orderedSurfaceIds[args.orderedSurfaceIds.length - 1] : null,
      pinnedSurfaceIds: chrome.pinnedSurfaceId ? [chrome.pinnedSurfaceId] : [],
      localAnchorIds,
    },
    chrome,
    updatedAt: now,
  }
}
