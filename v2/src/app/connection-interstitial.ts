export interface ConnectionInterstitialStep {
  id: 'connect' | 'restore-workspace' | 'resume-thread'
  label: string
  status: 'complete' | 'active' | 'pending'
}

export interface ConnectionInterstitialModel {
  title: string
  detail: string
  hint: string
  steps: ConnectionInterstitialStep[]
  showRecovery: boolean
}

export interface ConnectionInterstitialArgs {
  connectionStatus: string
  elapsedMs: number
  rememberedSessionId: string | null
  preferFreshSession?: boolean
  sessionId: string | null
  workspaceHydrated: boolean
  workspaceId: string | null
}

const STALLED_AFTER_MS = 10_000

function buildSteps(activeStep: ConnectionInterstitialStep['id']): ConnectionInterstitialStep[] {
  const ordered: ConnectionInterstitialStep['id'][] = ['connect', 'restore-workspace', 'resume-thread']
  return ordered.map((id) => ({
    id,
    label: id === 'connect'
      ? 'Connect to Hermes'
      : id === 'restore-workspace'
      ? 'Restore workspace'
      : 'Start session',
    status: ordered.indexOf(id) < ordered.indexOf(activeStep)
      ? 'complete'
      : id === activeStep
      ? 'active'
      : 'pending',
  }))
}

export function buildConnectionInterstitialModel(
  args: ConnectionInterstitialArgs
): ConnectionInterstitialModel | null {
  if (args.sessionId) return null

  if (args.connectionStatus !== 'connected') {
    return {
      title: 'Connecting to Hermes',
      detail: 'Bringing Aurora online before we restore your workspace state.',
      hint: 'Usually under 10 seconds. If it hangs, recovery actions will appear here.',
      steps: buildSteps('connect'),
      showRecovery: args.elapsedMs >= STALLED_AFTER_MS,
    }
  }

  if (!args.workspaceHydrated) {
    return {
      title: 'Restoring workspace',
      detail: args.workspaceId
        ? `Loading remembered context for ws:${args.workspaceId}.`
        : 'Loading remembered workspace context.',
      hint: 'Chrome, surfaces, and continuity state come back before the chat is ready.',
      steps: buildSteps('restore-workspace'),
      showRecovery: args.elapsedMs >= STALLED_AFTER_MS,
    }
  }

  if (args.rememberedSessionId) {
    return {
      title: 'Loading remembered thread',
      detail: args.workspaceId
        ? `Reopening ${args.rememberedSessionId} in ws:${args.workspaceId}.`
        : `Reopening ${args.rememberedSessionId}.`,
      hint: 'This restores the remembered thread context, not any interrupted tool execution.',
      steps: buildSteps('resume-thread'),
      showRecovery: args.elapsedMs >= STALLED_AFTER_MS,
    }
  }

  return {
    title: 'Starting a fresh session',
    detail: args.workspaceId
      ? `No remembered thread for ws:${args.workspaceId}, so Aurora is starting fresh.`
      : 'No remembered thread was found, so Aurora is starting fresh.',
    hint: 'You can wait for the new session, retry the connection, or jump straight into Scratchpad.',
    steps: buildSteps('resume-thread'),
    showRecovery: args.elapsedMs >= STALLED_AFTER_MS,
  }
}
