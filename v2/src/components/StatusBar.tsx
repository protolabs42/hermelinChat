import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { useSidebarStore } from '../stores/sidebar'
import { useArtifactStore } from '../stores/artifacts'
import { useTheme } from '../theme'

interface VersionInfo {
  current: string | null
  latest: string | null
  update_available: boolean
}

export default function StatusBar() {
  const status = useChatStore((s) => s.connectionStatus)
  const sessionId = useChatStore((s) => s.sessionId)
  const toggleSettings = useSettingsStore((s) => s.toggle)
  const toggleSidebar = useSidebarStore((s) => s.toggle)
  const artifactCount = useArtifactStore((s) => s.artifacts.length)
  const toggleArtifacts = useArtifactStore((s) => s.togglePanel)
  const { theme } = useTheme()

  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null)

  useEffect(() => {
    invoke<VersionInfo>('check_hermes_update').then((info) => {
      if (info.update_available) setUpdateInfo(info)
    }).catch(() => {})
  }, [])

  const dotColor =
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

  const btnStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    background: 'transparent',
    border: 'none',
    color: 'var(--color-muted)',
    cursor: 'pointer',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <div style={{
      padding: '12px 24px',
      borderBottom: '1px solid var(--color-border)',
      background: 'var(--color-surface)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 13,
      color: 'var(--color-muted)',
    }}>
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={toggleSidebar} title="Sessions (Ctrl+B)" style={btnStyle}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>

        <button
          onClick={() => {
            useChatStore.getState().reset()
            invoke('set_window_title', { title: 'Aurora Chat' }).catch(() => {})
          }}
          title="New chat (Ctrl+N)"
          style={{ ...btnStyle, fontSize: 20, lineHeight: 1 }}
        >
          +
        </button>

        <div
          style={{
            width: 20,
            height: 20,
            color: 'var(--color-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.7,
            flexShrink: 0,
          }}
          title={theme.identity.mascotTitle}
          dangerouslySetInnerHTML={{ __html: theme.identity.topbarSvg }}
        />
      </div>

      {/* Center */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <span>{status}</span>
        {status === 'connected' && sessionId && (
          <span style={{ color: 'var(--color-muted)', opacity: 0.5, fontSize: 11 }}>
            {sessionId.slice(0, 12)}
          </span>
        )}
        {status === 'disconnected' && (
          <button
            onClick={handleReconnect}
            style={{
              background: 'var(--color-elevated)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              color: 'var(--color-text-bright)',
              fontSize: 13,
              padding: '6px 16px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Reconnect
          </button>
        )}
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {artifactCount > 0 && (
          <button
            onClick={toggleArtifacts}
            title={`Artifacts (${artifactCount})`}
            style={{ ...btnStyle, width: 'auto', padding: '0 12px', gap: 8 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            <span style={{
              fontSize: 10,
              background: 'var(--color-accent)',
              color: 'var(--color-bg)',
              borderRadius: 99,
              padding: '2px 8px',
              fontWeight: 700,
            }}>
              {artifactCount}
            </span>
          </button>
        )}

        {updateInfo?.update_available && (
          <span style={{
            fontSize: 11,
            padding: '4px 12px',
            borderRadius: 99,
            background: 'var(--color-accent)',
            color: 'var(--color-bg)',
            fontWeight: 700,
          }}>
            {updateInfo.latest} available
          </span>
        )}

        <button onClick={toggleSettings} title="Settings (Ctrl+,)" style={btnStyle}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path
              d="M6.5 1.5h3l.4 1.6.7.3 1.5-.8 2.1 2.1-.8 1.5.3.7 1.6.4v3l-1.6.4-.3.7.8 1.5-2.1 2.1-1.5-.8-.7.3-.4 1.6h-3l-.4-1.6-.7-.3-1.5.8-2.1-2.1.8-1.5-.3-.7L.7 9.5v-3l1.6-.4.3-.7-.8-1.5L3.9 1.8l1.5.8.7-.3.4-1.1z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
          </svg>
        </button>
      </div>
    </div>
  )
}
