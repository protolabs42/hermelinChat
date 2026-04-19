import type { WorkspaceState } from './schema'
import { extractProjectIdFromWorkspace } from './persistence'

export interface WorkspaceActivationPlan {
  workspaceId: string
  projectId: string | null
  sessionId: string | null
  anchorSurfaceIds: string[]
}

export interface WorkspaceActivationDeps {
  setActiveWorkspace: (workspaceId: string) => Promise<void>
  hydrateActiveProject: (projectId: string) => Promise<void>
  resetChat: () => void
  restoreSurfaceAnchors: (surfaceIds: string[]) => void
  loadSession: (sessionId: string, cwd: string | null) => Promise<void>
  newSession: (cwd: string | null) => Promise<void>
  getHomeDir: () => Promise<string | null>
  getProjectPath: (projectId: string) => string | null
  getCurrentProjectPath: () => string | null
}

export function buildWorkspaceActivationPlan(workspace: WorkspaceState): WorkspaceActivationPlan {
  return {
    workspaceId: workspace.workspaceId,
    projectId: extractProjectIdFromWorkspace(workspace),
    sessionId: workspace.continuity.activeThreadId ?? workspace.resident.sessionId ?? null,
    anchorSurfaceIds: [...workspace.continuity.localAnchorIds],
  }
}

export async function activateWorkspaceSnapshot(
  workspace: WorkspaceState,
  deps: WorkspaceActivationDeps
): Promise<void> {
  const plan = buildWorkspaceActivationPlan(workspace)
  await deps.setActiveWorkspace(plan.workspaceId)

  if (plan.projectId) {
    await deps.hydrateActiveProject(plan.projectId)
  }

  deps.resetChat()

  let cwd: string | null
  if (plan.projectId === 'scratchpad') {
    cwd = await deps.getHomeDir()
  } else if (plan.projectId) {
    cwd = deps.getProjectPath(plan.projectId)
  } else {
    cwd = deps.getCurrentProjectPath()
  }

  if (plan.sessionId) {
    await deps.loadSession(plan.sessionId, cwd)
  } else {
    await deps.newSession(cwd)
  }

  deps.restoreSurfaceAnchors(plan.anchorSurfaceIds)
}
