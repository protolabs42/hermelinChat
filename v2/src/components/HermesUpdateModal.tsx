import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

interface VersionInfo {
  current: string | null
  latest: string | null
  update_available: boolean
  commits_behind: number | null
  install_type: string
  hermes_dir: string | null
}

interface UpdateResult {
  success: boolean
  log: string
  patches_reapplied: boolean
  new_version: string | null
  new_commits_behind: number | null
  verified: boolean
}

interface Props {
  info: VersionInfo
  onClose: () => void
  onUpdateComplete?: () => void
}

export default function HermesUpdateModal({ info, onClose, onUpdateComplete }: Props) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<UpdateResult | null>(null)
  const [liveLog, setLiveLog] = useState('')
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    listen<string>('hermes-update:log', (event) => {
      setLiveLog((prev) => prev + event.payload)
    }).then((fn) => { unlisten = fn })
    return () => { if (unlisten) unlisten() }
  }, [])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [liveLog])

  const handleUpdate = async () => {
    setRunning(true)
    setLiveLog('')
    try {
      const r = await invoke<UpdateResult>('apply_hermes_update')
      setResult(r)
      if (onUpdateComplete) onUpdateComplete()
    } catch (e) {
      setResult({
        success: false,
        log: `Error: ${e}`,
        patches_reapplied: false,
        new_version: null,
        new_commits_behind: null,
        verified: false,
      })
    } finally {
      setRunning(false)
    }
  }

  const handleReconnect = async () => {
    try {
      await invoke('acp_reconnect')
    } catch (e) {
      console.error('Reconnect failed:', e)
    }
    onClose()
  }

  return (
    <>
      <style>{`
        @keyframes hermes-update-spin { to { transform: rotate(360deg); } }
        @keyframes hermes-update-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .hermes-update-btn {
          transition: background 120ms ease, border-color 120ms ease, transform 80ms ease, opacity 120ms ease;
        }
        .hermes-update-btn:hover:not(:disabled) {
          filter: brightness(1.15);
        }
        .hermes-update-btn:active:not(:disabled) {
          transform: scale(0.97);
        }
        .hermes-update-btn-primary:hover:not(:disabled) {
          box-shadow: 0 0 0 2px var(--color-accent);
        }
        .hermes-update-btn-secondary:hover:not(:disabled) {
          background: var(--color-elevated);
          border-color: var(--color-accent);
        }
      `}</style>
      <div
        onClick={running ? undefined : onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 1000,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 560,
          maxWidth: '90vw',
          maxHeight: '80vh',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          zIndex: 1010,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-bright)' }}>
            Update Hermes
          </span>
          {!running && (
            <button
              onClick={onClose}
              style={{
                width: 28,
                height: 28,
                background: 'transparent',
                border: 'none',
                color: 'var(--color-muted)',
                cursor: 'pointer',
                fontSize: 18,
              }}
            >
              ×
            </button>
          )}
        </div>

        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {running ? (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
                fontSize: 13,
                color: 'var(--color-accent)',
                fontWeight: 600,
              }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 16,
                    height: 16,
                    border: '2px solid currentColor',
                    borderRightColor: 'transparent',
                    borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'hermes-update-spin 0.8s linear infinite',
                  }}
                />
                <span style={{ animation: 'hermes-update-pulse 1.6s ease-in-out infinite' }}>
                  Running hermes update — streaming output below
                </span>
              </div>
              <pre
                ref={logRef}
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono, monospace)',
                  maxHeight: 360,
                  minHeight: 180,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0,
                  color: 'var(--color-text)',
                }}
              >
                {liveLog || 'Starting…\n'}
              </pre>
            </>
          ) : result === null ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 13 }}>
                <span style={{ color: 'var(--color-muted)' }}>Current</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  {info.current ?? 'unknown'}
                </span>
                <span style={{ color: 'var(--color-muted)' }}>Latest</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-accent)' }}>
                  {info.latest ?? 'unknown'}
                </span>
                {info.commits_behind !== null && (
                  <>
                    <span style={{ color: 'var(--color-muted)' }}>Behind</span>
                    <span>{info.commits_behind} commits</span>
                  </>
                )}
                <span style={{ color: 'var(--color-muted)' }}>Install</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
                  {info.install_type}
                  {info.hermes_dir && ` \u2014 ${info.hermes_dir}`}
                </span>
              </div>

              <div style={{
                marginTop: 20,
                padding: 12,
                background: 'var(--color-elevated)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--color-muted)',
                lineHeight: 1.5,
              }}>
                This will run <code>hermes update</code> (git pull + reinstall deps) and then
                reapply the Aurora Chat patches (artifact_tool, a2ui_tool, toolsets, session.py).
                The ACP session will need to reconnect afterwards.
              </div>

              <div style={{
                marginTop: 20,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}>
                <button
                  onClick={onClose}
                  className="hermes-update-btn hermes-update-btn-secondary"
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    color: 'var(--color-text-bright)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdate}
                  className="hermes-update-btn hermes-update-btn-primary"
                  style={{
                    padding: '8px 16px',
                    background: 'var(--color-accent)',
                    border: 'none',
                    borderRadius: 8,
                    color: 'var(--color-bg)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                  }}
                >
                  Run update
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{
                padding: 12,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 12,
                background: result.success
                  ? (result.verified ? 'var(--color-success)' : 'var(--color-warning, #f9e2af)')
                  : 'var(--color-danger)',
                color: 'var(--color-bg)',
              }}>
                <div>
                  {result.success
                    ? (result.verified
                        ? (result.patches_reapplied
                            ? 'Update verified — patches reapplied'
                            : 'Update verified — patches need manual reapply')
                        : 'Update ran, but HEAD is still behind origin — check log')
                    : 'Update failed'}
                </div>
                {(result.new_version || result.new_commits_behind !== null) && (
                  <div style={{ fontSize: 11, fontWeight: 500, marginTop: 6, opacity: 0.9, fontFamily: 'var(--font-mono, monospace)' }}>
                    {info.current ?? '?'} → {result.new_version ?? '?'}
                    {result.new_commits_behind !== null && result.new_commits_behind > 0 &&
                      ` (still ${result.new_commits_behind} behind)`}
                  </div>
                )}
              </div>
              <pre style={{
                background: 'var(--color-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 12,
                fontSize: 11,
                fontFamily: 'var(--font-mono, monospace)',
                maxHeight: 320,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
                color: 'var(--color-text)',
              }}>
                {result.log}
              </pre>
              <div style={{
                marginTop: 16,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}>
                <button
                  onClick={onClose}
                  className="hermes-update-btn hermes-update-btn-secondary"
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    color: 'var(--color-text-bright)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                >
                  Close
                </button>
                {result.success && (
                  <button
                    onClick={handleReconnect}
                    className="hermes-update-btn hermes-update-btn-primary"
                    style={{
                      padding: '8px 16px',
                      background: 'var(--color-accent)',
                      border: 'none',
                      borderRadius: 8,
                      color: 'var(--color-bg)',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                    }}
                  >
                    Reconnect ACP
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
