import { create } from 'zustand'

import type { WorkspacePaneId, WorkspacePaneLayout } from '../lane2/schema'

export function createHiddenPaneLayout(): WorkspacePaneLayout {
  return { mode: 'hidden' }
}

export function normalizePaneLayout(layout: WorkspacePaneLayout | null | undefined): WorkspacePaneLayout {
  if (!layout || layout.mode === 'hidden') {
    return createHiddenPaneLayout()
  }
  if (layout.mode === 'single') {
    return { mode: 'single', primaryPane: layout.primaryPane }
  }
  if (layout.primaryPane === layout.secondaryPane) {
    return { mode: 'single', primaryPane: layout.primaryPane }
  }
  return {
    mode: 'stacked',
    primaryPane: layout.primaryPane,
    secondaryPane: layout.secondaryPane,
  }
}

export function openPaneInLayout(
  layout: WorkspacePaneLayout,
  paneId: WorkspacePaneId
): WorkspacePaneLayout {
  const current = normalizePaneLayout(layout)
  if (current.mode === 'hidden') {
    return { mode: 'single', primaryPane: paneId }
  }
  if (current.mode === 'single') {
    if (current.primaryPane === paneId) return current
    return {
      mode: 'stacked',
      primaryPane: paneId,
      secondaryPane: current.primaryPane,
    }
  }
  if (current.primaryPane === paneId) return current
  if (current.secondaryPane === paneId) {
    return {
      mode: 'stacked',
      primaryPane: paneId,
      secondaryPane: current.primaryPane,
    }
  }
  return {
    mode: 'stacked',
    primaryPane: paneId,
    secondaryPane: current.primaryPane,
  }
}

export function closePaneInLayout(
  layout: WorkspacePaneLayout,
  paneId: WorkspacePaneId
): WorkspacePaneLayout {
  const current = normalizePaneLayout(layout)
  if (current.mode === 'hidden') return current
  if (current.mode === 'single') {
    return current.primaryPane === paneId ? createHiddenPaneLayout() : current
  }
  if (current.primaryPane === paneId) {
    return { mode: 'single', primaryPane: current.secondaryPane }
  }
  if (current.secondaryPane === paneId) {
    return { mode: 'single', primaryPane: current.primaryPane }
  }
  return current
}

interface PaneStore {
  workspaceId: string | null
  layout: WorkspacePaneLayout
  setLayout: (layout: WorkspacePaneLayout) => void
  openPane: (paneId: WorkspacePaneId) => void
  togglePane: (paneId: WorkspacePaneId) => void
  closePane: (paneId: WorkspacePaneId) => void
  hydrateWorkspacePanes: (workspaceId: string, layout: WorkspacePaneLayout | null | undefined) => void
  snapshotWorkspacePanes: () => WorkspacePaneLayout
}

export const usePaneStore = create<PaneStore>((set, get) => ({
  workspaceId: null,
  layout: createHiddenPaneLayout(),
  setLayout: (layout) => set({ layout: normalizePaneLayout(layout) }),
  openPane: (paneId) => set((state) => ({ layout: openPaneInLayout(state.layout, paneId) })),
  togglePane: (paneId) => set((state) => {
    const current = normalizePaneLayout(state.layout)
    if (current.mode === 'hidden') {
      return { layout: openPaneInLayout(current, paneId) }
    }
    if (current.mode === 'single' && current.primaryPane === paneId) {
      return { layout: createHiddenPaneLayout() }
    }
    if (current.mode === 'stacked' && current.primaryPane === paneId) {
      return { layout: closePaneInLayout(current, paneId) }
    }
    return { layout: openPaneInLayout(current, paneId) }
  }),
  closePane: (paneId) => set((state) => ({ layout: closePaneInLayout(state.layout, paneId) })),
  hydrateWorkspacePanes: (workspaceId, layout) => set({
    workspaceId,
    layout: normalizePaneLayout(layout),
  }),
  snapshotWorkspacePanes: () => normalizePaneLayout(get().layout),
}))
