import { useAcpEvents } from './hooks/useAcpEvents'
import { ThemeProvider } from './theme'
import StatusBar from './components/StatusBar'
import ChatView from './components/ChatView'
import MessageInput from './components/MessageInput'

export default function App() {
  useAcpEvents()

  return (
    <ThemeProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <StatusBar />
        <ChatView />
        <MessageInput />
      </div>
    </ThemeProvider>
  )
}
