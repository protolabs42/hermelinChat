import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useArtifactStore, type Artifact } from '../stores/artifacts'
import { useChatStore } from '../stores/chat'
import { useProjectStore } from '../stores/projects'
import { useSurfaceStore, type A2UIEvent, extractCreatedSurfaceIds, scopeA2UIEventToSession } from '../stores/surfaces'

export function useSessionDerivedHydration() {
  useEffect(() => {
    const unlistenA2ui = listen<A2UIEvent>('a2ui:event', (event) => {
      const activeSessionId = useChatStore.getState().sessionId
      const payload = scopeA2UIEventToSession(event.payload, activeSessionId)
      if (!payload) return
      useSurfaceStore.getState().handleEvent(payload)
      for (const surfaceId of extractCreatedSurfaceIds(payload)) {
        useChatStore.getState().addSurfaceAnchor(surfaceId)
      }
    })

    const unlistenArtifact = listen('artifact:event', (event) => {
      useArtifactStore.getState().handleEvent(event.payload as never)
    })

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

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        const ps = useProjectStore.getState()
        if (ps.activeProjectId && ps.activeProjectId !== 'scratchpad') {
          ps.refreshGitInfo(ps.activeProjectId)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      unlistenA2ui.then((fn) => fn())
      unlistenArtifact.then((fn) => fn())
      unsubSession()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}
