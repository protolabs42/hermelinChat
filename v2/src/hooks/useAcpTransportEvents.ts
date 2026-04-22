import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { AcpEvent } from '../types/acp'
import { useChatStore } from '../stores/chat'
import { useProjectStore } from '../stores/projects'

export function useAcpTransportEvents() {
  useEffect(() => {
    const unlistenAcp = listen<AcpEvent>('acp:event', (event) => {
      useChatStore.getState().handleAcpEvent(event.payload)

      const payload = event.payload as AcpEvent
      if (payload.kind === 'ConnectionStatus' && payload.status === 'connected') {
        window.dispatchEvent(new CustomEvent('aurora:acp-ready'))
      }

      if (payload.kind === 'StreamEnd') {
        const ps = useProjectStore.getState()
        if (ps.activeProjectId && ps.activeProjectId !== 'scratchpad') {
          ps.refreshGitInfo(ps.activeProjectId)
        }
      }
    })

    return () => {
      unlistenAcp.then((fn) => fn())
    }
  }, [])
}
