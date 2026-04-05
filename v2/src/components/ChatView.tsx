import { useEffect, useRef, useState, useCallback } from 'react'
import { useChatStore } from '../stores/chat'
import MessageBubble from './MessageBubble'
import UsageBar from './chat/UsageBar'

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
        className="flex-1 overflow-auto px-8 py-6 relative"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <span className="text-(--color-accent) text-[28px] opacity-30">&#9672;</span>
            <span className="text-(--color-muted) text-base font-semibold">Start a conversation</span>
            <span className="text-(--color-muted) text-sm opacity-50">Message Aurora to begin</span>
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
          className="absolute bottom-24 right-8 w-10 h-10 rounded-full bg-(--color-elevated) border border-(--color-border) text-(--color-text-bright) cursor-pointer flex items-center justify-center z-10 shadow-[0_2px_12px_rgba(0,0,0,0.3)] hover:bg-(--color-border) transition-colors duration-100"
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
