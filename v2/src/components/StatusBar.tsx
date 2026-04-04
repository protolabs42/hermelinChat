import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { useSidebarStore } from '../stores/sidebar'
import { useArtifactStore } from '../stores/artifacts'
import { useTheme } from '../theme'

export default function StatusBar() {
  const status = useChatStore((s) => s.connectionStatus)
  const sessionId = useChatStore((s) => s.sessionId)
  const toggleSettings = useSettingsStore((s) => s.toggle)
  const toggleSidebar = useSidebarStore((s) => s.toggle)
  const artifactCount = useArtifactStore((s) => s.artifacts.length)
  const toggleArtifacts = useArtifactStore((s) => s.togglePanel)
  const { theme } = useTheme()

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
      {/* Sidebar toggle (left) */}
      <button
        onClick={toggleSidebar}
        title="Sessions (Ctrl+B)"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-muted)',
          cursor: 'pointer',
          padding: '2px 4px',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="currentColor" />
          <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="currentColor" />
          <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
        </svg>
      </button>

      {/* Theme identity mark */}
      <div
        style={{
          width: 18,
          height: 18,
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
        {sessionId ? <span>{sessionId.slice(0, 8)}...</span> : null}

        {/* Artifact panel toggle */}
        {artifactCount > 0 && (
          <button
            onClick={toggleArtifacts}
            title={`Artifacts (${artifactCount}) — Ctrl+Shift+A`}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-muted)',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              position: 'relative',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            <span style={{
              fontSize: 8,
              background: 'var(--color-accent)',
              color: 'var(--color-bg)',
              borderRadius: 999,
              padding: '0 4px',
              fontWeight: 700,
              lineHeight: '14px',
              minWidth: 14,
              textAlign: 'center',
            }}>
              {artifactCount}
            </span>
          </button>
        )}

        {/* Settings gear */}
        <button
          onClick={toggleSettings}
          title="Settings (Ctrl+,)"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-muted)',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
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
      </span>
    </div>
  )
}
