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
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={() => setManualToggle((prev) => prev === null ? !isActive : !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          padding: '4px 0',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 9, color: 'var(--color-muted)', transition: 'transform 0.15s' }}>
          {isExpanded ? '\u25bc' : '\u25b6'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-muted)', fontStyle: 'italic' }}>
          {isActive ? 'Thinking...' : 'Thinking'}
          {durationStr && (
            <span style={{ marginLeft: 4, fontStyle: 'normal' }}>({durationStr})</span>
          )}
        </span>
      </div>
      {isExpanded && (
        <div style={{
          borderLeft: '2px solid var(--color-border)',
          paddingLeft: 12,
          marginLeft: 4,
          marginTop: 2,
        }}>
          <div style={{
            fontSize: 11,
            color: 'var(--color-muted)',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            fontStyle: 'italic',
          }}>
            {message.content}
          </div>
        </div>
      )}
    </div>
  )
}
