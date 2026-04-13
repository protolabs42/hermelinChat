import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { AcpEvent } from '../types/acp'
import { useChatStore } from '../stores/chat'
import { useArtifactStore } from '../stores/artifacts'
import { useSurfaceStore, type A2UIEvent } from '../stores/surfaces'

export function useAcpEvents() {
  useEffect(() => {
    const unlistenAcp = listen<AcpEvent>('acp:event', (event) => {
      useChatStore.getState().handleAcpEvent(event.payload)

      // Refresh git info after a stream ends so the dirty indicator stays current
      if (event.payload && (event.payload as AcpEvent).kind === 'StreamEnd') {
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

    // Project-aware startup
    invoke<string>('acp_status').then(async (status) => {
      useChatStore.setState({ connectionStatus: status })

      if (status === 'connected' && !useChatStore.getState().sessionId) {
        try {
          const launchCwd = await invoke<string>('get_launch_cwd')
          const projectStore = (await import('../stores/projects')).useProjectStore.getState()
          await projectStore.refresh()

          // Try to detect a project from launch CWD
          const detected = await invoke<{ git_root: string; suggested_name: string } | null>(
            'detect_project', { path: launchCwd }
          )

          if (detected) {
            // Check if this git root matches a known project
            const known = Object.values(projectStore.projects).find(p => p.path === detected.git_root)
            if (known) {
              await projectStore.setActiveProject(known.id)
            } else {
              // Auto-create project from detected git repo
              const newProject = await projectStore.addProject(detected.git_root, detected.suggested_name)
              await projectStore.setActiveProject(newProject.id)
            }
          } else {
            // No git repo found. Only resume persisted project if launched
            // from $HOME (desktop-icon launch). Otherwise, the user explicitly
            // cd'd somewhere — respect that by using Scratchpad.
            const homeDir = await invoke<string>('get_home_dir').catch(() => '')
            const isDesktopLaunch = launchCwd === homeDir
            if (isDesktopLaunch && projectStore.activeProjectId && projectStore.activeProjectId !== 'scratchpad' && projectStore.projects[projectStore.activeProjectId]) {
              await projectStore.setActiveProject(projectStore.activeProjectId)
            } else {
              await projectStore.setActiveProject('scratchpad')
            }
          }
        } catch (e) {
          console.error('Project startup failed:', e)
          // Fallback: just start a session with launch CWD
          const cwd = await invoke<string>('get_launch_cwd').catch(() => null)
          invoke('acp_new_session', { cwd }).catch(() => {})
        }
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

    return () => {
      unlistenAcp.then((fn) => fn())
      unlistenArtifact.then((fn) => fn())
      unlistenA2ui.then((fn) => fn())
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}
