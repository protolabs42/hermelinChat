import type { ChatMessage } from '../stores/chat'
import { markdownToHtml } from '../utils/markdown'
import ThinkingBlock from './chat/ThinkingBlock'
import ToolCallBlock from './chat/ToolCallBlock'
import DiffView from './chat/DiffView'
import SurfaceAnchor from './chat/SurfaceAnchor'

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

  if (message.role === 'surface' && message.surfaceId) {
    return <SurfaceAnchor surfaceId={message.surfaceId} />
  }

  if (message.role === 'system') {
    return (
      <div style={{
        marginBottom: 16,
        padding: '12px 16px',
        borderLeft: '2px solid var(--color-danger)',
        color: 'var(--color-danger)',
        fontSize: 13,
        lineHeight: 1.6,
      }}>
        {message.content}
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div style={{
      marginBottom: 32,
      maxWidth: '100%',
      paddingLeft: isUser ? 16 : 0,
      borderLeft: isUser ? '2px solid var(--color-accent)' : 'none',
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        marginBottom: 8,
        color: isUser ? 'var(--color-accent)' : 'var(--color-success)',
      }}>
        {isUser ? 'You' : 'Aurora'}
      </div>
      {isUser ? (
        <div style={{
          lineHeight: 1.625,
          whiteSpace: 'pre-wrap' as const,
          color: 'var(--color-text-bright)',
        }}>
          {message.content}
        </div>
      ) : (
        <div
          style={{
            lineHeight: 1.625,
            color: 'var(--color-text-bright)',
          }}
          dangerouslySetInnerHTML={{ __html: markdownToHtml(message.content) }}
        />
      )}
    </div>
  )
}
