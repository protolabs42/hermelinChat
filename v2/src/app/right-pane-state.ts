import type { WorkspacePaneLayout } from '../lane2/schema'

export function resolveRightPaneLayout(args: {
  storedLayout: WorkspacePaneLayout
  panelOpen: boolean
  pinnedSurfaceId: string | null
}): WorkspacePaneLayout {
  if (args.storedLayout.mode !== 'hidden') {
    return args.storedLayout
  }
  if (!args.panelOpen) {
    return args.storedLayout
  }
  return args.pinnedSurfaceId
    ? { mode: 'single', primaryPane: 'surfaces' }
    : { mode: 'single', primaryPane: 'artifacts' }
}

export function buildSurfacePaneEmptyState(args: {
  pinnedSurfaceId: string | null
  pinnedSurfaceTitle: string | null
  liveSurfaceCount: number
}): { title: string; detail: string } {
  if (args.pinnedSurfaceId && args.liveSurfaceCount === 0) {
    return {
      title: 'Restoring pinned surface',
      detail: `${args.pinnedSurfaceTitle || args.pinnedSurfaceId} is pinned for this workspace. Waiting for the live surface runtime to reconnect.`,
    }
  }
  return {
    title: 'No live surfaces',
    detail: 'Launch or restore a surface to keep it docked here',
  }
}

export function buildSurfaceAnchorLoadingCopy(args: {
  surfaceId: string
  isPinned: boolean
}): string {
  if (args.isPinned) {
    return `Restoring pinned surface "${args.surfaceId}" for this workspace…`
  }
  return `A2UI surface "${args.surfaceId}" is loading…`
}
