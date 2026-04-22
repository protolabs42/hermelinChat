import { useEffect } from 'react'
import { buildWorkspaceSnapshot } from '../lane2/persistence'
import { useArtifactStore } from '../stores/artifacts'
import { useChatStore } from '../stores/chat'
import { usePaneStore } from '../stores/panes'
import { useProjectStore } from '../stores/projects'
import { useSidebarStore } from '../stores/sidebar'
import { useSurfaceStore } from '../stores/surfaces'
import { useWorkspaceStore } from '../stores/workspaces'

export function useWorkspacePersistence() {
  useEffect(() => {
    let persistTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleWorkspacePersist = () => {
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = setTimeout(() => {
        const projectId = useProjectStore.getState().activeProjectId
        if (projectId === null) return
        const sessionId = useChatStore.getState().sessionId
        const orderedSurfaceIds = useSurfaceStore.getState().orderedIds
        const liveSurfaces = useSurfaceStore.getState().surfaces
        const anchorSurfaceIds = useChatStore.getState().messages
          .filter((message) => message.role === 'surface' && typeof message.surfaceId === 'string')
          .map((message) => message.surfaceId as string)
        const isStreaming = useChatStore.getState().isStreaming
        const existing = useWorkspaceStore.getState().activeWorkspace
        const artifactState = useArtifactStore.getState()
        const sidebarState = useSidebarStore.getState()
        const paneState = usePaneStore.getState()
        const snapshot = buildWorkspaceSnapshot({
          chrome: {
            sidebarOpen: sidebarState.isOpen,
            sidebarWidth: sidebarState.width,
            artifactPanelOpen: artifactState.panelOpen,
            artifactPanelWidth: artifactState.panelWidth,
            activeArtifactId: artifactState.activeId,
            pinnedSurfaceId: artifactState.pinnedSurfaceId,
            rightRail: paneState.snapshotWorkspacePanes(),
          },
          existing,
          liveSurfaces,
          anchorSurfaceIds,
          isStreaming,
          orderedSurfaceIds,
          projectId,
          sessionId,
        })
        useWorkspaceStore.getState().upsertWorkspace(snapshot, true).catch((e) => {
          console.error('Failed to persist workspace snapshot:', e)
        })
      }, 100)
    }

    const unsubProject = useProjectStore.subscribe((state, prev) => {
      if (state.activeProjectId !== prev.activeProjectId) scheduleWorkspacePersist()
    })
    const unsubChatPersist = useChatStore.subscribe((state, prev) => {
      if (state.sessionId !== prev.sessionId) scheduleWorkspacePersist()
    })
    const unsubSurfacePersist = useSurfaceStore.subscribe((state, prev) => {
      if (state.orderedIds !== prev.orderedIds) scheduleWorkspacePersist()
    })
    const unsubSidebarPersist = useSidebarStore.subscribe((state, prev) => {
      if (state.isOpen !== prev.isOpen || state.width !== prev.width) scheduleWorkspacePersist()
    })
    const unsubArtifactPersist = useArtifactStore.subscribe((state, prev) => {
      if (
        state.panelOpen !== prev.panelOpen
        || state.panelWidth !== prev.panelWidth
        || state.activeId !== prev.activeId
        || state.pinnedSurfaceId !== prev.pinnedSurfaceId
      ) {
        scheduleWorkspacePersist()
      }
    })
    const unsubPanePersist = usePaneStore.subscribe((state, prev) => {
      if (state.workspaceId !== prev.workspaceId || state.layout !== prev.layout) scheduleWorkspacePersist()
    })

    return () => {
      if (persistTimer) clearTimeout(persistTimer)
      unsubProject()
      unsubChatPersist()
      unsubSurfacePersist()
      unsubSidebarPersist()
      unsubArtifactPersist()
      unsubPanePersist()
    }
  }, [])
}
