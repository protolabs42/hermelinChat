import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

import type { WorkspaceState } from '../lane2/schema'
import {
  clampArtifactPanelWidth,
  DEFAULT_ARTIFACT_PANEL_WIDTH,
  useArtifactStore,
} from './artifacts'
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  useSidebarStore,
} from './sidebar'
import { useSurfaceStore } from './surfaces'

function applyWorkspaceChrome(workspace: WorkspaceState | null) {
  if (!workspace) return
  useSidebarStore.setState({
    width: clampSidebarWidth(
      workspace.chrome.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH
    ),
  })
  if (workspace.chrome.sidebarOpen) {
    useSidebarStore.getState().open()
  } else {
    useSidebarStore.getState().close()
  }
  useArtifactStore.setState({
    panelOpen: workspace.chrome.artifactPanelOpen,
    panelWidth: clampArtifactPanelWidth(
      workspace.chrome.artifactPanelWidth ?? DEFAULT_ARTIFACT_PANEL_WIDTH
    ),
    activeId: workspace.chrome.activeArtifactId,
    pinnedSurfaceId: workspace.chrome.pinnedSurfaceId,
  })
  useSurfaceStore.getState().hydrateWorkspaceRuntime(workspace)
}

interface WorkspaceStore {
  activeWorkspace: WorkspaceState | null
  workspaces: WorkspaceState[]
  hydrated: boolean
  loadActiveWorkspace: () => Promise<WorkspaceState | null>
  loadWorkspaces: () => Promise<WorkspaceState[]>
  upsertWorkspace: (workspace: WorkspaceState, makeActive?: boolean) => Promise<WorkspaceState>
  setActiveWorkspace: (workspaceId: string) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  activeWorkspace: null,
  workspaces: [],
  hydrated: false,

  loadActiveWorkspace: async () => {
    try {
      const workspace = await invoke<WorkspaceState | null>('lane2_get_active_workspace')
      set((state) => ({
        activeWorkspace: workspace,
        hydrated: true,
        workspaces: workspace && !state.workspaces.some((w) => w.workspaceId === workspace.workspaceId)
          ? [...state.workspaces, workspace]
          : state.workspaces,
      }))
      applyWorkspaceChrome(workspace)
      return workspace
    } catch (e) {
      console.error('[WorkspaceStore] loadActiveWorkspace failed:', e)
      set({ activeWorkspace: null, hydrated: true })
      return null
    }
  },

  loadWorkspaces: async () => {
    try {
      const workspaces = await invoke<WorkspaceState[]>('lane2_list_workspaces')
      const active = get().activeWorkspace
      set({
        workspaces,
        activeWorkspace: active ? workspaces.find((w) => w.workspaceId === active.workspaceId) ?? active : active,
        hydrated: true,
      })
      return workspaces
    } catch (e) {
      console.error('[WorkspaceStore] loadWorkspaces failed:', e)
      return get().workspaces
    }
  },

  upsertWorkspace: async (workspace: WorkspaceState, makeActive = true) => {
    const saved = await invoke<WorkspaceState>('lane2_upsert_workspace', {
      workspace,
      makeActive,
    })
    set((state) => {
      const rest = state.workspaces.filter((w) => w.workspaceId !== saved.workspaceId)
      return {
        activeWorkspace: makeActive ? saved : state.activeWorkspace,
        workspaces: [...rest, saved],
        hydrated: true,
      }
    })
    return saved
  },

  setActiveWorkspace: async (workspaceId: string) => {
    await invoke('lane2_set_active_workspace', { workspaceId })
    const target = get().workspaces.find((w) => w.workspaceId === workspaceId) ?? null
    set({ activeWorkspace: target, hydrated: true })
    applyWorkspaceChrome(target)
  },
}))
