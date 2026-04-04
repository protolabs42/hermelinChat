import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { AcpEvent } from '../types/acp'
import { useChatStore } from '../stores/chat'

export function useAcpEvents() {
  useEffect(() => {
    const unlisten = listen<AcpEvent>('acp:event', (event) => {
      useChatStore.getState().handleAcpEvent(event.payload)
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])
}
