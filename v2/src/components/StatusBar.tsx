import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../stores/chat'

export default function StatusBar() {
  const status = useChatStore((s) => s.connectionStatus)
  const sessionId = useChatStore((s) => s.sessionId)

  const color = status === 'connected' ? '#a6e3a1' : status === 'connecting' ? '#f9e2af' : '#f38ba8'

  const handleReconnect = async () => {
    try {
      useChatStore.setState({ connectionStatus: 'connecting' })
      await invoke('acp_reconnect')
    } catch (e) {
      console.error('Reconnect failed:', e)
    }
  }

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
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span>{status}</span>
      {status === 'disconnected' && (
        <button
          onClick={handleReconnect}
          style={{
            background: 'transparent',
            border: '1px solid #45475a',
            borderRadius: 4,
            color: '#bac2de',
            fontSize: 10,
            padding: '2px 8px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Reconnect
        </button>
      )}
      <span style={{ marginLeft: 'auto' }}>
        {sessionId ? `${sessionId.slice(0, 8)}...` : ''}
      </span>
    </div>
  )
}
