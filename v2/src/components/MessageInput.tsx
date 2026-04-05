import { useState, useRef, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../stores/chat'

const MAX_ROWS = 4
const LINE_HEIGHT = 20
const CHAR_COUNT_THRESHOLD = 500

export default function MessageInput() {
  const [input, setInput] = useState('')
  const sessionId = useChatStore((s) => s.sessionId)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const addUserMessage = useChatStore((s) => s.addUserMessage)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = LINE_HEIGHT * MAX_ROWS + 16 // padding
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
      borderTop: '1px solid var(--color-border)',
      padding: '12px 16px',
      display: 'flex',
      gap: 8,
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
          placeholder="Message Aurora..."
          disabled={isStreaming}
          style={{
            width: '100%',
            background: 'var(--color-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: '8px 12px',
            color: 'var(--color-text-bright)',
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
            opacity: isStreaming ? 0.5 : 1,
            resize: 'none',
            lineHeight: `${LINE_HEIGHT}px`,
            overflow: 'auto',
          }}
        />
        {input.length > CHAR_COUNT_THRESHOLD && (
          <span style={{
            position: 'absolute',
            right: 8,
            bottom: 6,
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
            background: 'var(--color-danger, #f38ba8)',
            color: 'var(--color-bg)',
            border: '1px solid transparent',
            borderRadius: 8,
            padding: '7px 16px',
            fontWeight: 700,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
            flexShrink: 0,
            lineHeight: `${LINE_HEIGHT}px`,
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
            border: '1px solid transparent',
            borderRadius: 8,
            padding: '7px 16px',
            fontWeight: 700,
            fontSize: 12,
            cursor: input.trim() ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            flexShrink: 0,
            lineHeight: `${LINE_HEIGHT}px`,
          }}
        >
          Send
        </button>
      )}
    </div>
  )
}
