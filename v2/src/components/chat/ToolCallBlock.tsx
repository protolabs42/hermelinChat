import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
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
  const isApproval = message.toolKind === 'approval' && message.approvalRequestId

  const respondToApproval = async (optionId?: string) => {
    if (!message.approvalRequestId) return
    try {
      await invoke('acp_respond_permission', {
        requestId: message.approvalRequestId,
        optionId: optionId ?? null,
      })
    } catch (error) {
      console.error('Failed to respond to ACP permission request:', error)
    }
  }

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
      {isApproval && (
        <div style={{ marginTop: 8, marginLeft: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {message.approvalOptions?.map((option) => (
            <button
              key={option.id}
              onClick={() => void respondToApproval(option.id)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-elevated)',
                color: 'var(--color-text-bright)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {option.label}
            </button>
          ))}
          <button
            onClick={() => void respondToApproval()}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-danger)',
              background: 'transparent',
              color: 'var(--color-danger)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Cancel
          </button>
          {message.approvalCommand && (
            <div style={{ width: '100%', color: 'var(--color-muted)', fontSize: 11, whiteSpace: 'pre-wrap' }}>
              {message.approvalCommand}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
