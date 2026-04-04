import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../stores/chat'

type ApprovalMode = 'yolo' | 'smart' | 'manual'

const MODES: ApprovalMode[] = ['yolo', 'smart', 'manual']

const MODE_COLORS: Record<ApprovalMode, string> = {
  yolo: '#a6e3a1',
  smart: '#f9e2af',
  manual: '#f38ba8',
}

export default function StatusBar() {
  const status = useChatStore((s) => s.connectionStatus)
  const sessionId = useChatStore((s) => s.sessionId)
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('yolo')

  const color = status === 'connected' ? '#a6e3a1' : status === 'connecting' ? '#f9e2af' : '#f38ba8'

  const handleReconnect = async () => {
    try {
      useChatStore.setState({ connectionStatus: 'connecting' })
      await invoke('acp_reconnect')
    } catch (e) {
      console.error('Reconnect failed:', e)
    }
  }

  const cycleApprovalMode = () => {
    setApprovalMode((current) => {
      const idx = MODES.indexOf(current)
      return MODES[(idx + 1) % MODES.length]
    })
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
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={cycleApprovalMode}
          title={`Approval mode: ${approvalMode}`}
          style={{
            background: 'transparent',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 10,
            color: MODE_COLORS[approvalMode],
            fontFamily: 'inherit',
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8 1L2 4v4.5c0 3.5 2.5 6.2 6 7.5 3.5-1.3 6-4 6-7.5V4L8 1z"
              stroke={MODE_COLORS[approvalMode]}
              strokeWidth="1.5"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          {approvalMode}
        </button>
        {sessionId ? <span>{sessionId.slice(0, 8)}...</span> : null}
      </span>
    </div>
  )
}
