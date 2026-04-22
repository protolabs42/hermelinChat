import type { FocusTarget, WorkspacePaneId, WorkspacePaneLayout } from '../lane2/schema'
import { closePaneInLayout, normalizePaneLayout, openPaneInLayout, usePaneStore } from '../stores/panes'
import { useArtifactStore } from '../stores/artifacts'
import { resolveRightPaneLayout } from './right-pane-state'

export function layoutIncludesPane(layout: WorkspacePaneLayout, paneId: WorkspacePaneId): boolean {
  const normalized = normalizePaneLayout(layout)
  if (normalized.mode === 'hidden') return false
  if (normalized.mode === 'single') return normalized.primaryPane === paneId
  return normalized.primaryPane === paneId || normalized.secondaryPane === paneId
}

export function layoutUsesArtifactRail(layout: WorkspacePaneLayout): boolean {
  return layoutIncludesPane(layout, 'artifacts') || layoutIncludesPane(layout, 'surfaces')
}

export function syncArtifactRailState(layout: WorkspacePaneLayout) {
  useArtifactStore.setState({ panelOpen: layoutUsesArtifactRail(layout) })
}

export function setRightRailLayout(layout: WorkspacePaneLayout) {
  const normalized = normalizePaneLayout(layout)
  usePaneStore.getState().setLayout(normalized)
  syncArtifactRailState(normalized)
}

export function hydrateRightRail(args: {
  workspaceId: string
  layout: WorkspacePaneLayout | null | undefined
  panelOpen?: boolean
  pinnedSurfaceId?: string | null
}) {
  const resolved = resolveRightPaneLayout({
    storedLayout: normalizePaneLayout(args.layout),
    panelOpen: args.panelOpen ?? false,
    pinnedSurfaceId: args.pinnedSurfaceId ?? null,
  })
  const normalized = normalizePaneLayout(resolved)
  usePaneStore.getState().hydrateWorkspacePanes(args.workspaceId, normalized)
  syncArtifactRailState(normalized)
}

export function closeRightRail() {
  setRightRailLayout({ mode: 'hidden' })
}

export function toggleRightRailPane(paneId: WorkspacePaneId) {
  const current = normalizePaneLayout(usePaneStore.getState().layout)
  const next = layoutIncludesPane(current, paneId)
    ? closePaneInLayout(current, paneId)
    : openPaneInLayout(current, paneId)
  setRightRailLayout(next)
}

export function openArtifactPane(artifactId?: string | null) {
  if (artifactId) {
    useArtifactStore.getState().setActiveId(artifactId)
  }
  const current = normalizePaneLayout(usePaneStore.getState().layout)
  setRightRailLayout(openPaneInLayout(current, 'artifacts'))
}

export function openSurfacePane(surfaceId: string) {
  useArtifactStore.getState().pinSurface(surfaceId)
  const current = normalizePaneLayout(usePaneStore.getState().layout)
  setRightRailLayout(openPaneInLayout(current, 'surfaces'))
}

export function focusRightRailTarget(target: FocusTarget | null) {
  if (!target) return
  if (target.kind === 'surface') {
    openSurfacePane(target.id)
    return
  }
  if (target.kind === 'artifact') {
    openArtifactPane(target.id)
  }
}
