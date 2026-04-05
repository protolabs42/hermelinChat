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
      <div className="mb-4 px-4 py-3 border-l-2 border-(--color-danger) bg-(--color-surface) rounded-lg text-[11px] text-(--color-danger) leading-relaxed">
        {message.content}
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div className={`mb-4 px-4 py-3 rounded-lg ${
      isUser
        ? 'bg-[color-mix(in_srgb,var(--color-accent)_5%,var(--color-bg))] border-l-2 border-l-(--color-accent)'
        : 'bg-(--color-surface)'
    }`}>
      <div className={`text-[9px] font-bold uppercase tracking-wide mb-2 ${isUser ? 'text-(--color-accent)' : 'text-(--color-success)'}`}>
        {isUser ? 'YOU' : 'AURORA'}
      </div>
      {isUser ? (
        <div className="text-[13px] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      ) : (
        <div
          className="text-[13px] leading-[1.7]"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(message.content) }}
        />
      )}
    </div>
  )
}
