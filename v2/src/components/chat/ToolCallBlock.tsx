import { useState } from 'react'
import type { ChatMessage } from '../../stores/chat'

interface Props {
  message: ChatMessage
}

export default function ToolCallBlock({ message }: Props) {
  const [expanded, setExpanded] = useState(false)

  const status = message.toolStatus || 'running'
  const isRunning = status === 'running'
  const isFailed = status === 'failed' || status === 'error'

  const statusIcon = isRunning ? '\u25b6' : isFailed ? '\u2717' : '\u2713'
  const iconColor = isFailed ? 'var(--color-danger)' : isRunning ? 'var(--color-accent)' : 'var(--color-success)'

  const hasOutput = message.content && message.content.length > 0

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        onClick={() => hasOutput && setExpanded((p) => !p)}
        style={{
          padding: '10px 16px',
          background: 'var(--color-surface)',
          borderRadius: 8,
          border: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          fontSize: 12,
          cursor: hasOutput ? 'pointer' : 'default',
          lineHeight: 1.4,
          fontFamily: "'Fira Code', monospace",
        }}
      >
        <span style={{ fontSize: 14, color: iconColor }}>{statusIcon}</span>
        <span style={{ color: 'var(--color-text-bright)', fontWeight: 500 }}>{message.toolTitle}</span>
        {hasOutput && (
          <span style={{ color: 'var(--color-muted)', marginLeft: 'auto', fontSize: 11 }}>
            {expanded ? '\u25bc' : '\u25b6'}
          </span>
        )}
      </div>
      {expanded && hasOutput && (
        <div style={{
          marginTop: 4,
          marginLeft: 12,
          padding: '12px 16px',
          background: 'var(--color-elevated)',
          borderRadius: 8,
          fontFamily: "'Fira Code', monospace",
          fontSize: 12,
          color: 'var(--color-text)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 300,
          overflow: 'auto',
        }}>
          {message.content}
        </div>
      )}
    </div>
  )
}
