import { useEffect, useRef, useState, useCallback } from 'react'
import { useChatStore } from '../stores/chat'
import MessageBubble from './MessageBubble'
import UsageBar from './chat/UsageBar'

const SCROLL_THRESHOLD = 80 // px from bottom to consider "at bottom"

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

  // Auto-scroll only when user is at the bottom
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
        style={{ flex: 1, overflow: 'auto', padding: 16, position: 'relative' }}
      >
        {messages.length === 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--color-muted)',
            fontSize: 13,
          }}>
            Start a conversation with Aurora
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
          style={{
            position: 'absolute',
            bottom: 80,
            right: 24,
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--color-elevated)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-bright)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            transition: 'opacity 200ms ease',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 3v10M4 9l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <UsageBar />
    </>
  )
}
