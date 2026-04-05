import { useState, useRef, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../stores/chat'

const MAX_ROWS = 4
const LINE_HEIGHT = 22
const CHAR_COUNT_THRESHOLD = 500

export default function MessageInput() {
  const [input, setInput] = useState('')
  const sessionId = useChatStore((s) => s.sessionId)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const addUserMessage = useChatStore((s) => s.addUserMessage)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [focused, setFocused] = useState(false)

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = LINE_HEIGHT * MAX_ROWS + 24
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [input, adjustHeight])

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

  const handleCancel = async () => {
    if (!sessionId) return
    try {
      await invoke('acp_cancel', { sessionId })
    } catch (e) {
      console.error('Failed to cancel:', e)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isStreaming) handleSend()
    }
  }

  return (
    <div style={{
      borderTop: 'none',
      background: 'var(--color-bg)',
      padding: '20px 40px',
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
    }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <textarea
          ref={textareaRef}
          autoFocus
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Message Aurora..."
          disabled={isStreaming}
          style={{
            width: '100%',
            background: 'var(--color-elevated)',
            border: focused ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
            borderRadius: 8,
            padding: '12px 16px',
            color: 'var(--color-text-bright)',
            fontFamily: 'inherit',
            fontSize: 14,
            outline: 'none',
            resize: 'none',
            overflow: 'auto',
            opacity: isStreaming ? 0.5 : 1,
            lineHeight: `${LINE_HEIGHT}px`,
          }}
        />
        {input.length > CHAR_COUNT_THRESHOLD && (
          <span style={{
            position: 'absolute',
            right: 12,
            bottom: 8,
            fontSize: 9,
            color: 'var(--color-muted)',
            opacity: 0.6,
            pointerEvents: 'none',
          }}>
            {input.length}
          </span>
        )}
      </div>
      {isStreaming ? (
        <button
          onClick={handleCancel}
          style={{
            background: 'var(--color-danger)',
            color: 'var(--color-bg)',
            border: 'none',
            borderRadius: 8,
            padding: '12px 24px',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          Stop
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            background: input.trim() ? 'var(--color-accent)' : 'var(--color-border)',
            color: 'var(--color-bg)',
            border: 'none',
            borderRadius: 8,
            padding: '12px 24px',
            fontWeight: 700,
            fontSize: 14,
            cursor: input.trim() ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            flexShrink: 0,
            opacity: input.trim() ? 1 : 0.5,
          }}
        >
          Send
        </button>
      )}
    </div>
  )
}
