import type { ChatMessage } from '../../stores/chat'

interface Props {
  message: ChatMessage
}

interface DiffLine {
  type: 'add' | 'remove' | 'context'
  text: string
}

function computeDiff(oldText: string | null | undefined, newText: string | undefined): DiffLine[] {
  if (!newText) return []

  const oldLines = oldText ? oldText.split('\n') : []
  const newLines = newText.split('\n')

  // If there's no old text, everything is an addition
  if (oldLines.length === 0) {
    return newLines.map((line) => ({ type: 'add' as const, text: line }))
  }

  // Simple LCS-based diff
  const lines: DiffLine[] = []
  const oldSet = new Set(oldLines)
  const newSet = new Set(newLines)

  // Show removed lines first, then added lines
  // This is a simplified approach: lines only in old are removed, only in new are added
  // Lines in both are context
  let oi = 0
  let ni = 0

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      lines.push({ type: 'context', text: oldLines[oi] })
      oi++
      ni++
    } else if (oi < oldLines.length && !newSet.has(oldLines[oi])) {
      lines.push({ type: 'remove', text: oldLines[oi] })
      oi++
    } else if (ni < newLines.length && !oldSet.has(newLines[ni])) {
      lines.push({ type: 'add', text: newLines[ni] })
      ni++
    } else if (oi < oldLines.length) {
      lines.push({ type: 'remove', text: oldLines[oi] })
      oi++
    } else {
      lines.push({ type: 'add', text: newLines[ni] })
      ni++
    }
  }

  return lines
}

export default function DiffView({ message }: Props) {
  const diffLines = computeDiff(message.diffOld, message.diffNew)

  const addCount = diffLines.filter((l) => l.type === 'add').length
  const removeCount = diffLines.filter((l) => l.type === 'remove').length

  const handleAccept = () => {
    console.log('DiffView: accept', message.diffPath)
  }

  const handleReject = () => {
    console.log('DiffView: reject', message.diffPath)
  }

  return (
    <div className="mb-3">
      {/* File header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-(--color-surface) rounded-t-[6px] border-b border-(--color-elevated)">
        <span className="text-[11px] text-(--color-purple) font-mono font-semibold">
          {message.diffPath}
        </span>
        <span className="text-[10px] text-(--color-success) ml-auto">+{addCount}</span>
        <span className="text-[10px] text-(--color-danger)">-{removeCount}</span>
      </div>

      {/* Diff body */}
      <div className="bg-(--color-bg) py-2 rounded-b-[6px] font-mono text-[11px] leading-relaxed overflow-auto max-h-[400px]">
        {diffLines.map((line, i) => {
          const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
          const color = line.type === 'add' ? 'var(--color-success)' : line.type === 'remove' ? 'var(--color-danger)' : 'var(--color-muted)'
          const bg = line.type === 'add'
            ? 'rgba(166, 227, 161, 0.08)'
            : line.type === 'remove'
              ? 'rgba(243, 139, 168, 0.08)'
              : 'transparent'

          return (
            <div key={i} style={{ padding: '0 12px', color, background: bg, whiteSpace: 'pre' }}>
              {prefix} {line.text}
            </div>
          )
        })}
      </div>

      {/* Accept / Reject buttons */}
      <div className="flex gap-2 mt-1.5">
        <button
          onClick={handleAccept}
          className="bg-transparent border border-(--color-success) rounded-[4px] text-(--color-success) text-[10px] px-2.5 py-[3px] cursor-pointer font-mono hover:bg-(--color-success)/10"
        >
          Accept
        </button>
        <button
          onClick={handleReject}
          className="bg-transparent border border-(--color-danger) rounded-[4px] text-(--color-danger) text-[10px] px-2.5 py-[3px] cursor-pointer font-mono hover:bg-(--color-danger)/10"
        >
          Reject
        </button>
      </div>
    </div>
  )
}
