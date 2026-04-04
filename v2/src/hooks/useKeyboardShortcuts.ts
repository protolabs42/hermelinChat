import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '../stores/settings'
import { useSidebarStore } from '../stores/sidebar'
import { useArtifactStore } from '../stores/artifacts'
import { useChatStore } from '../stores/chat'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+N or Cmd+N -- new session
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        useChatStore.getState().reset()
        invoke('set_window_title', { title: 'hermelinChat' }).catch(() => {})
      }
      // Ctrl+, or Cmd+, -- open settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        useSettingsStore.getState().toggle()
      }
      // Ctrl+B or Cmd+B -- toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        useSidebarStore.getState().toggle()
      }
      // Ctrl+Shift+A or Cmd+Shift+A -- toggle artifact panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault()
        useArtifactStore.getState().togglePanel()
      }
      // Escape -- close any open panel
      if (e.key === 'Escape') {
        useSettingsStore.getState().close()
        useSidebarStore.getState().close()
        useArtifactStore.getState().closePanel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
