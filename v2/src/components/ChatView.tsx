import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useChatStore } from '../stores/chat'
import { useArtifactStore } from '../stores/artifacts'
import { useSurfaceStore } from '../stores/surfaces'
import { useWorkspaceStore } from '../stores/workspaces'
import MessageBubble from './MessageBubble'
import ChatPaneHeader from './chat/ChatPaneHeader'
import UsageBar from './chat/UsageBar'
import WelcomeCard from './WelcomeCard'
import { buildWorkspaceRestoreState } from '../app/workspace-restore-state'

const SCROLL_THRESHOLD = 80

export default function ChatView() {
  const messages = useChatStore((s) => s.messages)
  const pinnedSurfaceId = useArtifactStore((s) => s.pinnedSurfaceId)
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const liveSurfaceIds = useSurfaceStore((s) => s.orderedIds)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom < SCROLL_THRESHOLD
    setIsAtBottom(atBottom)
    setShowScrollButton(!atBottom && messages.length > 0)
  }, [messages.length])

  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isAtBottom])

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowScrollButton(false)
    setIsAtBottom(true)
  }

  const restoreState = useMemo(() => buildWorkspaceRestoreState({
    activeWorkspaceId: activeWorkspace?.workspaceId ?? null,
    liveSurfaceIds,
    pinnedSurfaceId,
    primaryFocus: activeWorkspace?.attention.primaryFocus ?? null,
    surfaceAnchorIds: messages
      .filter((message) => message.role === 'surface' && typeof message.surfaceId === 'string')
      .map((message) => message.surfaceId as string),
  }), [activeWorkspace, liveSurfaceIds, messages, pinnedSurfaceId])

  return (
    <>
      <ChatPaneHeader />
      <div
        ref={scrollContainerRef}
        onScroll={checkScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 40px 32px',
          position: 'relative',
        }}
      >
        {restoreState && (
          <div
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'color-mix(in srgb, var(--color-surface) 92%, transparent)',
              display: 'grid',
              gap: 4,
            }}
          >
            <div style={{ color: 'var(--color-accent)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {restoreState.title}
            </div>
            <div style={{ color: 'var(--color-text-bright)', fontSize: 13, fontWeight: 600 }}>
              {restoreState.label}
            </div>
            <div style={{ color: 'var(--color-muted)', fontSize: 12, lineHeight: 1.5 }}>
              {restoreState.detail}
            </div>
          </div>
        )}
        {messages.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 16,
          }}>
            <WelcomeCard />
            <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>Message Aurora to begin</span>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
          style={{
            position: 'absolute',
            bottom: 96,
            right: 32,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'var(--color-elevated)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-bright)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M4 9l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <UsageBar />
    </>
  )
}
