import {
  createEmptyWorkspaceState,
  type WorkspaceState,
  type WorkspaceSurface,
} from './schema'

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
      heldContextIds,
      sessionId: args.sessionId,
      workspaceId,
      updatedAt: now,
    },
    surfaces,
    continuity: {
      ...base.continuity,
      activeThreadId: args.sessionId,
      lastActiveSurfaceId: args.orderedSurfaceIds.length > 0 ? args.orderedSurfaceIds[args.orderedSurfaceIds.length - 1] : null,
      localAnchorIds: [...args.orderedSurfaceIds],
    },
    updatedAt: now,
  }
}
