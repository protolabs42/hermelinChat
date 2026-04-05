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
      <div className="mb-6 p-5 border-l-2 border-(--color-danger) bg-(--color-elevated) rounded-lg text-(--color-danger) leading-relaxed">
        {message.content}
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div className={`mb-6 p-5 rounded-lg border border-(--color-border) ${isUser ? 'bg-(--color-elevated)' : 'bg-(--color-elevated)'}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${isUser ? 'text-(--color-accent)' : 'text-(--color-success)'}`}>
        {isUser ? 'YOU' : 'AURORA'}
      </div>
      {isUser ? (
        <div className="leading-[1.8] whitespace-pre-wrap text-(--color-text-bright)">
          {message.content}
        </div>
      ) : (
        <div
          className="leading-[1.8] text-(--color-text-bright)"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(message.content) }}
        />
      )}
    </div>
  )
}
