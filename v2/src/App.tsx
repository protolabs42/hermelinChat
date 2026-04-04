import { useAcpEvents } from './hooks/useAcpEvents'
import { ThemeProvider } from './theme'
import { BackgroundRenderer } from './components/backgrounds/BackgroundRenderer'
import StatusBar from './components/StatusBar'
import ChatView from './components/ChatView'
import MessageInput from './components/MessageInput'

export default function App() {
  useAcpEvents()

  return (
    <ThemeProvider>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'var(--color-bg)' }}>
          <BackgroundRenderer />
        </div>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <StatusBar />
          <ChatView />
          <MessageInput />
        </div>
      </div>
    </ThemeProvider>
  )
}
