import type { FocusTarget, WorkspaceState } from './schema'

export interface WorkspaceRowSummary {
  status: 'remembered-active' | 'ready' | 'idle'
  headline: string
  detail: string
}

function formatFocusTarget(target: FocusTarget | null): string | null {
  if (!target) return null
  return `${target.kind} ${target.id}`
}

export function buildWorkspaceRowSummary(workspace: WorkspaceState): WorkspaceRowSummary {
  const focusLabel = formatFocusTarget(workspace.attention.primaryFocus)
  const unresolvedCount = workspace.attention.unresolvedTargets.length
  const surfaceCount = workspace.resident.activeSurfaceIds.length

  if (workspace.resident.activeInvocationId) {
    const details = [focusLabel, unresolvedCount > 0 ? `${unresolvedCount} unresolved` : null, surfaceCount > 0 ? `${surfaceCount} surface${surfaceCount === 1 ? '' : 's'}` : null]
      .filter((value): value is string => Boolean(value))

    return {
      status: 'remembered-active',
      headline: 'Remembered active work',
      detail: details.join(' • ') || 'Workspace remembers in-progress work',
    }
  }

  if (focusLabel) {
    return {
      status: 'ready',
      headline: `Ready in ${focusLabel}`,
      detail: unresolvedCount > 0 ? `${unresolvedCount} unresolved target${unresolvedCount === 1 ? '' : 's'} remembered` : 'No unresolved work remembered',
    }
  }

  return {
    status: 'idle',
    headline: workspace.resident.stance === 'waiting' ? 'Waiting' : 'Idle',
    detail: 'No active thread or surface remembered',
  }
}
