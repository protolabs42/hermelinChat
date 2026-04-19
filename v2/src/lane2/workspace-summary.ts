import type { FocusTarget, WorkspaceState } from './schema'

export interface WorkspaceRowSummary {
  status: 'remembered-active' | 'ready' | 'idle'
  headline: string
  detail: string
  actionLabel: string
}

export interface WorkspaceContinuityCard {
  tone: 'active' | 'ready'
  label: string
  detail: string
  actionLabel: string
}

function formatFocusTarget(target: FocusTarget | null): string | null {
  if (!target) return null
  return `${target.kind} ${target.id}`
}

function buildActionLabel(workspace: WorkspaceState, focusLabel: string | null): string {
  const threadId = workspace.continuity.activeThreadId ?? workspace.resident.sessionId

  if (workspace.resident.activeInvocationId) {
    return threadId ? `Resume thread ${threadId}` : 'Resume remembered work'
  }

  if (focusLabel) {
    return `Open ${focusLabel}`
  }

  return 'Open workspace'
}

export function buildWorkspaceRowSummary(workspace: WorkspaceState): WorkspaceRowSummary {
  const focusLabel = formatFocusTarget(workspace.attention.primaryFocus)
  const unresolvedCount = workspace.attention.unresolvedTargets.length
  const surfaceCount = workspace.resident.activeSurfaceIds.length
  const actionLabel = buildActionLabel(workspace, focusLabel)

  if (workspace.resident.activeInvocationId) {
    const details = [focusLabel, unresolvedCount > 0 ? `${unresolvedCount} unresolved` : null, surfaceCount > 0 ? `${surfaceCount} surface${surfaceCount === 1 ? '' : 's'}` : null]
      .filter((value): value is string => Boolean(value))

    return {
      status: 'remembered-active',
      headline: 'Remembered active work',
      detail: details.join(' • ') || 'Workspace remembers in-progress work',
      actionLabel,
    }
  }

  if (focusLabel) {
    return {
      status: 'ready',
      headline: `Ready in ${focusLabel}`,
      detail: unresolvedCount > 0 ? `${unresolvedCount} unresolved target${unresolvedCount === 1 ? '' : 's'} remembered` : 'No unresolved work remembered',
      actionLabel,
    }
  }

  return {
    status: 'idle',
    headline: workspace.resident.stance === 'waiting' ? 'Waiting' : 'Idle',
    detail: 'No active thread or surface remembered',
    actionLabel,
  }
}

export function buildWorkspaceContinuityCard(workspace: WorkspaceState): WorkspaceContinuityCard | null {
  const summary = buildWorkspaceRowSummary(workspace)
  const unresolvedCount = workspace.attention.unresolvedTargets.length

  if (summary.status === 'remembered-active') {
    return {
      tone: 'active',
      label: summary.headline,
      detail: formatFocusTarget(workspace.attention.primaryFocus) ?? 'Workspace remembers in-progress work',
      actionLabel: summary.actionLabel,
    }
  }

  if (summary.status === 'ready' && unresolvedCount > 0) {
    return {
      tone: 'ready',
      label: `${unresolvedCount} unresolved remembered`,
      detail: summary.headline,
      actionLabel: summary.actionLabel,
    }
  }

  return null
}
