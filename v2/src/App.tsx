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
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--color-bg)' }}>
        <StatusBar />
        <ChatView />
        <MessageInput />
      </div>
      {/* Particle overlay — renders on top with very low opacity, pointer-events: none */}
      <BackgroundRenderer />
    </ThemeProvider>
  )
}
