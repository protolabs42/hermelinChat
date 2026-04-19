import { buildWorkspaceContinuityCard, buildWorkspaceRowSummary } from '../lane2/workspace-summary'
import type { WorkspaceState } from '../lane2/schema'

export type WorkspaceStripTone = 'active' | 'ready' | 'idle'

export interface WorkspaceStripTab {
  workspaceId: string
  label: string
  isActive: boolean
  tone: WorkspaceStripTone
  hint: string
}

export interface WorkspaceStripModel {
  visibleTabs: WorkspaceStripTab[]
  overflowTabs: WorkspaceStripTab[]
  overflowCount: number
}

const DEFAULT_MAX_VISIBLE_COUNT = 4

function compactIdleHint(workspace: WorkspaceState): string {
  return workspace.resident.stance === 'waiting' ? 'waiting' : 'idle'
}

function compactReadyHint(workspace: WorkspaceState): string {
  const unresolvedCount = workspace.attention.unresolvedTargets.length
  if (unresolvedCount > 0) {
    return `${unresolvedCount} unresolved`
  }

  const activeSurface = workspace.resident.activeSurfaceIds
    .map((surfaceId) => workspace.surfaces[surfaceId])
    .find((surface): surface is NonNullable<typeof surface> => Boolean(surface))

  if (activeSurface?.title.toLowerCase().includes('coedit')) {
    return 'coedit open'
  }

  return compactIdleHint(workspace)
}

function mapTone(workspace: WorkspaceState): WorkspaceStripTone {
  const summary = buildWorkspaceRowSummary(workspace)
  if (summary.status === 'remembered-active') return 'active'
  if (summary.status === 'ready') return 'ready'

  const activeSurface = workspace.resident.activeSurfaceIds
    .map((surfaceId) => workspace.surfaces[surfaceId])
    .find((surface): surface is NonNullable<typeof surface> => Boolean(surface))

  if (activeSurface?.title.toLowerCase().includes('coedit')) return 'ready'
  return 'idle'
}

function buildHint(workspace: WorkspaceState): string {
  const continuityCard = buildWorkspaceContinuityCard(workspace)
  if (continuityCard?.tone === 'active') {
    return 'active'
  }

  const tone = mapTone(workspace)
  if (tone === 'ready') {
    return compactReadyHint(workspace)
  }

  return compactIdleHint(workspace)
}

function toTab(workspace: WorkspaceState, activeWorkspaceId: string | null): WorkspaceStripTab {
  return {
    workspaceId: workspace.workspaceId,
    label: workspace.workspaceId,
    isActive: workspace.workspaceId === activeWorkspaceId,
    tone: mapTone(workspace),
    hint: buildHint(workspace),
  }
}

export function buildWorkspaceStripModel(args: {
  workspaces: WorkspaceState[]
  activeWorkspaceId: string | null
  maxVisibleCount?: number
}): WorkspaceStripModel {
  const maxVisibleCount = Math.max(1, args.maxVisibleCount ?? DEFAULT_MAX_VISIBLE_COUNT)
  const tabs = args.workspaces.map((workspace) => toTab(workspace, args.activeWorkspaceId))

  if (tabs.length <= maxVisibleCount) {
    return {
      visibleTabs: tabs,
      overflowTabs: [],
      overflowCount: 0,
    }
  }

  const visibleTabs = tabs.slice(0, maxVisibleCount)
  const activeIndex = tabs.findIndex((tab) => tab.isActive)
  if (activeIndex >= maxVisibleCount) {
    visibleTabs[maxVisibleCount - 1] = tabs[activeIndex]!
  }

  const visibleIds = new Set(visibleTabs.map((tab) => tab.workspaceId))
  const overflowTabs = tabs.filter((tab) => !visibleIds.has(tab.workspaceId))

  return {
    visibleTabs,
    overflowTabs,
    overflowCount: overflowTabs.length,
  }
}
