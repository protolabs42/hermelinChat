import { useAcpEvents } from './hooks/useAcpEvents'
import { ThemeProvider } from './theme'
import { BackgroundRenderer } from './components/backgrounds/BackgroundRenderer'
import StatusBar from './components/StatusBar'
import ChatView from './components/ChatView'
import MessageInput from './components/MessageInput'
import SettingsPanel from './components/SettingsPanel'

export default function App() {
  useAcpEvents()

  return (
    <ThemeProvider>
      <div style={{ display: 'flex', height: '100vh' }}>
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
