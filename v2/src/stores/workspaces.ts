import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

import type { WorkspaceState } from '../lane2/schema'

interface WorkspaceStore {
  activeWorkspace: WorkspaceState | null
  hydrated: boolean
  loadActiveWorkspace: () => Promise<WorkspaceState | null>
  upsertWorkspace: (workspace: WorkspaceState, makeActive?: boolean) => Promise<WorkspaceState>
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  activeWorkspace: null,
  hydrated: false,

  loadActiveWorkspace: async () => {
    try {
      const workspace = await invoke<WorkspaceState | null>('lane2_get_active_workspace')
      set({ activeWorkspace: workspace, hydrated: true })
      return workspace
    } catch (e) {
      console.error('[WorkspaceStore] loadActiveWorkspace failed:', e)
      set({ activeWorkspace: null, hydrated: true })
      return null
    }
  },

  upsertWorkspace: async (workspace: WorkspaceState, makeActive = true) => {
    const saved = await invoke<WorkspaceState>('lane2_upsert_workspace', {
      workspace,
      makeActive,
    })
    set({ activeWorkspace: saved, hydrated: true })
    return saved
  },
}))
