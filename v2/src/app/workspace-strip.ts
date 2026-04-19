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
const MAX_HINT_LENGTH = 32

function truncateHint(value: string): string {
  const compact = value.trim().replace(/\s+/g, ' ')
  if (compact.length <= MAX_HINT_LENGTH) return compact
  return `${compact.slice(0, MAX_HINT_LENGTH - 1)}…`
}

function mapTone(workspace: WorkspaceState): WorkspaceStripTone {
  const summary = buildWorkspaceRowSummary(workspace)
  if (summary.status === 'remembered-active') return 'active'
  if (summary.status === 'ready') return 'ready'
  return 'idle'
}

function buildHint(workspace: WorkspaceState): string {
  const continuityCard = buildWorkspaceContinuityCard(workspace)
  if (continuityCard?.tone === 'active') {
    return truncateHint(continuityCard.detail)
  }
  if (continuityCard?.tone === 'ready') {
    return truncateHint(continuityCard.label)
  }
  return truncateHint(buildWorkspaceRowSummary(workspace).headline)
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
