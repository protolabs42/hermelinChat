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
      className={`h-screen bg-(--color-surface) flex flex-col overflow-hidden transition-[width,min-width] duration-200 ease-out ${isOpen ? 'animate-slide-left' : ''}`}
      style={{
        width: isOpen ? 260 : 0,
        minWidth: isOpen ? 260 : 0,
        borderRight: isOpen ? '1px solid var(--color-border)' : 'none',
      }}
    >
      {/* Header */}
      <div className="px-3 pt-3 pb-2.5 flex items-center justify-between border-b border-(--color-border) shrink-0">
        <span className="text-xs font-semibold text-(--color-text-bright)">
          Sessions
        </span>
        <div className="flex gap-1">
          {/* New session button */}
          <button
            onClick={() => {
              useChatStore.getState().reset()
              close()
            }}
            title="New session"
            className="bg-transparent border-none text-(--color-muted) cursor-pointer text-[16px] leading-none px-1.5 py-0.5 rounded-[4px] hover:bg-(--color-elevated)"
          >
            +
          </button>
          {/* Close button */}
          <button
            onClick={close}
            title="Close sidebar"
            className="bg-transparent border-none text-(--color-muted) cursor-pointer text-sm leading-none px-1.5 py-0.5 rounded-[4px] hover:bg-(--color-elevated)"
          >
            &#x2715;
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {sessions.length === 0 && (
          <div className="px-3 py-6 text-center text-[11px] text-(--color-muted)">
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

          // Tell ACP adapter to restore this session context
          await invoke('acp_load_session', { sessionId: session.id })

          // Update window title
          invoke('set_window_title', {
            title: `Aurora Chat \u2014 ${session.title}`,
          }).catch(() => {})

          // Close sidebar
          useSidebarStore.getState().close()
        } catch (e) {
          console.error('Failed to load session:', e)
        }
      }}
      className={`block w-full text-left border-none px-3 py-2 cursor-pointer font-mono transition-colors duration-100 hover:bg-(--color-elevated) ${
        isActive ? 'bg-(--color-elevated) border-l-2 border-l-(--color-accent)' : 'bg-transparent border-l-2 border-l-transparent'
      }`}
    >
      <div className={`text-[11px] overflow-hidden text-ellipsis whitespace-nowrap mb-0.5 ${
        isActive ? 'text-(--color-text-bright)' : 'text-(--color-text)'
      }`}>
        {session.title}
      </div>
      <div className="flex gap-2 text-[9px] text-(--color-muted)">
        <span>{relativeTime(session.started_at)}</span>
        <span>{session.message_count} msgs</span>
      </div>
    </button>
  )
}
