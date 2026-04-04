import type { ChatMessage } from '../stores/chat'

interface Props {
  message: ChatMessage
}

export default function MessageBubble({ message }: Props) {
  if (message.role === 'thinking') {
    return (
      <div style={{ marginBottom: 8, padding: '8px 12px', borderLeft: '2px solid #45475a' }}>
        <div style={{ fontSize: 10, color: '#6c7086', fontStyle: 'italic', marginBottom: 4 }}>
          Thinking...
        </div>
        <div style={{ fontSize: 11, color: '#6c7086', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === 'tool') {
    return (
      <div style={{
        marginBottom: 8,
        padding: '6px 12px',
        background: '#181825',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 10,
      }}>
        <span style={{ color: '#a6e3a1' }}>
          {message.toolStatus === 'running' ? '\u25b6' : '\u2713'}
        </span>
        <span style={{ color: '#a6e3a1', fontWeight: 600 }}>{message.toolTitle}</span>
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 10,
        color: isUser ? '#b4befe' : '#a6e3a1',
        fontWeight: 700,
        marginBottom: 4,
      }}>
        {isUser ? 'YOU' : 'AURORA'}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {message.content}
      </div>
    </div>
  )
}
