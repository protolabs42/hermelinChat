import type { WorkspacePaneId } from '../lane2/schema'
import { createEmptyWorkspaceState } from '../lane2/schema'
import { closeRightRail, openArtifactPane, setRightRailLayout } from './right-rail'
import { usePaneStore } from '../stores/panes'
import { useWorkspaceStore } from '../stores/workspaces'

export type WorkspaceBridgeEvent =
  | {
      kind: 'openWorkspace'
      commandId: string
      name: string
      createIfMissing: boolean
      timestamp?: number | null
    }
  | {
      kind: 'focusPanel'
      commandId: string
      target: string
      workspaceId?: string | null
      timestamp?: number | null
    }
  | {
      kind: 'closePanel'
      commandId: string
      target: string
      workspaceId?: string | null
      timestamp?: number | null
    }

export function workspaceIdFromBridgeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace'
}

export function normalizeBridgePaneTarget(target: string): WorkspacePaneId | null {
  const normalized = target.trim().toLowerCase().replace(/_/g, '-')
  if (normalized === 'plan') return 'plan'
  if (normalized === 'tasks' || normalized === 'task') return 'tasks'
  if (normalized === 'surfaces' || normalized === 'surface') return 'surfaces'
  if (normalized === 'artifacts' || normalized === 'artifact') return 'artifacts'
  if (normalized === 'context') return 'context'
  return null
}

export async function applyWorkspaceBridgeEvent(event: WorkspaceBridgeEvent): Promise<void> {
  if (event.kind === 'openWorkspace') {
    await openBridgeWorkspace(event.name, event.createIfMissing)
    return
  }
  if (event.workspaceId) {
    const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspace?.workspaceId
    if (activeWorkspaceId !== event.workspaceId) {
      await useWorkspaceStore.getState().setActiveWorkspace(event.workspaceId)
    }
  }
  if (event.kind === 'focusPanel') {
    focusBridgePanel(event.target)
    return
  }
  closeBridgePanel(event.target)
}

export async function openBridgeWorkspace(name: string, createIfMissing = true): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  const store = useWorkspaceStore.getState()
  const exact = store.workspaces.find((workspace) => workspace.workspaceId === trimmed)
    ?? store.workspaces.find((workspace) => workspace.workspaceId === workspaceIdFromBridgeName(trimmed))
  if (exact) {
    await store.setActiveWorkspace(exact.workspaceId)
    return
  }
  if (!createIfMissing) return

  const workspaceId = workspaceIdFromBridgeName(trimmed)
  await store.upsertWorkspace(createEmptyWorkspaceState({ workspaceId }), true)
}

export function focusBridgePanel(target: string): void {
  const pane = normalizeBridgePaneTarget(target)
  if (!pane) return
  if (pane === 'artifacts') {
    openArtifactPane()
    return
  }
  if (pane === 'surfaces') {
    setRightRailLayout({ mode: 'single', primaryPane: 'surfaces' })
    return
  }
  usePaneStore.getState().openPane(pane)
}

export function closeBridgePanel(target: string): void {
  const normalized = target.trim().toLowerCase()
  if (normalized === 'right-rail' || normalized === 'right_rail') {
    closeRightRail()
    return
  }
  const pane = normalizeBridgePaneTarget(target)
  if (!pane) return
  if (pane === 'artifacts' || pane === 'surfaces') {
    usePaneStore.getState().closePane(pane)
    return
  }
  usePaneStore.getState().closePane(pane)
}
