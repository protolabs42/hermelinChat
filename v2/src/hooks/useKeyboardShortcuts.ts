import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settings'
import { useSidebarStore } from '../stores/sidebar'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
      // Escape -- close any open panel
      if (e.key === 'Escape') {
        useSettingsStore.getState().close()
        useSidebarStore.getState().close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
