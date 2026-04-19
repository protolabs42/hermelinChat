import {
  createEmptyWorkspaceState,
  type FocusTarget,
  type WorkspaceState,
  type WorkspaceSurface,
  type WorkspaceChromeState,
} from './schema'
import {
  clampArtifactPanelWidth,
  DEFAULT_ARTIFACT_PANEL_WIDTH,
} from '../stores/artifacts'
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
} from '../stores/sidebar'

export const DEFAULT_WORKSPACE_ID = 'default'

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
  chrome?: WorkspaceChromeState
  existing?: WorkspaceState | null
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
  const pinnedTargets: FocusTarget[] = chrome.pinnedSurfaceId
    ? [{ kind: 'surface', id: chrome.pinnedSurfaceId }]
    : []
  const heldContextIds = projectContextId(args.projectId) ? [projectContextId(args.projectId)!] : []
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
      workspaceId,
      updatedAt: now,
    },
    attention: {
      ...base.attention,
      primaryFocus,
      pinnedTargets,
      updatedAt: now,
    },
    surfaces,
    continuity: {
      ...base.continuity,
      activeThreadId: args.sessionId,
      lastActiveSurfaceId: args.orderedSurfaceIds.length > 0 ? args.orderedSurfaceIds[args.orderedSurfaceIds.length - 1] : null,
      pinnedSurfaceIds: chrome.pinnedSurfaceId ? [chrome.pinnedSurfaceId] : [],
      localAnchorIds: [...args.orderedSurfaceIds],
    },
    chrome,
    updatedAt: now,
  }
}
