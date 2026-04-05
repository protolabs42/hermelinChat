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
      <div className="mb-6 pl-4 py-2 border-l-2 border-(--color-danger) text-(--color-danger) leading-relaxed">
        {message.content}
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div className={`mb-8 ${isUser ? 'pl-4 border-l-2 border-(--color-accent)' : ''}`}>
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isUser ? 'text-(--color-accent)' : 'text-(--color-success)'}`}>
        {isUser ? 'YOU' : 'AURORA'}
      </div>
      {isUser ? (
        <div className="leading-[1.8] whitespace-pre-wrap text-(--color-text)">
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
