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
    <div className="px-6 py-4">
      <div className="max-w-3xl mx-auto glass-surface rounded-lg border border-(--color-border) shadow-[0_-4px_24px_rgba(0,0,0,0.15)]">
        <div className="flex gap-2 items-start p-2">
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
              className="w-full bg-transparent border-none rounded-lg px-4 py-3 text-(--color-text-bright) text-[13px] font-mono outline-none resize-none overflow-auto"
              style={{
                opacity: isStreaming ? 0.5 : 1,
                lineHeight: `${LINE_HEIGHT}px`,
              }}
            />
            {input.length > CHAR_COUNT_THRESHOLD && (
              <span className="absolute right-2 bottom-1.5 text-[9px] text-(--color-muted) opacity-60 pointer-events-none">
                {input.length}
              </span>
            )}
          </div>
          {isStreaming ? (
            <button
              onClick={handleCancel}
              className="bg-(--color-danger) text-(--color-bg) border border-transparent rounded-lg px-4 h-[34px] font-bold text-xs cursor-pointer font-mono shrink-0 self-end mb-1 mr-1 hover:opacity-90 transition-opacity duration-100"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={`text-(--color-bg) border border-transparent rounded-lg px-4 h-[34px] font-bold text-xs font-mono shrink-0 self-end mb-1 mr-1 transition-all duration-100 ${
                input.trim() ? 'bg-(--color-accent) cursor-pointer hover:opacity-90' : 'bg-(--color-border) cursor-not-allowed opacity-60'
              }`}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
