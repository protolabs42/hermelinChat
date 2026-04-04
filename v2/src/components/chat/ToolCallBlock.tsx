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
  const iconColor = isFailed ? '#f38ba8' : '#a6e3a1'

  // Calculate duration placeholder (tool messages don't have end timestamps inherently,
  // but the toolStatus change marks completion)
  const hasOutput = message.content && message.content.length > 0

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={() => hasOutput && setExpanded((p) => !p)}
        style={{
          padding: '6px 12px',
          background: '#181825',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 10,
          cursor: hasOutput ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <span style={{ color: iconColor, fontSize: 10 }}>{statusIcon}</span>
        <span style={{ color: '#a6e3a1', fontWeight: 600 }}>{message.toolTitle}</span>
        {hasOutput && (
          <span style={{ color: '#6c7086', fontSize: 9, marginLeft: 'auto' }}>
            {expanded ? '\u25bc' : '\u25b6'}
          </span>
        )}
      </div>
      {expanded && hasOutput && (
        <div style={{
          marginTop: 4,
          marginLeft: 12,
          padding: '8px 12px',
          background: '#11111b',
          borderRadius: 4,
          border: '1px solid #313244',
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#bac2de',
          lineHeight: 1.5,
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
