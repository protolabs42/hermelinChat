import { useState } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

const MOCK_MESSAGES: Message[] = [
  { id: '1', role: 'user', content: 'Hello Aurora', timestamp: Date.now() - 2000 },
  { id: '2', role: 'assistant', content: 'Hello! How can I help you today?', timestamp: Date.now() },
]

export default function App() {
  const [messages] = useState<Message[]>(MOCK_MESSAGES)
  const [input, setInput] = useState('')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 10,
              color: msg.role === 'user' ? '#b4befe' : '#a6e3a1',
              fontWeight: 700,
              marginBottom: 4,
            }}>
              {msg.role === 'user' ? 'YOU' : 'AURORA'}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{
        borderTop: '1px solid #45475a',
        padding: '12px 16px',
        display: 'flex',
        gap: 8,
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message Aurora..."
          style={{
            flex: 1,
            background: '#313244',
            border: '1px solid #45475a',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#cdd6f4',
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          style={{
            background: '#b4befe',
            color: '#1e1e2e',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontWeight: 700,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
