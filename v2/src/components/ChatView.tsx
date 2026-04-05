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
        className="flex-1 overflow-auto px-6 py-5 relative"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <span className="text-(--color-accent) text-[24px] opacity-40">&#9672;</span>
            <span className="text-(--color-muted) text-base font-semibold">Start a conversation</span>
            <span className="text-(--color-muted) text-sm opacity-60">Message Aurora to begin</span>
          </div>
        )}
        <div className="max-w-5xl mx-auto">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
          className="absolute bottom-20 right-6 w-8 h-8 rounded-full glass-surface border border-(--color-border) text-(--color-text-bright) cursor-pointer flex items-center justify-center text-[16px] z-10 shadow-[0_2px_12px_rgba(0,0,0,0.35)] transition-opacity duration-200"
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
