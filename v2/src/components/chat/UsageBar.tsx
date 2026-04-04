import { useChatStore } from '../../stores/chat'

function formatTokens(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`
  }
  return String(n)
}

export default function UsageBar() {
  const usage = useChatStore((s) => s.usage)

  if (!usage) return null

  return (
    <div style={{
      padding: '3px 16px',
      borderTop: '1px solid var(--color-elevated)',
      display: 'flex',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
      fontSize: 9,
      color: 'var(--color-muted)',
      fontFamily: 'monospace',
    }}>
      <span>tokens: {formatTokens(usage.used)} / {formatTokens(usage.size)}</span>
      {usage.costUsd !== null && (
        <span>${usage.costUsd.toFixed(2)}</span>
      )}
    </div>
  )
}
