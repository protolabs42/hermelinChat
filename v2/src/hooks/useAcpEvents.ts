import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { AcpEvent } from '../types/acp'
import { useChatStore } from '../stores/chat'
import { useArtifactStore } from '../stores/artifacts'

export function useAcpEvents() {
  useEffect(() => {
    const unlistenAcp = listen<AcpEvent>('acp:event', (event) => {
      useChatStore.getState().handleAcpEvent(event.payload)
    })

    const unlistenArtifact = listen('artifact:event', (event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useArtifactStore.getState().handleEvent(event.payload as any)
    })

    // Query current status on mount (events may have fired before listeners registered)
    invoke<string>('acp_status').then((status) => {
      useChatStore.setState({ connectionStatus: status })
    }).catch(() => {})

    // Load existing artifacts on mount
    invoke<Array<Record<string, unknown>>>('list_artifacts').then((artifacts) => {
      if (artifacts.length > 0) {
        useArtifactStore.getState().handleEvent({
          kind: 'List',
          artifacts: artifacts as never[],
        })
      }
    }).catch(() => {})

    return () => {
      unlistenAcp.then((fn) => fn())
      unlistenArtifact.then((fn) => fn())
    }
  }, [])
}
