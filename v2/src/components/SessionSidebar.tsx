import { invoke } from '@tauri-apps/api/core'
import { useSidebarStore, type SessionSummary } from '../stores/sidebar'
import { useChatStore, type ChatMessage } from '../stores/chat'

function relativeTime(epoch: number | null): string {
  if (!epoch) return ''
  const now = Date.now() / 1000
  const diff = now - epoch
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(epoch * 1000).toLocaleDateString()
}

export default function SessionSidebar() {
  const isOpen = useSidebarStore((s) => s.isOpen)
  const sessions = useSidebarStore((s) => s.sessions)
  const close = useSidebarStore((s) => s.close)
  const currentSessionId = useChatStore((s) => s.sessionId)

  return (
    <>
      <style>{`
        @keyframes sidebar-slide-in {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      <div
        style={{
          width: isOpen ? 260 : 0,
          minWidth: isOpen ? 260 : 0,
          height: '100vh',
          background: 'var(--color-surface)',
          borderRight: isOpen ? '1px solid var(--color-border)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 200ms ease, min-width 200ms ease',
          ...(isOpen ? { animation: 'sidebar-slide-in 200ms ease-out' } : {}),
        }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 12px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-bright)' }}>
            Sessions
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {/* New session button */}
            <button
              onClick={() => {
                useChatStore.getState().reset()
                close()
              }}
              title="New session"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-muted)',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                padding: '2px 6px',
                borderRadius: 4,
              }}
            >
              +
            </button>
            {/* Close button */}
            <button
              onClick={close}
              title="Close sidebar"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-muted)',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: '2px 6px',
                borderRadius: 4,
              }}
            >
              &#x2715;
            </button>
          </div>
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {sessions.length === 0 && (
            <div style={{
              padding: '24px 12px',
              textAlign: 'center',
              fontSize: 11,
              color: 'var(--color-muted)',
            }}>
              No sessions found
            </div>
          )}
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              isActive={session.id === currentSessionId}
            />
          ))}
        </div>
      </div>
    </>
  )
}

function SessionRow({ session, isActive }: { session: SessionSummary; isActive: boolean }) {
  return (
    <button
      onClick={async () => {
        try {
          // Load messages from state.db
          const msgs = await invoke<Array<{
            id: number
            role: string
            content: string | null
            timestamp: number | null
          }>>('get_session_messages', { sessionId: session.id })

          // Convert to ChatMessage format
          const chatMessages: ChatMessage[] = msgs
            .filter((m) => m.content)
            .map((m) => ({
              id: `hist-${m.id}`,
              role: m.role as 'user' | 'assistant',
              content: m.content || '',
              timestamp: m.timestamp ? m.timestamp * 1000 : Date.now(),
            }))

          // Set session state
          useChatStore.setState({
            messages: chatMessages,
            sessionId: session.id,
            isStreaming: false,
            pendingPrompt: null,
          })

          // Close sidebar
          useSidebarStore.getState().close()
        } catch (e) {
          console.error('Failed to load session:', e)
        }
      }}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: isActive ? 'var(--color-elevated)' : 'transparent',
        border: 'none',
        borderLeft: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
        padding: '8px 12px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 100ms ease',
      }}
    >
      <div style={{
        fontSize: 11,
        color: isActive ? 'var(--color-text-bright)' : 'var(--color-text)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        marginBottom: 2,
      }}>
        {session.title}
      </div>
      <div style={{
        display: 'flex',
        gap: 8,
        fontSize: 9,
        color: 'var(--color-muted)',
      }}>
        <span>{relativeTime(session.started_at)}</span>
        <span>{session.message_count} msgs</span>
      </div>
    </button>
  )
}
