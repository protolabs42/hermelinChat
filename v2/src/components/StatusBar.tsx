import { useState, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../stores/chat'
import { useTheme, THEME_OPTIONS } from '../theme'

type ApprovalMode = 'yolo' | 'smart' | 'manual'

const MODES: ApprovalMode[] = ['yolo', 'smart', 'manual']

const MODE_CSS: Record<ApprovalMode, string> = {
  yolo: 'var(--color-success)',
  smart: 'var(--color-accent-400)',
  manual: 'var(--color-danger)',
}

export default function StatusBar() {
  const status = useChatStore((s) => s.connectionStatus)
  const sessionId = useChatStore((s) => s.sessionId)
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('yolo')
  const { themeId, setThemeId } = useTheme()
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const color =
    status === 'connected' ? 'var(--color-success)' :
    status === 'connecting' ? 'var(--color-accent-400)' :
    'var(--color-danger)'

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

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  return (
    <div style={{
      padding: '4px 16px',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 10,
      color: 'var(--color-muted)',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span>{status}</span>
      {status === 'disconnected' && (
        <button
          onClick={handleReconnect}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            color: 'var(--color-text)',
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
        {/* Theme picker */}
        <div ref={pickerRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setPickerOpen((p) => !p)}
            title="Switch theme"
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
              color: 'var(--color-accent)',
              fontFamily: 'inherit',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="5.5" cy="6" r="1.2" fill="currentColor" />
              <circle cx="10.5" cy="6" r="1.2" fill="currentColor" />
              <circle cx="8" cy="10" r="1.2" fill="currentColor" />
              <circle cx="5.5" cy="10" r="1.2" fill="currentColor" opacity="0.4" />
              <circle cx="10.5" cy="10" r="1.2" fill="currentColor" opacity="0.4" />
            </svg>
          </button>
          {pickerOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: 4,
              zIndex: 100,
              minWidth: 200,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}>
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => { setThemeId(opt.id); setPickerOpen(false) }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: opt.id === themeId ? 'var(--color-elevated)' : 'transparent',
                    border: 'none',
                    borderRadius: 4,
                    padding: '5px 10px',
                    fontSize: 11,
                    color: opt.id === themeId ? 'var(--color-accent)' : 'var(--color-text)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Approval mode toggle */}
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
            color: MODE_CSS[approvalMode],
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
              stroke="currentColor"
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
