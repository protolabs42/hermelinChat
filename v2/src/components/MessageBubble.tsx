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
      <div className="mb-5 px-5 py-4 border-l-2 border-(--color-danger) bg-(--color-surface) rounded-lg text-(--color-danger) leading-relaxed">
        {message.content}
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div className={`mb-5 px-5 py-4 rounded-lg ${isUser ? 'bg-(--color-elevated)' : 'bg-(--color-surface)'}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isUser ? 'text-(--color-accent)' : 'text-(--color-success)'}`}>
        {isUser ? 'YOU' : 'AURORA'}
      </div>
      {isUser ? (
        <div className="leading-[1.7] whitespace-pre-wrap">
          {message.content}
        </div>
      ) : (
        <div
          className="leading-[1.7]"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(message.content) }}
        />
      )}
    </div>
  )
}
