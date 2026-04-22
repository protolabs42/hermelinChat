// v2/src/stores/projects.ts
//
// Zustand project store backed by Tauri commands.
// Projects are first-class named folders with git awareness.
// The Scratchpad is a synthesized virtual project (never stored in projects.json).

import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { startFreshSession } from '../app/session-start'

// ── Types ──────────────────────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  path: string
  createdAt: number    // epoch ms
  lastOpenedAt: number // epoch ms
  pinned: boolean
}

export interface GitInfo {
  branch: string | null
  dirty: boolean
  remote: string | null
}

export interface DetectedProject {
  git_root: string
  suggested_name: string
  git_info: GitInfo
}

// ── Scratchpad constant ────────────────────────────────────────────────

export const SCRATCHPAD_ID = 'scratchpad'

export const SCRATCHPAD: Project = {
  id: SCRATCHPAD_ID,
  name: 'Scratchpad',
  path: '',
  createdAt: 0,
  lastOpenedAt: 0,
  pinned: false,
}

// ── Store interface ────────────────────────────────────────────────────

interface ProjectStore {
  projects: Record<string, Project>
  activeProjectId: string | null
  gitInfo: Record<string, GitInfo>
  loading: boolean

  refresh(): Promise<void>
  setActiveProject(id: string): Promise<void>
  hydrateActiveProject(id: string): Promise<void>
  addProject(path: string, name?: string): Promise<Project>
  removeProject(id: string): Promise<void>
  updateProject(id: string, updates: { name?: string; pinned?: boolean }): Promise<void>
  refreshGitInfo(projectId: string): Promise<void>
  assignSession(sessionId: string, projectId: string): Promise<void>
  getActiveProject(): Project | null
}

// ── Raw Tauri response type ────────────────────────────────────────────

interface RawProject {
  id: string
  name: string
  path: string
  created_at: number
  last_opened_at: number
  pinned: boolean
}

function mapProject(raw: RawProject): Project {
  return {
    id: raw.id,
    name: raw.name,
    path: raw.path,
    createdAt: raw.created_at,
    lastOpenedAt: raw.last_opened_at,
    pinned: raw.pinned,
  }
}

// ── Store ──────────────────────────────────────────────────────────────

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: {},
  activeProjectId: null,
  gitInfo: {},
  loading: false,

  refresh: async () => {
    set({ loading: true })
    try {
      const list = await invoke<RawProject[]>('list_projects')
      const projects: Record<string, Project> = {}
      for (const raw of list) {
        const p = mapProject(raw)
        projects[p.id] = p
      }
      set({ projects, loading: false })
    } catch (e) {
      console.error('[ProjectStore] refresh failed:', e)
      set({ loading: false })
    }
  },

  setActiveProject: async (id: string) => {
    // 1. Persist via Rust (updates last_opened_at)
    await invoke('set_active_project', { id })

    // 2. Update local state
    set({ activeProjectId: id })

    // 3. Refresh git info for this project
    await get().refreshGitInfo(id)

    // 4. Reset the chat store
    const { useChatStore } = await import('./chat')
    useChatStore.getState().reset()

    // 5. Start a new hermes session with the project CWD
    const project = get().getActiveProject()
    await startFreshSession({
      projectPath: id === SCRATCHPAD_ID || !project?.path ? null : project.path,
      resetChat: false,
      markConnecting: false,
    })
  },

  hydrateActiveProject: async (id: string) => {
    await invoke('set_active_project', { id })
    set({ activeProjectId: id })
    await get().refreshGitInfo(id)
  },

  addProject: async (path: string, name?: string) => {
    const raw = await invoke<RawProject>('add_project', {
      path,
      name: name ?? null,
    })
    const project = mapProject(raw)
    set((s) => ({
      projects: { ...s.projects, [project.id]: project },
    }))
    return project
  },

  removeProject: async (id: string) => {
    await invoke('remove_project', { id })
    set((s) => {
      const projects = { ...s.projects }
      delete projects[id]
      const gitInfo = { ...s.gitInfo }
      delete gitInfo[id]
      return {
        projects,
        gitInfo,
        // If we removed the active project, fall back to scratchpad
        activeProjectId: s.activeProjectId === id ? SCRATCHPAD_ID : s.activeProjectId,
      }
    })
  },

  updateProject: async (id: string, updates: { name?: string; pinned?: boolean }) => {
    const raw = await invoke<RawProject>('update_project', {
      id,
      name: updates.name ?? null,
      pinned: updates.pinned ?? null,
    })
    const project = mapProject(raw)
    set((s) => ({
      projects: { ...s.projects, [project.id]: project },
    }))
  },

  refreshGitInfo: async (projectId: string) => {
    if (projectId === SCRATCHPAD_ID) return

    const project = get().projects[projectId]
    if (!project || !project.path) return

    try {
      const info = await invoke<GitInfo>('get_git_info', { path: project.path })
      set((s) => ({
        gitInfo: { ...s.gitInfo, [projectId]: info },
      }))
    } catch (e) {
      console.error(`[ProjectStore] refreshGitInfo failed for ${projectId}:`, e)
    }
  },

  assignSession: async (sessionId: string, projectId: string) => {
    await invoke('assign_session_to_project', { sessionId, projectId })
  },

  getActiveProject: () => {
    const { activeProjectId, projects } = get()
    if (!activeProjectId || activeProjectId === SCRATCHPAD_ID) return SCRATCHPAD
    return projects[activeProjectId] ?? SCRATCHPAD
  },
}))
