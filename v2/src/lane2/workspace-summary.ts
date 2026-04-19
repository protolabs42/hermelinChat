import type { FocusTarget, UnresolvedTarget, WorkspaceState } from './schema'

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
  const activeInvocation = workspace.resident.activeInvocationId
    ? workspace.invocations[workspace.resident.activeInvocationId] ?? null
    : null

  if (activeInvocation?.recoveryActionLabel) {
    return activeInvocation.recoveryActionLabel
  }

  if (workspace.resident.activeInvocationId) {
    return threadId ? `Resume thread ${threadId}` : 'Resume remembered work'
  }

  if (focusLabel) {
    return `Open ${focusLabel}`
  }

  return 'Open workspace'
}

function semanticUnresolvedTarget(workspace: WorkspaceState): UnresolvedTarget | null {
  return workspace.attention.unresolvedTargets.find((target) => Boolean(target.label || target.reason)) ?? null
}

export function buildWorkspaceRowSummary(workspace: WorkspaceState): WorkspaceRowSummary {
  const focusLabel = formatFocusTarget(workspace.attention.primaryFocus)
  const unresolvedCount = workspace.attention.unresolvedTargets.length
  const surfaceCount = workspace.resident.activeSurfaceIds.length
  const actionLabel = buildActionLabel(workspace, focusLabel)
  const activeInvocation = workspace.resident.activeInvocationId
    ? workspace.invocations[workspace.resident.activeInvocationId] ?? null
    : null
  const semanticUnresolved = semanticUnresolvedTarget(workspace)

  if (workspace.resident.activeInvocationId) {
    const details = [
      activeInvocation?.summary ?? focusLabel,
      semanticUnresolved?.label ?? (unresolvedCount > 0 ? `${unresolvedCount} unresolved` : null),
      surfaceCount > 0 ? `${surfaceCount} surface${surfaceCount === 1 ? '' : 's'}` : null,
    ].filter((value): value is string => Boolean(value))

    return {
      status: 'remembered-active',
      headline: 'Remembered active work',
      detail: details.join(' • ') || 'Workspace remembers in-progress work',
      actionLabel,
    }
  }

  if (focusLabel) {
    if (semanticUnresolved?.label) {
      return {
        status: 'ready',
        headline: semanticUnresolved.label,
        detail: `Ready in ${focusLabel}`,
        actionLabel,
      }
    }

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
  const semanticUnresolved = semanticUnresolvedTarget(workspace)

  if (summary.status === 'remembered-active') {
    const activeInvocation = workspace.resident.activeInvocationId
      ? workspace.invocations[workspace.resident.activeInvocationId] ?? null
      : null
    return {
      tone: 'active',
      label: summary.headline,
      detail: activeInvocation?.summary ?? formatFocusTarget(workspace.attention.primaryFocus) ?? 'Workspace remembers in-progress work',
      actionLabel: summary.actionLabel,
    }
  }

  if (summary.status === 'ready' && unresolvedCount > 0) {
    return {
      tone: 'ready',
      label: semanticUnresolved?.label ?? `${unresolvedCount} unresolved remembered`,
      detail: semanticUnresolved?.label ? summary.detail : summary.headline,
      actionLabel: summary.actionLabel,
    }
  }

  return null
}
