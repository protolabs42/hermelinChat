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
    <div style={{
      marginBottom: 16,
      borderRadius: 8,
      overflow: 'hidden',
      border: '1px solid var(--color-border)',
    }}>
      {/* File header */}
      <div style={{
        padding: '10px 16px',
        background: 'var(--color-surface)',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        fontSize: 12,
        lineHeight: 1.4,
      }}>
        <span style={{ color: 'var(--color-purple)', fontWeight: 500 }}>
          {message.diffPath}
        </span>
        <span style={{ color: 'var(--color-muted)' }}>
          +{addCount} -{removeCount}
        </span>
      </div>

      {/* Diff body */}
      <div style={{
        background: 'var(--color-bg)',
        padding: '12px 16px',
        fontSize: 12,
        lineHeight: 1.7,
        fontFamily: "'Fira Code', monospace",
        overflow: 'auto',
        maxHeight: 400,
      }}>
        {diffLines.map((line, i) => {
          const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
          const color = line.type === 'add' ? 'var(--color-success)' : line.type === 'remove' ? 'var(--color-danger)' : 'var(--color-muted)'
          const opacity = line.type === 'remove' ? 0.7 : 1

          return (
            <div key={i} style={{ color, opacity, whiteSpace: 'pre' }}>
              {prefix} {line.text}
            </div>
          )
        })}
      </div>

      {/* Accept / Reject buttons */}
      <div style={{
        padding: '8px 16px',
        background: 'var(--color-surface)',
        display: 'flex',
        gap: 8,
        justifyContent: 'flex-end',
      }}>
        <button
          onClick={handleAccept}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: 'none',
            fontSize: 12,
            fontFamily: 'inherit',
            cursor: 'pointer',
            fontWeight: 600,
            background: 'var(--color-success)',
            color: 'var(--color-bg)',
          }}
        >
          Accept
        </button>
        <button
          onClick={handleReject}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: 'none',
            fontSize: 12,
            fontFamily: 'inherit',
            cursor: 'pointer',
            fontWeight: 600,
            background: 'var(--color-danger)',
            color: 'var(--color-bg)',
          }}
        >
          Reject
        </button>
      </div>
    </div>
  )
}
