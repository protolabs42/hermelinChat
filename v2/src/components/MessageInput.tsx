import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../stores/chat'

export default function MessageInput() {
  const [input, setInput] = useState('')
  const sessionId = useChatStore((s) => s.sessionId)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const addUserMessage = useChatStore((s) => s.addUserMessage)

  const handleSend = async () => {
    const text = input.trim()
    if (!text) return

    setInput('')
    addUserMessage(text)

    try {
      if (!sessionId) {
        useChatStore.getState().setPendingPrompt(text)
        await invoke('acp_new_session')
      } else {
        await invoke('acp_send_prompt', { sessionId, text })
      }
    } catch (e) {
      console.error('Failed to send prompt:', e)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{
      borderTop: '1px solid var(--color-border)',
      padding: '12px 16px',
      display: 'flex',
      gap: 8,
    }}>
      <input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message Aurora..."
        disabled={isStreaming}
        style={{
          flex: 1,
          background: 'var(--color-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '8px 12px',
          color: 'var(--color-text-bright)',
          fontSize: 13,
          fontFamily: 'inherit',
          outline: 'none',
          opacity: isStreaming ? 0.5 : 1,
        }}
      />
      <button
        onClick={handleSend}
        disabled={isStreaming || !input.trim()}
        style={{
          background: isStreaming ? 'var(--color-border)' : 'var(--color-accent)',
          color: 'var(--color-bg)',
          border: 'none',
          borderRadius: 8,
          padding: '8px 16px',
          fontWeight: 700,
          fontSize: 12,
          cursor: isStreaming ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {isStreaming ? '...' : 'Send'}
      </button>
    </div>
  )
}
