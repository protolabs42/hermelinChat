import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { AcpEvent } from '../types/acp'
import { useChatStore } from '../stores/chat'
import { useArtifactStore, type Artifact } from '../stores/artifacts'
import { useSurfaceStore, type A2UIEvent } from '../stores/surfaces'
import { useProjectStore } from '../stores/projects'
import { useSidebarStore } from '../stores/sidebar'
import { useWorkspaceStore } from '../stores/workspaces'
import { buildWorkspaceSnapshot, extractProjectIdFromWorkspace } from '../lane2/persistence'

export function useAcpEvents() {
  useEffect(() => {
    // Fires on first ACP connect (either via initial poll or event),
    // whichever lands first. Idempotent.
    let bootstrapped = false
    async function bootstrapProject() {
      if (bootstrapped) return
      if (useChatStore.getState().sessionId) return
      bootstrapped = true
      try {
        const launchCwd = await invoke<string>('get_launch_cwd')
        const homeDir = await invoke<string>('get_home_dir').catch(() => '')
        const { useProjectStore } = await import('../stores/projects')
        await useProjectStore.getState().refresh()

        const restoredWorkspace = await useWorkspaceStore.getState().loadActiveWorkspace()
        const restoredProjectId = extractProjectIdFromWorkspace(restoredWorkspace)
        const restoredSessionId = restoredWorkspace?.continuity.activeThreadId ?? restoredWorkspace?.resident.sessionId ?? null

        if (restoredProjectId === 'scratchpad') {
          await useProjectStore.getState().hydrateActiveProject('scratchpad')
          if (restoredSessionId) {
            await invoke('acp_load_session', { sessionId: restoredSessionId, cwd: homeDir || null })
            return
          }
        } else if (restoredProjectId && useProjectStore.getState().projects[restoredProjectId]) {
          await useProjectStore.getState().hydrateActiveProject(restoredProjectId)
          if (restoredSessionId) {
            const project = useProjectStore.getState().projects[restoredProjectId]
            await invoke('acp_load_session', { sessionId: restoredSessionId, cwd: project?.path ?? null })
            return
          }
        }

        if (launchCwd === homeDir) {
          const active = useProjectStore.getState().activeProjectId
          const projects = useProjectStore.getState().projects
          if (active && active !== 'scratchpad' && projects[active]) {
            await useProjectStore.getState().setActiveProject(active)
          } else {
            await useProjectStore.getState().setActiveProject('scratchpad')
          }
          return
        }

        const detected = await invoke<{ git_root: string; suggested_name: string } | null>(
          'detect_project', { path: launchCwd }
        ).catch(() => null)
        const projectPath = detected?.git_root ?? launchCwd
        const projectName = detected?.suggested_name
          ?? launchCwd.split(/[\\/]/).filter(Boolean).pop()
          ?? 'unnamed'

        const findByPath = () =>
          Object.values(useProjectStore.getState().projects).find((p) => p.path === projectPath)

        const known = findByPath()
        if (known) {
          await useProjectStore.getState().setActiveProject(known.id)
          return
        }

        try {
          const newProject = await useProjectStore.getState().addProject(projectPath, projectName)
          await useProjectStore.getState().setActiveProject(newProject.id)
        } catch (addErr) {
          console.warn('addProject failed, retrying after refresh:', addErr)
          await useProjectStore.getState().refresh()
          const retry = findByPath()
          if (retry) {
            await useProjectStore.getState().setActiveProject(retry.id)
          } else {
            throw addErr
          }
        }
      } catch (e) {
        console.error('Project startup failed:', e)
        bootstrapped = false
        const cwd = await invoke<string>('get_launch_cwd').catch(() => null)
        invoke('acp_new_session', { cwd }).catch(() => {})
      }
    }

    const unlistenAcp = listen<AcpEvent>('acp:event', (event) => {
      useChatStore.getState().handleAcpEvent(event.payload)

      const payload = event.payload as AcpEvent
      if (payload.kind === 'ConnectionStatus' && payload.status === 'connected') {
        bootstrapProject()
      }

      // Refresh git info after a stream ends so the dirty indicator stays current
      if (payload.kind === 'StreamEnd') {
        import('../stores/projects').then(({ useProjectStore }) => {
          const ps = useProjectStore.getState()
          if (ps.activeProjectId && ps.activeProjectId !== 'scratchpad') {
            ps.refreshGitInfo(ps.activeProjectId)
          }
        })
      }
    })

    const unlistenArtifact = listen('artifact:event', (event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useArtifactStore.getState().handleEvent(event.payload as any)
    })

    const unlistenA2ui = listen<A2UIEvent>('a2ui:event', (event) => {
      const payload = event.payload
      useSurfaceStore.getState().handleEvent(payload)
      // On createSurface messages, inject a chat-stream anchor so the
      // surface renders inline with the assistant turn that produced it.
      if (payload.kind === 'Batch') {
        for (const msg of payload.batch.messages) {
          if (msg && typeof msg === 'object' && 'createSurface' in msg) {
            const cs = (msg as { createSurface: { surfaceId: string } }).createSurface
            useChatStore.getState().addSurfaceAnchor(cs.surfaceId)
          }
        }
      }
    })

    // Project-aware startup — try immediately (warm case). If ACP isn't
    // ready yet, the ConnectionStatus event handler above will catch it.
    invoke<string>('acp_status').then((status) => {
      useChatStore.setState({ connectionStatus: status })
      if (status === 'connected') {
        bootstrapProject()
      }
    }).catch(() => {})

    // Refresh git info when the window becomes visible again (user switches back)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        import('../stores/projects').then(({ useProjectStore }) => {
          const ps = useProjectStore.getState()
          if (ps.activeProjectId && ps.activeProjectId !== 'scratchpad') {
            ps.refreshGitInfo(ps.activeProjectId)
          }
        })
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Skip loading stale artifacts and surfaces on fresh startup.
    // They belong to previous sessions and clutter the new chat.
    // When resuming a session from the sidebar, the session load
    // handler will fetch that session's artifacts/surfaces.

    // Load the right legacy artifacts whenever the active chat session changes.
    // This prevents the deprecated side panel from bleeding artifacts across sessions.
    const unsubSession = useChatStore.subscribe((state, prev) => {
      if (state.sessionId === prev.sessionId) return
      if (!state.sessionId) {
        useArtifactStore.getState().replaceArtifacts([])
        return
      }
      invoke<Artifact[]>('list_artifacts', { sessionId: state.sessionId })
        .then((artifacts) => {
          useArtifactStore.getState().replaceArtifacts(artifacts)
        })
        .catch((e: unknown) => console.error('Failed to load session artifacts:', e))
    })

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
        const snapshot = buildWorkspaceSnapshot({
          chrome: {
            sidebarOpen: sidebarState.isOpen,
            sidebarWidth: sidebarState.width,
            artifactPanelOpen: artifactState.panelOpen,
            artifactPanelWidth: artifactState.panelWidth,
            activeArtifactId: artifactState.activeId,
            pinnedSurfaceId: artifactState.pinnedSurfaceId,
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
      if (state.activeProjectId !== prev.activeProjectId) {
        scheduleWorkspacePersist()
      }
    })
    const unsubChatPersist = useChatStore.subscribe((state, prev) => {
      if (state.sessionId !== prev.sessionId) {
        scheduleWorkspacePersist()
      }
    })
    const unsubSurfacePersist = useSurfaceStore.subscribe((state, prev) => {
      if (state.orderedIds !== prev.orderedIds) {
        scheduleWorkspacePersist()
      }
    })
    const unsubSidebarPersist = useSidebarStore.subscribe((state, prev) => {
      if (state.isOpen !== prev.isOpen || state.width !== prev.width) {
        scheduleWorkspacePersist()
      }
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

    return () => {
      unlistenAcp.then((fn) => fn())
      unlistenArtifact.then((fn) => fn())
      unlistenA2ui.then((fn) => fn())
      document.removeEventListener('visibilitychange', onVisibility)
      if (persistTimer) clearTimeout(persistTimer)
      unsubSession()
      unsubProject()
      unsubChatPersist()
      unsubSurfacePersist()
      unsubSidebarPersist()
      unsubArtifactPersist()
    }
  }, [])
}
