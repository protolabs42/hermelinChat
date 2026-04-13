import { create } from 'zustand'

export interface SessionSummary {
  id: string
  title: string
  model: string | null
  started_at: number | null
  message_count: number
  cwd: string | null
}

interface SidebarStore {
  isOpen: boolean
  sessions: SessionSummary[]
  open: () => void
  close: () => void
  toggle: () => void
  loadSessions: () => Promise<void>
  loadSessionsForProject: (projectId: string) => Promise<void>
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  isOpen: false,
  sessions: [],
  open: () => {
    set({ isOpen: true })
    // Load sessions filtered by active project if one is set
    import('./projects').then(({ useProjectStore }) => {
      const { activeProjectId } = useProjectStore.getState()
      if (activeProjectId) {
        useSidebarStore.getState().loadSessionsForProject(activeProjectId)
      } else {
        useSidebarStore.getState().loadSessions()
      }
    }).catch(() => {
      useSidebarStore.getState().loadSessions()
    })
  },
  close: () => set({ isOpen: false }),
  toggle: () => {
    const current = useSidebarStore.getState()
    if (!current.isOpen) {
      current.open()
    } else {
      current.close()
    }
  },
  loadSessions: async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const sessions = await invoke<SessionSummary[]>('list_sessions', { limit: 30 })
      set({ sessions })
    } catch (e) {
      console.error('Failed to load sessions:', e)
    }
  },
  loadSessionsForProject: async (projectId: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const sessions = await invoke<SessionSummary[]>('get_sessions_for_project', {
        projectId,
        limit: 50,
      })
      set({ sessions })
    } catch (e) {
      console.error('Failed to load sessions for project:', e)
      // Fall back to loading all sessions
      useSidebarStore.getState().loadSessions()
    }
  },
}))
