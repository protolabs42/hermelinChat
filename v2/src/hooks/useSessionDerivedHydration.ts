import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useArtifactStore, type Artifact } from '../stores/artifacts'
import { useChatStore } from '../stores/chat'
import { useProjectStore } from '../stores/projects'
import { useSurfaceStore, type A2UIEvent } from '../stores/surfaces'

export function useSessionDerivedHydration() {
  useEffect(() => {
    const unlistenA2ui = listen<A2UIEvent>('a2ui:event', (event) => {
      const payload = event.payload
      useSurfaceStore.getState().handleEvent(payload)
      if (payload.kind === 'Batch') {
        for (const msg of payload.batch.messages) {
          if (msg && typeof msg === 'object' && 'createSurface' in msg) {
            const cs = (msg as { createSurface: { surfaceId: string } }).createSurface
            useChatStore.getState().addSurfaceAnchor(cs.surfaceId)
          }
        }
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
