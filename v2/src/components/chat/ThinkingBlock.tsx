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
    <div style={{
      marginBottom: 16,
      padding: '12px 16px',
      background: 'var(--color-surface)',
      borderRadius: 8,
      border: '1px solid var(--color-border)',
    }}>
      <div
        onClick={() => setManualToggle((prev) => prev === null ? !isActive : !prev)}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--color-muted)',
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: 8,
          transition: 'transform 0.15s',
        }}>
          {isExpanded ? '\u25bc' : '\u25b6'}
        </span>
        <span>
          {isActive ? 'Thinking...' : 'Thinking'}
        </span>
        {durationStr && (
          <span style={{ marginLeft: 'auto', fontSize: 11 }}>{durationStr}</span>
        )}
      </div>
      {isExpanded && (
        <div style={{
          marginTop: 8,
          fontSize: 12,
          color: 'var(--color-muted)',
          lineHeight: 1.7,
          fontStyle: 'italic',
          whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </div>
      )}
    </div>
  )
}
