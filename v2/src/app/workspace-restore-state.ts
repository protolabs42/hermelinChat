import type { FocusTarget } from '../lane2/schema'

export interface WorkspaceRestoreState {
  reason: 'pinned-surface-reconnecting' | 'focused-surface-reconnecting' | 'anchored-surface-reconnecting'
  title: string
  label: string
  detail: string
  surfaceId: string
  workspaceId: string | null
}

function buildLabel(surfaceId: string): string {
  return `Restoring ${surfaceId}`
}

export function buildWorkspaceRestoreState(args: {
  activeWorkspaceId: string | null
  pinnedSurfaceId: string | null
  primaryFocus: FocusTarget | null
  liveSurfaceIds: string[]
  surfaceAnchorIds: string[]
}): WorkspaceRestoreState | null {
  const liveIds = new Set(args.liveSurfaceIds)

  if (args.pinnedSurfaceId && !liveIds.has(args.pinnedSurfaceId)) {
    return {
      reason: 'pinned-surface-reconnecting',
      title: 'Restoring pinned surface',
      label: buildLabel(args.pinnedSurfaceId),
      detail: `Pinned surface ${args.pinnedSurfaceId} is reconnecting for workspace ${args.activeWorkspaceId ?? 'current'}.`,
      surfaceId: args.pinnedSurfaceId,
      workspaceId: args.activeWorkspaceId,
    }
  }

  if (args.primaryFocus?.kind === 'surface' && !liveIds.has(args.primaryFocus.id)) {
    return {
      reason: 'focused-surface-reconnecting',
      title: 'Restoring active surface',
      label: buildLabel(args.primaryFocus.id),
      detail: `Active surface ${args.primaryFocus.id} is reconnecting for workspace ${args.activeWorkspaceId ?? 'current'}.`,
      surfaceId: args.primaryFocus.id,
      workspaceId: args.activeWorkspaceId,
    }
  }

  const anchoredMissing = args.surfaceAnchorIds.find((surfaceId) => !liveIds.has(surfaceId))
  if (anchoredMissing) {
    return {
      reason: 'anchored-surface-reconnecting',
      title: 'Restoring remembered surface',
      label: buildLabel(anchoredMissing),
      detail: `Surface ${anchoredMissing} is still restoring into workspace ${args.activeWorkspaceId ?? 'current'}.`,
      surfaceId: anchoredMissing,
      workspaceId: args.activeWorkspaceId,
    }
  }

  return null
}
