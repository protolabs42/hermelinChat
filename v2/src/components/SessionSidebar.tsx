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
        width: isOpen ? 280 : 0,
        minWidth: isOpen ? 280 : 0,
        borderRight: isOpen ? '1px solid var(--color-border)' : 'none',
      }}
    >
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-(--color-border) shrink-0">
        <span className="text-xs font-semibold text-(--color-text-bright)">
          Sessions
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => {
              useChatStore.getState().reset()
              close()
            }}
            title="New session"
            className="w-8 h-8 bg-transparent border-none text-(--color-muted) cursor-pointer text-lg leading-none rounded-lg flex items-center justify-center hover:bg-(--color-elevated) transition-colors duration-100"
          >
            +
          </button>
          <button
            onClick={close}
            title="Close sidebar"
            className="w-8 h-8 bg-transparent border-none text-(--color-muted) cursor-pointer text-sm leading-none rounded-lg flex items-center justify-center hover:bg-(--color-elevated) transition-colors duration-100"
          >
            &#x2715;
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {sessions.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-(--color-muted)">
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
      className={`block w-full text-left border-none px-4 py-3 cursor-pointer font-mono rounded-lg mb-1 transition-colors duration-100 hover:bg-(--color-elevated) ${
        isActive ? 'bg-(--color-elevated) border-l-2 border-l-(--color-accent)' : 'bg-transparent border-l-2 border-l-transparent'
      }`}
    >
      <div className={`text-sm overflow-hidden text-ellipsis whitespace-nowrap mb-1 ${
        isActive ? 'text-(--color-text-bright) font-medium' : 'text-(--color-text)'
      }`}>
        {session.title}
      </div>
      <div className="flex gap-3 text-[10px] text-(--color-muted)">
        <span>{relativeTime(session.started_at)}</span>
        <span>{session.message_count} msgs</span>
      </div>
    </button>
  )
}
