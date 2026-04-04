import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAcpEvents } from './hooks/useAcpEvents'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { ThemeProvider } from './theme'
import { BackgroundRenderer } from './components/backgrounds/BackgroundRenderer'
import StatusBar from './components/StatusBar'
import ChatView from './components/ChatView'
import MessageInput from './components/MessageInput'
import SettingsPanel from './components/SettingsPanel'
import SessionSidebar from './components/SessionSidebar'
import ArtifactPanel from './components/ArtifactPanel'
import { AlignmentMascot } from './components/AlignmentMascot'
import { useArtifactStore } from './stores/artifacts'
import { useChatStore } from './stores/chat'

function LoadingScreen() {
  return (
    <>
      <style>{`
        @keyframes aurora-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--color-bg, #1e1e2e)',
      }}>
        <span style={{
          color: 'var(--color-muted, #6c7086)',
          fontSize: 13,
          fontFamily: 'inherit',
          animation: 'aurora-pulse 2s ease-in-out infinite',
        }}>
          connecting to Aurora...
        </span>
      </div>
    </>
  )
}

export default function App() {
  useAcpEvents()
  useKeyboardShortcuts()

  const connectionStatus = useChatStore((s) => s.connectionStatus)
  const panelOpen = useArtifactStore((s) => s.panelOpen)

  // Set initial window title
  useEffect(() => {
    invoke('set_window_title', { title: 'hermelinChat' }).catch(() => {})
  }, [])

  // Reset window title when session is cleared
  useEffect(() => {
    const unsub = useChatStore.subscribe((state, prev) => {
      if (prev.sessionId && !state.sessionId) {
        invoke('set_window_title', { title: 'hermelinChat' }).catch(() => {})
      }
    })
    return unsub
  }, [])

  if (connectionStatus === 'connecting') {
    return (
      <ThemeProvider>
        <LoadingScreen />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <div style={{ display: 'flex', height: '100vh' }}>
        {/* Session sidebar (left, collapsible) */}
        <SessionSidebar />

        {/* Main chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', position: 'relative' }}>
          <BackgroundRenderer />
          <StatusBar />
          <ChatView />
          <MessageInput />
        </div>

        {/* Artifact panel (right, conditional) */}
        {panelOpen && <ArtifactPanel />}
      </div>

      {/* Settings panel (right overlay) */}
      <SettingsPanel />

      {/* Easter egg mascot */}
      <AlignmentMascot />
    </ThemeProvider>
  )
}
