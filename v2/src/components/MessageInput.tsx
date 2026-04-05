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
    <div className="border-t border-(--color-border) bg-(--color-surface) p-6 flex gap-4 items-start">
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          autoFocus
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Aurora..."
          disabled={isStreaming}
          className="w-full bg-(--color-elevated) border border-(--color-border) rounded-lg px-5 py-3 text-(--color-text-bright) font-mono outline-none resize-none overflow-auto focus:border-(--color-accent) transition-colors"
          style={{
            opacity: isStreaming ? 0.5 : 1,
            lineHeight: `${LINE_HEIGHT}px`,
          }}
        />
        {input.length > CHAR_COUNT_THRESHOLD && (
          <span className="absolute right-3 bottom-2 text-[9px] text-(--color-muted) opacity-60 pointer-events-none">
            {input.length}
          </span>
        )}
      </div>
      {isStreaming ? (
        <button
          onClick={handleCancel}
          className="bg-(--color-danger) text-(--color-bg) border-none rounded-lg px-6 py-3 font-bold text-sm cursor-pointer font-mono shrink-0 hover:opacity-90 transition-opacity"
        >
          Stop
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className={`text-(--color-bg) border-none rounded-lg px-6 py-3 font-bold text-sm font-mono shrink-0 transition-all ${
            input.trim() ? 'bg-(--color-accent) cursor-pointer hover:opacity-90' : 'bg-(--color-border) cursor-not-allowed opacity-50'
          }`}
        >
          Send
        </button>
      )}
    </div>
  )
}
