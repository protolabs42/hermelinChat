import type { ChatMessage } from '../stores/chat'
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
      <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {message.content}
      </div>
    </div>
  )
}
