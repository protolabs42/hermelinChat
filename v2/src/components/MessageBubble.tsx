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
        marginBottom: 24,
        paddingLeft: 16,
        paddingTop: 8,
        paddingBottom: 8,
        borderLeft: '2px solid var(--color-danger)',
        color: 'var(--color-danger)',
        lineHeight: 1.7,
      }}>
        {message.content}
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div style={{
      marginBottom: 32,
      paddingLeft: isUser ? 16 : 0,
      borderLeft: isUser ? '2px solid var(--color-accent)' : 'none',
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.1em',
        marginBottom: 8,
        color: isUser ? 'var(--color-accent)' : 'var(--color-success)',
      }}>
        {isUser ? 'YOU' : 'AURORA'}
      </div>
      {isUser ? (
        <div style={{
          lineHeight: 1.8,
          whiteSpace: 'pre-wrap' as const,
          color: 'var(--color-text)',
        }}>
          {message.content}
        </div>
      ) : (
        <div
          style={{
            lineHeight: 1.8,
            color: 'var(--color-text-bright)',
          }}
          dangerouslySetInnerHTML={{ __html: markdownToHtml(message.content) }}
        />
      )}
    </div>
  )
}
