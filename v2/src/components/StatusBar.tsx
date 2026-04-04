import { useChatStore } from '../stores/chat'

export default function StatusBar() {
  const status = useChatStore((s) => s.connectionStatus)
  const sessionId = useChatStore((s) => s.sessionId)

  const color = status === 'connected' ? '#a6e3a1' : status === 'connecting' ? '#f9e2af' : '#f38ba8'

  return (
    <div style={{
      padding: '4px 16px',
      borderBottom: '1px solid #45475a',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 10,
      color: '#6c7086',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: color,
      }} />
      <span>{status}</span>
      {sessionId && <span style={{ marginLeft: 'auto' }}>{sessionId.slice(0, 8)}...</span>}
    </div>
  )
}
