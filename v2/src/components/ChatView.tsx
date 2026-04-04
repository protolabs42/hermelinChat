import { useEffect, useRef } from 'react'
import { useChatStore } from '../stores/chat'
import MessageBubble from './MessageBubble'

export default function ChatView() {
  const messages = useChatStore((s) => s.messages)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      {messages.length === 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#6c7086',
          fontSize: 13,
        }}>
          Start a conversation with Aurora
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
