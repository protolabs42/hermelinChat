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
    <div
      className={isOpen ? 'animate-slide-left' : ''}
      style={{
        width: isOpen ? 280 : 0,
        minWidth: isOpen ? 280 : 0,
        height: '100vh',
        background: 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 200ms ease-out, min-width 200ms ease-out',
        borderRight: isOpen ? '1px solid var(--color-border)' : 'none',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '0 20px',
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--color-text-bright)',
        }}>
          Sessions
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => {
              useChatStore.getState().reset()
              close()
            }}
            title="New session"
            style={{
              width: 32,
              height: 32,
              background: 'transparent',
              border: 'none',
              color: 'var(--color-muted)',
              cursor: 'pointer',
              borderRadius: 8,
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            +
          </button>
          <button
            onClick={close}
            title="Close sidebar"
            style={{
              width: 32,
              height: 32,
              background: 'transparent',
              border: 'none',
              color: 'var(--color-muted)',
              cursor: 'pointer',
              borderRadius: 8,
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            &#x2715;
          </button>
        </div>
      </div>

      {/* Session list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 8,
      }}>
        {sessions.length === 0 && (
          <div style={{
            padding: '32px 16px',
            textAlign: 'center',
            fontSize: 13,
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
  )
}

function SessionRow({ session, isActive }: { session: SessionSummary; isActive: boolean }) {
  return (
    <button
      onClick={async () => {
        try {
          const msgs = await invoke<Array<{
            id: number
            role: string
            content: string | null
            timestamp: number | null
          }>>('get_session_messages', { sessionId: session.id })

          const chatMessages: ChatMessage[] = msgs
            .filter((m) => m.content)
            .map((m) => ({
              id: `hist-${m.id}`,
              role: m.role as 'user' | 'assistant',
              content: m.content || '',
              timestamp: m.timestamp ? m.timestamp * 1000 : Date.now(),
            }))

          useChatStore.setState({
            messages: chatMessages,
            sessionId: session.id,
            isStreaming: false,
            pendingPrompt: null,
          })

          await invoke('acp_load_session', { sessionId: session.id })

          invoke('set_window_title', {
            title: `Aurora Chat \u2014 ${session.title}`,
          }).catch(() => {})

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
        color: 'var(--color-text)',
        fontFamily: 'inherit',
        fontSize: 13,
        padding: '12px 16px',
        borderRadius: 8,
        cursor: 'pointer',
        marginBottom: 2,
      }}
    >
      <div style={{
        color: isActive ? 'var(--color-text-bright)' : 'var(--color-text-bright)',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        marginBottom: 6,
        lineHeight: 1.3,
      }}>
        {session.title}
      </div>
      <div style={{
        fontSize: 11,
        color: 'var(--color-muted)',
        display: 'flex',
        gap: 12,
        lineHeight: 1,
      }}>
        <span>{relativeTime(session.started_at)}</span>
        <span>{session.message_count} msgs</span>
      </div>
    </button>
  )
}
