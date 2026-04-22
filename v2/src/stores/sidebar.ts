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
  sessionsRequestSeq: number
  open: () => void
  close: () => void
  toggle: () => void
  setWidth: (width: number) => void
  openProjectSwitcher: () => void
  closeProjectSwitcher: () => void
  loadSessions: () => Promise<void>
  loadSessionsForProject: (projectId: string) => Promise<void>
  refreshSessionsForActiveProject: () => Promise<void>
}

export const useSidebarStore = create<SidebarStore>((set, get) => ({
  isOpen: false,
  width: DEFAULT_SIDEBAR_WIDTH,
  projectSwitcherOpen: false,
  sessions: [],
  sessionsRequestSeq: 0,
  open: () => {
    set({ isOpen: true })
    void get().refreshSessionsForActiveProject()
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
    const requestSeq = get().sessionsRequestSeq + 1
    set({ sessionsRequestSeq: requestSeq })
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const sessions = await invoke<SessionSummary[]>('list_sessions', { limit: 30 })
      if (get().sessionsRequestSeq === requestSeq) {
        set({ sessions })
      }
    } catch (e) {
      console.error('Failed to load sessions:', e)
    }
  },
  loadSessionsForProject: async (projectId: string) => {
    const requestSeq = get().sessionsRequestSeq + 1
    set({ sessionsRequestSeq: requestSeq })
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const sessions = await invoke<SessionSummary[]>('get_sessions_for_project', {
        projectId,
        limit: 50,
      })
      if (get().sessionsRequestSeq === requestSeq) {
        set({ sessions })
      }
    } catch (e) {
      console.error('Failed to load sessions for project:', e)
      if (get().sessionsRequestSeq === requestSeq) {
        await get().loadSessions()
      }
    }
  },
  refreshSessionsForActiveProject: async () => {
    try {
      const { useProjectStore, SCRATCHPAD_ID } = await import('./projects')
      const activeProjectId = useProjectStore.getState().activeProjectId
      if (activeProjectId && activeProjectId !== SCRATCHPAD_ID) {
        await get().loadSessionsForProject(activeProjectId)
      } else {
        await get().loadSessions()
      }
    } catch {
      await get().loadSessions()
    }
  },
}))
