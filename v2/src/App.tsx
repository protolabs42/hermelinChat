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
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--color-bg)',
      }}>
        {/* Background effects — absolutely positioned behind everything */}
        <BackgroundRenderer />
        {/* Chat UI */}
        <StatusBar />
        <ChatView />
        <MessageInput />
      </div>
    </ThemeProvider>
  )
}
