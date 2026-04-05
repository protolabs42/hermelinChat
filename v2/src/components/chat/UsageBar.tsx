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
    <div className="px-4 py-[3px] border-t border-(--color-elevated) flex justify-end items-center gap-3 text-[9px] text-(--color-muted) font-mono">
      <span>tokens: {formatTokens(usage.used)} / {formatTokens(usage.size)}</span>
      {usage.costUsd !== null && (
        <span>${usage.costUsd.toFixed(2)}</span>
      )}
    </div>
  )
}
