import { invoke } from '@tauri-apps/api/core'
import type { FocusTarget, WorkspaceState } from '../lane2/schema'
import { activateWorkspaceSnapshot } from '../lane2/workspace-activation'
import { loadAnchors } from '../a2ui/surface-anchors'
import { sessionRowsToMessages, type SessionRow } from '../utils/session-restore'
import { useArtifactStore } from '../stores/artifacts'
import { useChatStore } from '../stores/chat'
import { useProjectStore } from '../stores/projects'
import { useSidebarStore, type SessionSummary } from '../stores/sidebar'
import { useWorkspaceStore } from '../stores/workspaces'
import { focusRightRailTarget } from './right-rail'
import { startFreshSession } from './session-start'
import { beginWorkspaceMutation, endWorkspaceMutation } from '../hooks/useWorkspacePersistence'

function systemFailureMessage(message: string) {
  useChatStore.setState((state) => ({
    connectionStatus: 'disconnected',
    messages: [...state.messages, {
      id: `system-${Date.now()}`,
      role: 'system',
      content: message,
      timestamp: Date.now(),
    }],
  }))
}

export function focusWorkspaceTarget(target: FocusTarget | null) {
  if (!target) return
  focusRightRailTarget(target)
}

export function createWorkspaceActivationDeps() {
  return {
    setActiveWorkspace: useWorkspaceStore.getState().setActiveWorkspace,
    hydrateActiveProject: useProjectStore.getState().hydrateActiveProject,
    resetChat: () => {
      useChatStore.getState().reset()
    },
    restoreSurfaceAnchors: (surfaceIds: string[]) => {
      useChatStore.getState().restoreSurfaceAnchors(surfaceIds)
    },
    foregroundFocusTarget: focusWorkspaceTarget,
    loadSession: async (sessionId: string, cwd: string | null) => {
      await invoke('acp_load_session', { sessionId, cwd })
    },
    newSession: async (cwd: string | null) => {
      await startFreshSession({ projectPath: cwd, resetChat: false, markConnecting: false })
    },
    getHomeDir: async () => await invoke<string>('get_home_dir').catch(() => null),
    getProjectPath: (projectId: string) => useProjectStore.getState().projects[projectId]?.path ?? null,
    getCurrentProjectPath: () => useProjectStore.getState().getActiveProject()?.path ?? null,
    getCurrentWorkspaceId: () => useWorkspaceStore.getState().activeWorkspace?.workspaceId ?? null,
    getCurrentProjectId: () => useProjectStore.getState().activeProjectId,
    restoreActiveWorkspace: async (workspaceId: string) => {
      await useWorkspaceStore.getState().setActiveWorkspace(workspaceId)
    },
    restoreActiveProject: async (projectId: string) => {
      await useProjectStore.getState().hydrateActiveProject(projectId)
    },
    reportFailure: systemFailureMessage,
  }
}

export async function activateWorkspace(workspace: WorkspaceState) {
  beginWorkspaceMutation()
  try {
    await activateWorkspaceSnapshot(workspace, createWorkspaceActivationDeps())
  } finally {
    endWorkspaceMutation()
  }
}

export async function restoreSessionIntoActiveWorkspace(session: Pick<SessionSummary, 'id' | 'title' | 'cwd'>) {
  beginWorkspaceMutation()
  try {
    const rows = await invoke<SessionRow[]>('get_session_messages', { sessionId: session.id })
    const anchors = loadAnchors(session.id)
    const chatMessages = sessionRowsToMessages(rows, anchors)

    useChatStore.setState({
      messages: chatMessages,
      sessionId: session.id,
      isStreaming: false,
      pendingPrompt: null,
      connectionStatus: 'connecting',
    })

    await invoke('acp_load_session', { sessionId: session.id, cwd: session.cwd || null })

    const activeWorkspace = useWorkspaceStore.getState().activeWorkspace
    if (activeWorkspace) {
      const now = Date.now()
      await useWorkspaceStore.getState().upsertWorkspace({
        ...activeWorkspace,
        resident: {
          ...activeWorkspace.resident,
          sessionId: session.id,
          activeThreadId: session.id,
          updatedAt: now,
        },
        attention: {
          ...activeWorkspace.attention,
          primaryFocus: { kind: 'thread', id: session.id },
          updatedAt: now,
        },
        continuity: {
          ...activeWorkspace.continuity,
          activeThreadId: session.id,
        },
        updatedAt: now,
      }, true)
    }

    invoke('set_window_title', {
      title: `Aurora Chat — ${session.title}`,
    }).catch(() => {})

    useArtifactStore.getState().replaceArtifacts([])
    useSidebarStore.getState().close()
  } finally {
    endWorkspaceMutation()
  }
}
