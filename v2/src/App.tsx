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
import ErrorBoundary from './components/ErrorBoundary'
import { useArtifactStore } from './stores/artifacts'
import { useChatStore } from './stores/chat'

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-(--color-bg)">
      <span className="text-(--color-muted) text-[13px] animate-aurora-pulse">
        connecting to Aurora...
      </span>
    </div>
  )
}

export default function App() {
  useAcpEvents()
  useKeyboardShortcuts()

  const connectionStatus = useChatStore((s) => s.connectionStatus)
  const panelOpen = useArtifactStore((s) => s.panelOpen)

  // Set initial window title
  useEffect(() => {
    invoke('set_window_title', { title: 'Aurora Chat' }).catch(() => {})
  }, [])

  // Reset window title when session is cleared
  useEffect(() => {
    const unsub = useChatStore.subscribe((state, prev) => {
      if (prev.sessionId && !state.sessionId) {
        invoke('set_window_title', { title: 'Aurora Chat' }).catch(() => {})
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
      <ErrorBoundary label="App root">
        <div className="flex h-screen">
          {/* Session sidebar (left, collapsible) */}
          <ErrorBoundary label="Sidebar">
            <SessionSidebar />
          </ErrorBoundary>

          {/* Main chat area */}
          <div className="flex-1 flex flex-col bg-(--color-bg) relative">
            <ErrorBoundary label="Background">
              <BackgroundRenderer />
            </ErrorBoundary>
            <ErrorBoundary label="StatusBar" compact>
              <StatusBar />
            </ErrorBoundary>
            <ErrorBoundary label="ChatView">
              <ChatView />
            </ErrorBoundary>
            <ErrorBoundary label="MessageInput" compact>
              <MessageInput />
            </ErrorBoundary>
          </div>

          {/* Artifact panel (right, conditional) */}
          {panelOpen && (
            <ErrorBoundary label="ArtifactPanel">
              <ArtifactPanel />
            </ErrorBoundary>
          )}
        </div>

        {/* Settings panel (right overlay) */}
        <ErrorBoundary label="Settings">
          <SettingsPanel />
        </ErrorBoundary>

        {/* Easter egg mascot */}
        <ErrorBoundary label="Mascot" compact>
          <AlignmentMascot />
        </ErrorBoundary>
      </ErrorBoundary>
    </ThemeProvider>
  )
}
