import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '../stores/settings'
import { useSidebarStore } from '../stores/sidebar'
import { useArtifactStore } from '../stores/artifacts'
import { usePaneStore } from '../stores/panes'
import { useChatStore } from '../stores/chat'
import { useFontSizeStore } from '../stores/font-size'
import { isWorkspaceSwitcherShortcut } from '../app/keyboard-shortcuts'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+N or Cmd+N -- new session
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        useChatStore.getState().reset()
        invoke('set_window_title', { title: 'Aurora Chat' }).catch(() => {})
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
      // Ctrl+Shift+O or Cmd+Shift+O -- open workspace switcher
      if (isWorkspaceSwitcherShortcut(e)) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('aurora:open-workspace-switcher'))
      }
      // Ctrl+Shift+P or Cmd+Shift+P -- open project switcher
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        useSidebarStore.getState().openProjectSwitcher()
      }
      // Ctrl+Shift+A or Cmd+Shift+A -- toggle artifact panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault()
        usePaneStore.getState().setLayout({ mode: 'hidden' })
        useArtifactStore.getState().togglePanel()
      }
      // Ctrl+= or Ctrl++ -- increase font size
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        useFontSizeStore.getState().increase()
      }
      // Ctrl+- -- decrease font size
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        useFontSizeStore.getState().decrease()
      }
      // Ctrl+0 -- reset font size
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        useFontSizeStore.getState().reset()
      }
      // Escape -- close any open panel
      if (e.key === 'Escape') {
        useSettingsStore.getState().close()
        useSidebarStore.getState().close()
        useArtifactStore.getState().closePanel()
        usePaneStore.getState().setLayout({ mode: 'hidden' })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
