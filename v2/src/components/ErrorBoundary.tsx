/**
 * ErrorBoundary — reusable React error boundary.
 *
 * Wrap any subtree to prevent a crash from blanking the whole app.
 *
 * Usage:
 *   <ErrorBoundary label="Sidebar"><Sidebar /></ErrorBoundary>
 *   <ErrorBoundary label="Chart" compact><ChartRenderer ... /></ErrorBoundary>
 *
 * Props:
 *   - label?: string  — shown in the fallback UI to identify which subtree crashed
 *   - compact?: boolean — render a smaller fallback for inline contexts
 *   - fallback?: (error, reset) => ReactNode — fully custom fallback
 *   - onError?: (error, info) => void — side-effect hook (logging, telemetry)
 *   - resetKeys?: unknown[] — when any value here changes, the boundary auto-resets
 *
 * The boundary logs to console.error in all cases so devtools shows the stack.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  label?: string
  compact?: boolean
  fallback?: (error: Error, reset: () => void) => ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
  resetKeys?: unknown[]
}

interface ErrorBoundaryState {
  error: Error | null
  errorInfo: ErrorInfo | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ errorInfo: info })

    // Always log so devtools / terminal output captures the stack
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}]`,
      error,
      info
    )

    this.props.onError?.(error, info)
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (!this.state.error) return
    const prev = prevProps.resetKeys || []
    const next = this.props.resetKeys || []
    if (prev.length !== next.length || prev.some((v, i) => v !== next[i])) {
      this.reset()
    }
  }

  reset = () => this.setState({ error: null, errorInfo: null })

  render() {
    const { error, errorInfo } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset)
    }

    return this.props.compact ? (
      <CompactFallback label={this.props.label} error={error} reset={this.reset} />
    ) : (
      <FullFallback label={this.props.label} error={error} info={errorInfo} reset={this.reset} />
    )
  }
}

function FullFallback({
  label,
  error,
  info,
  reset,
}: {
  label?: string
  error: Error
  info: ErrorInfo | null
  reset: () => void
}) {
  return (
    <div
      style={{
        padding: 16,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        overflow: 'auto',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 11,
        color: 'var(--color-danger)',
        background: 'var(--color-bg)',
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 12 }}>
        <span>Crash</span>
        {label && (
          <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}>in {label}</span>
        )}
      </div>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--color-text)', margin: 0 }}>
        {error.message || String(error)}
      </pre>
      {error.stack && (
        <details style={{ color: 'var(--color-muted)' }}>
          <summary style={{ cursor: 'pointer' }}>Stack trace</summary>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 10,
              opacity: 0.85,
              marginTop: 8,
            }}
          >
            {error.stack}
          </pre>
        </details>
      )}
      {info?.componentStack && (
        <details style={{ color: 'var(--color-muted)' }}>
          <summary style={{ cursor: 'pointer' }}>Component stack</summary>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 10,
              opacity: 0.85,
              marginTop: 8,
            }}
          >
            {info.componentStack}
          </pre>
        </details>
      )}
      <button
        onClick={reset}
        style={{
          alignSelf: 'flex-start',
          background: 'var(--color-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          color: 'var(--color-text-bright)',
          padding: '6px 12px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 11,
        }}
      >
        Retry
      </button>
    </div>
  )
}

function CompactFallback({
  label,
  error,
  reset,
}: {
  label?: string
  error: Error
  reset: () => void
}) {
  return (
    <div
      style={{
        padding: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 11,
        color: 'var(--color-danger)',
        background: 'var(--color-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
      }}
    >
      <span style={{ fontWeight: 600 }}>{label ? `${label} crashed` : 'Crashed'}:</span>
      <span style={{ color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {error.message || String(error)}
      </span>
      <button
        onClick={reset}
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 4,
          color: 'var(--color-text-bright)',
          padding: '2px 8px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 10,
        }}
      >
        retry
      </button>
    </div>
  )
}
