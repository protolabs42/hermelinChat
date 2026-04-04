import { useAcpEvents } from './hooks/useAcpEvents'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { ThemeProvider } from './theme'
import { BackgroundRenderer } from './components/backgrounds/BackgroundRenderer'
import StatusBar from './components/StatusBar'
import ChatView from './components/ChatView'
import MessageInput from './components/MessageInput'
import SettingsPanel from './components/SettingsPanel'
import SessionSidebar from './components/SessionSidebar'

export default function App() {
  useAcpEvents()
  useKeyboardShortcuts()

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
      </div>

      {/* Settings panel (right overlay) */}
      <SettingsPanel />
    </ThemeProvider>
  )
}
