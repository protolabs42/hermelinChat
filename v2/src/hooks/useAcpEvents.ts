import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { AcpEvent } from '../types/acp'
import { useChatStore } from '../stores/chat'

export function useAcpEvents() {
  useEffect(() => {
    const unlisten = listen<AcpEvent>('acp:event', (event) => {
      useChatStore.getState().handleAcpEvent(event.payload)
    })

    // Query current status on mount (the connected event may have
    // fired before this listener was registered)
    invoke<string>('acp_status').then((status) => {
      useChatStore.setState({ connectionStatus: status })
    }).catch(() => {
      // ignore — will get status from events
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])
}
