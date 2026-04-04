import type { ChatMessage } from '../stores/chat'
import { markdownToHtml } from '../utils/markdown'
import ThinkingBlock from './chat/ThinkingBlock'
import ToolCallBlock from './chat/ToolCallBlock'
import DiffView from './chat/DiffView'

interface Props {
  message: ChatMessage
}

export default function MessageBubble({ message }: Props) {
  if (message.role === 'thinking') {
    return <ThinkingBlock message={message} />
  }

  if (message.role === 'tool') {
    if (message.toolKind === 'diff') {
      return <DiffView message={message} />
    }
    return <ToolCallBlock message={message} />
  }

  if (message.role === 'system') {
    return (
      <div style={{
        marginBottom: 8,
        padding: '8px 12px',
        borderLeft: '2px solid var(--color-danger)',
        background: 'var(--color-elevated)',
        borderRadius: '0 6px 6px 0',
        fontSize: 11,
        color: 'var(--color-danger)',
        lineHeight: 1.6,
      }}>
        {message.content}
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 10,
        color: isUser ? 'var(--color-accent)' : 'var(--color-success)',
        fontWeight: 700,
        marginBottom: 4,
      }}>
        {isUser ? 'YOU' : 'AURORA'}
      </div>
      {isUser ? (
        <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {message.content}
        </div>
      ) : (
        <div
          style={{ fontSize: 13, lineHeight: 1.7 }}
          dangerouslySetInnerHTML={{ __html: markdownToHtml(message.content) }}
        />
      )}
    </div>
  )
}
