import { create } from 'zustand'

export interface SessionSummary {
  id: string
  title: string
  model: string | null
  started_at: number | null
  message_count: number
}

interface SidebarStore {
  isOpen: boolean
  sessions: SessionSummary[]
  open: () => void
  close: () => void
  toggle: () => void
  loadSessions: () => Promise<void>
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  isOpen: false,
  sessions: [],
  open: () => {
    set({ isOpen: true })
    useSidebarStore.getState().loadSessions()
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
}))
