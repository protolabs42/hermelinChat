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
  const iconColor = isFailed ? 'var(--color-danger)' : 'var(--color-success)'

  // Calculate duration placeholder (tool messages don't have end timestamps inherently,
  // but the toolStatus change marks completion)
  const hasOutput = message.content && message.content.length > 0

  return (
    <div className="mb-2">
      <div
        onClick={() => hasOutput && setExpanded((p) => !p)}
        className={`px-4 py-2.5 bg-(--color-surface) rounded-lg flex items-center gap-2 text-[10px] select-none ${hasOutput ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span className="text-[10px]" style={{ color: iconColor }}>{statusIcon}</span>
        <span className="text-(--color-success) font-semibold">{message.toolTitle}</span>
        {hasOutput && (
          <span className="text-(--color-muted) text-[9px] ml-auto">
            {expanded ? '\u25bc' : '\u25b6'}
          </span>
        )}
      </div>
      {expanded && hasOutput && (
        <div className="mt-1 ml-3 px-4 py-3 bg-(--color-elevated) rounded-lg font-mono text-[11px] text-(--color-text) leading-normal whitespace-pre-wrap break-words max-h-[300px] overflow-auto">
          {message.content}
        </div>
      )}
    </div>
  )
}
