import type { ChatMessage, UsageInfo } from '../stores/chat'

export interface ChatPaneHeaderModel {
  cwdLabel: string | null
  cwdTitle: string | null
  branchLabel: string | null
  branchDirty: boolean
  tokenBudgetLabel: string | null
  activityLabel: string | null
  activityTitle: string | null
}

interface BuildChatPaneHeaderArgs {
  cwd: string | null
  branch: string | null
  dirty: boolean
  usage: UsageInfo | null
  messages: ChatMessage[]
  now?: number
}

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const abs = Math.abs(value)
  if (abs >= 1000) {
    return `${(value / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`
  }
  return String(Math.round(value))
}

export function buildCompactPathLabel(cwd: string | null, visibleSegments = 2): string | null {
  const raw = String(cwd ?? '').trim()
  if (!raw) return null
  const normalized = raw.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/'
  if (normalized === '/') return '/'

  const isAbsolute = normalized.startsWith('/')
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length <= visibleSegments) {
    return normalized
  }

  const tail = segments.slice(-visibleSegments).join('/')
  return isAbsolute ? `/…/${tail}` : `…/${tail}`
}

export function formatTokenBudgetLabel(usage: UsageInfo | null): string | null {
  if (!usage) return null
  const remaining = Math.max(usage.size - usage.used, 0)
  return `${formatCompactNumber(remaining)} left`
}

export function formatRelativeTime(now: number, timestamp: number): string {
  const deltaSeconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (deltaSeconds < 45) return 'just now'
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`
  if (deltaSeconds < 86_400) return `${Math.floor(deltaSeconds / 3600)}h ago`
  return `${Math.floor(deltaSeconds / 86_400)}d ago`
}

export function getActivityActorLabel(message: ChatMessage | null | undefined): string | null {
  if (!message) return null
  switch (message.role) {
    case 'assistant':
    case 'thinking':
      return 'Aurora'
    case 'user':
      return 'Inu'
    case 'tool':
      return message.toolTitle ? `Tool · ${message.toolTitle}` : 'Tool'
    case 'surface':
      return 'Surface'
    case 'system':
      return 'System'
    default:
      return null
  }
}

export function buildActivityLabel(messages: ChatMessage[], now: number): { label: string; title: string } | null {
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
  const actor = getActivityActorLabel(lastMessage)
  if (!lastMessage || !actor) return null
  const relative = formatRelativeTime(now, lastMessage.timestamp)
  return {
    label: `${actor} · ${relative}`,
    title: `${actor} activity at ${new Date(lastMessage.timestamp).toLocaleString()}`,
  }
}

export function buildChatPaneHeaderModel(args: BuildChatPaneHeaderArgs): ChatPaneHeaderModel {
  const now = args.now ?? Date.now()
  const activity = buildActivityLabel(args.messages, now)
  return {
    cwdLabel: buildCompactPathLabel(args.cwd),
    cwdTitle: args.cwd,
    branchLabel: args.branch ? String(args.branch) : null,
    branchDirty: Boolean(args.branch && args.dirty),
    tokenBudgetLabel: formatTokenBudgetLabel(args.usage),
    activityLabel: activity?.label ?? null,
    activityTitle: activity?.title ?? null,
  }
}
