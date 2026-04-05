import { useState } from 'react'
import type { ChatMessage } from '../../stores/chat'
import { useChatStore } from '../../stores/chat'

interface Props {
  message: ChatMessage
}

export default function ThinkingBlock({ message }: Props) {
  const isStreaming = useChatStore((s) => s.isStreaming)
  const messages = useChatStore((s) => s.messages)

  // Determine if this thinking block is still actively streaming
  const msgIndex = messages.findIndex((m) => m.id === message.id)
  const hasFollowUp = msgIndex >= 0 && msgIndex < messages.length - 1 &&
    messages[msgIndex + 1]?.role !== 'thinking'
  const isActive = !hasFollowUp && isStreaming

  // Calculate duration: from this message's timestamp to the next non-thinking message
  let durationMs: number | null = null
  if (msgIndex >= 0) {
    for (let i = msgIndex + 1; i < messages.length; i++) {
      if (messages[i].role !== 'thinking') {
        durationMs = messages[i].timestamp - message.timestamp
        break
      }
    }
  }

  // Collapsed by default once streaming ends, expanded while active
  const [manualToggle, setManualToggle] = useState<boolean | null>(null)
  const isExpanded = manualToggle !== null ? manualToggle : isActive

  const durationStr = durationMs !== null
    ? `${(durationMs / 1000).toFixed(1)}s`
    : null

  return (
    <div className="mb-2">
      <div
        onClick={() => setManualToggle((prev) => prev === null ? !isActive : !prev)}
        className="flex items-center gap-1.5 cursor-pointer py-1 select-none"
      >
        <span className="text-[9px] text-(--color-muted) transition-transform duration-150">
          {isExpanded ? '\u25bc' : '\u25b6'}
        </span>
        <span className="text-[10px] text-(--color-muted) italic">
          {isActive ? 'Thinking...' : 'Thinking'}
          {durationStr && (
            <span className="ml-1 not-italic">({durationStr})</span>
          )}
        </span>
      </div>
      {isExpanded && (
        <div className="border-l-2 border-(--color-border) pl-3 ml-1 mt-0.5">
          <div className="text-[11px] text-(--color-muted) leading-relaxed whitespace-pre-wrap italic">
            {message.content}
          </div>
        </div>
      )}
    </div>
  )
}
