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

  return (
    <div className="px-6 py-3 border-b border-(--color-border) bg-(--color-surface) flex items-center gap-4 text-sm text-(--color-muted)">
      {/* Left */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSidebar}
          title="Sessions (Ctrl+B)"
          className="w-9 h-9 bg-transparent border-none text-(--color-muted) cursor-pointer rounded-lg flex items-center justify-center hover:bg-(--color-elevated) hover:text-(--color-text-bright) transition-colors"
        >
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
          className="w-9 h-9 bg-transparent border-none text-(--color-muted) cursor-pointer rounded-lg flex items-center justify-center text-xl leading-none hover:bg-(--color-elevated) hover:text-(--color-text-bright) transition-colors"
        >
          +
        </button>

        <div
          className="w-5 h-5 text-(--color-accent) flex items-center justify-center opacity-70 shrink-0"
          title={theme.identity.mascotTitle}
          dangerouslySetInnerHTML={{ __html: theme.identity.topbarSvg }}
        />
      </div>

      {/* Center */}
      <div className="flex-1 flex items-center justify-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dotColor }} />
        <span className="text-sm">{status}</span>
        {status === 'connected' && sessionId && (
          <span className="text-(--color-muted) opacity-50 truncate max-w-[200px] text-xs">
            {sessionId.slice(0, 12)}
          </span>
        )}
        {status === 'disconnected' && (
          <button
            onClick={handleReconnect}
            className="bg-(--color-elevated) border border-(--color-border) rounded-lg text-(--color-text-bright) text-sm px-4 py-1.5 cursor-pointer font-mono hover:bg-(--color-border) transition-colors"
          >
            Reconnect
          </button>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {artifactCount > 0 && (
          <button
            onClick={toggleArtifacts}
            title={`Artifacts (${artifactCount})`}
            className="h-9 bg-transparent border-none text-(--color-muted) cursor-pointer px-3 rounded-lg flex items-center gap-2 hover:bg-(--color-elevated) hover:text-(--color-text-bright) transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            <span className="text-xs bg-(--color-accent) text-(--color-bg) rounded-full px-2 font-bold min-w-[20px] h-5 flex items-center justify-center">
              {artifactCount}
            </span>
          </button>
        )}

        {updateInfo?.update_available && (
          <span
            title={`Update: ${updateInfo.current} → ${updateInfo.latest}`}
            className="text-xs px-3 py-1 rounded-full bg-(--color-accent) text-(--color-bg) font-bold cursor-default"
          >
            {updateInfo.latest} available
          </span>
        )}

        <button
          onClick={toggleSettings}
          title="Settings (Ctrl+,)"
          className="w-9 h-9 bg-transparent border-none text-(--color-muted) cursor-pointer rounded-lg flex items-center justify-center hover:bg-(--color-elevated) hover:text-(--color-text-bright) transition-colors"
        >
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
