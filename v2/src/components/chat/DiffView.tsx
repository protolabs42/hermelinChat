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
    <div style={{ marginBottom: 12 }}>
      {/* File header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: 'var(--color-surface)',
        borderRadius: '6px 6px 0 0',
        borderBottom: '1px solid var(--color-elevated)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--color-purple)', fontFamily: 'monospace', fontWeight: 600 }}>
          {message.diffPath}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-success)', marginLeft: 'auto' }}>+{addCount}</span>
        <span style={{ fontSize: 10, color: 'var(--color-danger)' }}>-{removeCount}</span>
      </div>

      {/* Diff body */}
      <div style={{
        background: 'var(--color-bg)',
        padding: '8px 0',
        borderRadius: '0 0 6px 6px',
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: 1.6,
        overflow: 'auto',
        maxHeight: 400,
      }}>
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
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button
          onClick={handleAccept}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-success)',
            borderRadius: 4,
            color: 'var(--color-success)',
            fontSize: 10,
            padding: '3px 10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Accept
        </button>
        <button
          onClick={handleReject}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-danger)',
            borderRadius: 4,
            color: 'var(--color-danger)',
            fontSize: 10,
            padding: '3px 10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Reject
        </button>
      </div>
    </div>
  )
}
