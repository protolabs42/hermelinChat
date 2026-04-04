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

export default function App() {
  useAcpEvents()
  useKeyboardShortcuts()

  const panelOpen = useArtifactStore((s) => s.panelOpen)

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
