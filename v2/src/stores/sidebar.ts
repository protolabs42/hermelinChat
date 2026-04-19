import { create } from 'zustand'

export interface SessionSummary {
  id: string
  title: string
  model: string | null
  started_at: number | null
  message_count: number
  cwd: string | null
}

export const DEFAULT_SIDEBAR_WIDTH = 280
export const MIN_SIDEBAR_WIDTH = 220

export function clampSidebarWidth(
  width: number,
  viewportWidth: number = Number.POSITIVE_INFINITY
): number {
  const maxWidth = Number.isFinite(viewportWidth)
    ? Math.max(MIN_SIDEBAR_WIDTH, viewportWidth * 0.45)
    : Number.POSITIVE_INFINITY
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(width, maxWidth))
}

interface SidebarStore {
  isOpen: boolean
  width: number
  projectSwitcherOpen: boolean
  sessions: SessionSummary[]
  open: () => void
  close: () => void
  toggle: () => void
  setWidth: (width: number) => void
  openProjectSwitcher: () => void
  closeProjectSwitcher: () => void
  loadSessions: () => Promise<void>
  loadSessionsForProject: (projectId: string) => Promise<void>
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  isOpen: false,
  width: DEFAULT_SIDEBAR_WIDTH,
  projectSwitcherOpen: false,
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
  setWidth: (width) => set({ width: clampSidebarWidth(width) }),
  openProjectSwitcher: () => set({ projectSwitcherOpen: true }),
  closeProjectSwitcher: () => set({ projectSwitcherOpen: false }),
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
