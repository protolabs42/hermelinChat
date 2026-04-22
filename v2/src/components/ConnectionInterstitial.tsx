import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

import {
  buildConnectionInterstitialModel,
  type ConnectionInterstitialModel,
} from '../app/connection-interstitial'
import { useChatStore } from '../stores/chat'
import { useProjectStore, SCRATCHPAD_ID } from '../stores/projects'
import { useWorkspaceStore } from '../stores/workspaces'
import { useTheme } from '../theme'

interface Props {
  model: ConnectionInterstitialModel
  startupStartedAt: number
}

function Spinner() {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.16)',
        borderTopColor: 'var(--color-accent)',
        animation: 'spin 900ms linear infinite',
      }}
    />
  )
}

export default function ConnectionInterstitial({ model, startupStartedAt }: Props) {
  const { theme } = useTheme()
  const [attemptStartedAt, setAttemptStartedAt] = useState(startupStartedAt)
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startupStartedAt)
  const [busyAction, setBusyAction] = useState<'retry' | 'fresh' | 'scratchpad' | null>(null)
  const [recoveryIntent, setRecoveryIntent] = useState<'fresh' | 'scratchpad' | null>(null)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const getActiveProject = useProjectStore((s) => s.getActiveProject)
  const workspaceHydrated = useWorkspaceStore((s) => s.hydrated)
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const connectionStatus = useChatStore((s) => s.connectionStatus)
  const sessionId = useChatStore((s) => s.sessionId)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - attemptStartedAt)
    }, 500)
    return () => window.clearInterval(timer)
  }, [attemptStartedAt])

  useEffect(() => {
    setAttemptStartedAt(startupStartedAt)
    setElapsedMs(Date.now() - startupStartedAt)
  }, [startupStartedAt])

  const effectiveModel = useMemo(() => {
    const rememberedSessionId = activeWorkspace?.continuity.activeThreadId
      ?? activeWorkspace?.resident.sessionId
      ?? null
    return buildConnectionInterstitialModel({
      connectionStatus,
      elapsedMs,
      rememberedSessionId,
      preferFreshSession: recoveryIntent === 'fresh' || recoveryIntent === 'scratchpad',
      sessionId,
      workspaceHydrated,
      workspaceId: recoveryIntent === 'scratchpad' ? 'scratchpad' : activeWorkspace?.workspaceId ?? null,
    }) ?? model
  }, [activeWorkspace, connectionStatus, elapsedMs, model, recoveryIntent, sessionId, workspaceHydrated])

  const activeProject = getActiveProject()
  const currentProjectLabel = recoveryIntent === 'scratchpad'
    ? 'Scratchpad'
    : activeProjectId === SCRATCHPAD_ID || !activeProjectId
      ? 'Scratchpad'
      : activeProject?.name ?? 'current project'

  const handleRetry = async () => {
    try {
      setBusyAction('retry')
      setRecoveryIntent(null)
      setAttemptStartedAt(Date.now())
      setElapsedMs(0)
      useChatStore.setState({ connectionStatus: 'connecting' })
      await invoke('acp_reconnect')
    } catch (error) {
      console.error('Retry connection failed:', error)
    } finally {
      setBusyAction(null)
    }
  }

  const handleFreshSession = async () => {
    try {
      setBusyAction('fresh')
      setRecoveryIntent('fresh')
      setAttemptStartedAt(Date.now())
      setElapsedMs(0)
      useChatStore.getState().reset()
      useChatStore.setState({ connectionStatus: 'connecting' })
      let cwd: string | null = activeProject?.path || null
      if (!cwd) {
        cwd = await invoke<string>('get_home_dir').catch(() => null)
      }
      await invoke('acp_new_session', { cwd })
    } catch (error) {
      console.error('Fresh session start failed:', error)
    } finally {
      setBusyAction(null)
    }
  }

  const handleScratchpad = async () => {
    try {
      setBusyAction('scratchpad')
      setRecoveryIntent('scratchpad')
      setAttemptStartedAt(Date.now())
      setElapsedMs(0)
      await useProjectStore.getState().setActiveProject(SCRATCHPAD_ID)
      useChatStore.setState({ connectionStatus: 'connecting' })
    } catch (error) {
      console.error('Scratchpad recovery failed:', error)
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
        padding: '32px',
      }}
    >
      <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
      <div
        style={{
          width: 'min(680px, 100%)',
          borderRadius: 20,
          border: '1px solid var(--color-border)',
          background: 'color-mix(in srgb, var(--color-surface) 92%, black)',
          boxShadow: '0 22px 60px rgba(0,0,0,0.35)',
          padding: '28px 28px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Spinner />
              <span
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--color-accent)',
                }}
              >
                {theme.identity.mascotTitle}
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1, color: 'var(--color-text-bright)' }}>
              {effectiveModel.title}
            </h1>
            <p style={{ margin: 0, color: 'var(--color-text)', lineHeight: 1.5, maxWidth: 520 }}>
              {effectiveModel.detail}
            </p>
          </div>
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid var(--color-border)',
              color: 'var(--color-muted)',
              fontSize: 12,
              fontFamily: 'var(--font-mono, monospace)',
              whiteSpace: 'nowrap',
            }}
          >
            {Math.max(1, Math.floor(elapsedMs / 1000))}s
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {effectiveModel.steps.map((step) => (
            <div
              key={step.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--color-border)',
                background: step.status === 'active'
                  ? 'rgba(255,255,255,0.04)'
                  : 'transparent',
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: step.status === 'complete'
                    ? 'var(--color-success)'
                    : step.status === 'active'
                    ? 'var(--color-accent)'
                    : 'var(--color-border)',
                  boxShadow: step.status === 'active' ? '0 0 0 4px rgba(122,162,247,0.14)' : 'none',
                  flexShrink: 0,
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ color: 'var(--color-text-bright)', fontWeight: 600 }}>{step.label}</span>
                <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>
                  {step.status === 'complete'
                    ? 'Done'
                    : step.status === 'active'
                    ? 'In progress now'
                    : 'Waiting for the earlier steps to finish'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>{effectiveModel.hint}</span>
            <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>
              Working in {currentProjectLabel}. Workspace continuity stays honest here: remembered context, not fake resumability.
            </span>
          </div>

          {effectiveModel.showRecovery && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={handleRetry}
                data-testid="retry-connection"
                disabled={busyAction !== null}
                style={buttonStyle('secondary')}
              >
                {busyAction === 'retry' ? 'Retrying…' : 'Retry connection'}
              </button>
              {connectionStatus === 'connected' && (
                <button
                  onClick={handleFreshSession}
                  data-testid="start-fresh"
                  disabled={busyAction !== null}
                  style={buttonStyle('primary')}
                >
                  {busyAction === 'fresh' ? 'Starting…' : 'Start fresh here'}
                </button>
              )}
              {connectionStatus === 'connected' && (
                <button
                  onClick={handleScratchpad}
                  data-testid="open-scratchpad"
                  disabled={busyAction !== null}
                  style={buttonStyle('ghost')}
                >
                  {busyAction === 'scratchpad' ? 'Opening…' : 'Open Scratchpad'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function buttonStyle(kind: 'primary' | 'secondary' | 'ghost'): React.CSSProperties {
  return {
    borderRadius: 10,
    border: kind === 'ghost' ? '1px dashed var(--color-border)' : '1px solid var(--color-border)',
    background: kind === 'primary'
      ? 'var(--color-accent)'
      : kind === 'secondary'
      ? 'var(--color-elevated)'
      : 'transparent',
    color: kind === 'primary' ? 'var(--color-bg)' : 'var(--color-text-bright)',
    padding: '10px 14px',
    fontWeight: 600,
    cursor: 'pointer',
  }
}
