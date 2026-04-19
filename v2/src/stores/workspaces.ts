import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

import type { WorkspaceState } from '../lane2/schema'

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
  },
}))
