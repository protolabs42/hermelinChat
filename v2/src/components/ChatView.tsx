import { useEffect, useRef, useState, useCallback } from 'react'
import { useChatStore } from '../stores/chat'
import MessageBubble from './MessageBubble'
import UsageBar from './chat/UsageBar'
import WelcomeCard from './WelcomeCard'

const SCROLL_THRESHOLD = 80

export default function ChatView() {
  const messages = useChatStore((s) => s.messages)
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

  return (
    <>
      <div
        ref={scrollContainerRef}
        onScroll={checkScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px 40px',
          position: 'relative',
        }}
      >
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
