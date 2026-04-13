/**
 * A2UIDevPreview — dev-only harness that renders every example surface
 * in v2/src/a2ui/examples/ stacked vertically so Phase 2 can be visually
 * verified without running the full agent + hermes + ACP loop.
 *
 * Activated by URL param: launch Aurora Chat with `?a2ui-dev=1` and this
 * replaces the normal chat UI. Production builds without the param are
 * completely unaffected (the normal App renders).
 *
 * The example JSONs are imported directly via Vite's `?raw` query so we
 * get them as plain strings and parse at runtime — no extra build config.
 */

import { useEffect, useMemo, useState } from 'react'
import A2UISurface, { foldMessages } from './A2UISurface'
import { ThemeProvider } from '../../theme'
import type { ActionMessage, ErrorMessage } from '../types'
import { useHermesMcpServers } from '../../stores/hermesMcpServers'

// Vite ?raw imports so the examples ship as string literals and we parse
// at module-load time. No network, no filesystem.
import contactFormRaw from '../examples/contact-form.json?raw'
import interactiveChartRaw from '../examples/interactive-chart.json?raw'
import mcpAppEmbedRaw from '../examples/mcp-app-embed.json?raw'
import threeComponentRaw from '../examples/three-component.json?raw'
import tier1GetTimeRaw from '../examples/tier1-get-time.json?raw'
import tier2QrServerRaw from '../examples/tier2-qr-server.json?raw'
import tier3ThreejsServerRaw from '../examples/tier3-threejs-server.json?raw'

interface ExampleFile {
  _description?: string
  messages: Array<Record<string, unknown>>
}

interface Example {
  name: string
  description?: string
  messages: Array<Record<string, unknown>>
}

function parse(raw: string, name: string): Example {
  const parsed = JSON.parse(raw) as ExampleFile
  return {
    name,
    description: parsed._description,
    messages: parsed.messages,
  }
}

const EXAMPLES: Example[] = [
  parse(contactFormRaw, 'contact-form.json'),
  parse(interactiveChartRaw, 'interactive-chart.json'),
  parse(mcpAppEmbedRaw, 'mcp-app-embed.json'),
  parse(threeComponentRaw, 'three-component.json'),
  // Phase 5 tier tests — require local MCP servers running + entries
  // added via Settings → MCP Servers. See docs/phase5-test-servers.md.
  parse(tier1GetTimeRaw, 'tier1-get-time.json'),
  parse(tier2QrServerRaw, 'tier2-qr-server.json'),
  parse(tier3ThreejsServerRaw, 'tier3-threejs-server.json'),
]

interface LoggedEvent {
  at: string
  kind: 'action' | 'error'
  surface: string
  payload: ActionMessage | ErrorMessage
}

export default function A2UIDevPreview() {
  const surfaces = useMemo(
    () =>
      EXAMPLES.map((ex) => ({
        example: ex,
        surface: foldMessages(ex.messages),
      })),
    []
  )

  // Dev preview replaces the normal app shell, so SettingsPanel never mounts
  // and the hermesMcpServers store may not have loaded yet. Trigger a refresh
  // so MCP App test surfaces can resolve server status without a two-launch dance.
  const { servers: mcpServers, refresh } = useHermesMcpServers()
  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [log, setLog] = useState<LoggedEvent[]>([])

  const onAction = (payload: ActionMessage) =>
    setLog((prev) => {
      const entry: LoggedEvent = {
        at: new Date().toISOString(),
        kind: 'action',
        surface: payload.action.surfaceId,
        payload,
      }
      return [entry, ...prev].slice(0, 10)
    })

  const onError = (payload: ErrorMessage) =>
    setLog((prev) => {
      const entry: LoggedEvent = {
        at: new Date().toISOString(),
        kind: 'error',
        surface: payload.error.surfaceId,
        payload,
      }
      return [entry, ...prev].slice(0, 10)
    })

  return (
    <ThemeProvider>
      <div
        style={{
          height: '100vh',
          width: '100vw',
          overflow: 'auto',
          background: 'var(--color-bg)',
          padding: 32,
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
          <header style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-accent)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                }}
              >
                A2UI Dev Preview
              </div>
              <button
                onClick={() => {
                  localStorage.removeItem('a2ui-dev')
                  const url = new URL(window.location.href)
                  url.searchParams.delete('a2ui-dev')
                  window.location.href = url.toString()
                }}
                style={{
                  background: 'var(--color-elevated)',
                  color: 'var(--color-text-bright)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                exit preview →
              </button>
            </div>
            <h1 style={{ fontSize: 24, margin: 0, color: 'var(--color-text-bright)' }}>
              Phase 3 verification
            </h1>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: 0, lineHeight: 1.5 }}>
              Every example surface from{' '}
              <code
                style={{
                  background: 'var(--color-elevated)',
                  padding: '2px 4px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 12,
                }}
              >
                v2/src/a2ui/examples/
              </code>{' '}
              is folded into a SurfaceState and rendered here through the live{' '}
              <code
                style={{
                  background: 'var(--color-elevated)',
                  padding: '2px 4px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 12,
                }}
              >
                A2UISurface
              </code>{' '}
              component. Inputs write to the data model live, validation runs on
              every keystroke, and Button clicks emit A2UI ActionMessages through
              the onAction callback (shown in the Action log panel above).
            </p>
          </header>

          {Object.values(mcpServers).length > 0 && (
            <section
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                padding: 12,
                background: 'var(--color-elevated)',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 11,
                alignItems: 'center',
              }}
            >
              <div style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                MCP servers:
              </div>
              {Object.values(mcpServers).map((server) => (
                <div key={server.name} style={{ color: 'var(--color-text)' }}>
                  <span
                    style={{
                      color: server.enabled
                        ? 'var(--color-success)'
                        : 'var(--color-muted)',
                    }}
                  >
                    ●
                  </span>{' '}
                  {server.name}{' '}
                  <span style={{ color: 'var(--color-muted)' }}>
                    ({server.enabled ? 'enabled' : 'disabled'})
                  </span>
                </div>
              ))}
            </section>
          )}

          {log.length > 0 && (
            <section
              style={{
                padding: 16,
                borderRadius: 12,
                background: 'var(--color-elevated)',
                border: '1px solid var(--color-border)',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                Action log ({log.length})
              </div>
              {log.map((ev, i) => (
                <div key={i} style={{ color: ev.kind === 'error' ? 'var(--color-danger)' : 'var(--color-text)' }}>
                  <span style={{ color: 'var(--color-muted)' }}>{ev.at.slice(11, 19)} </span>
                  <span style={{ color: 'var(--color-accent)' }}>[{ev.kind}] </span>
                  <span>{ev.surface}: </span>
                  <code style={{ color: 'var(--color-text-bright)' }}>
                    {JSON.stringify(ev.payload).slice(0, 160)}
                  </code>
                </div>
              ))}
            </section>
          )}

          {surfaces.map(({ example, surface }) => (
            <section
              key={example.name}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                padding: 16,
                borderRadius: 12,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <code
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 12,
                    color: 'var(--color-accent)',
                  }}
                >
                  {example.name}
                </code>
                {example.description && (
                  <div style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                    {example.description}
                  </div>
                )}
              </div>

              {surface ? (
                <A2UISurface surface={surface} onAction={onAction} onError={onError} />
              ) : (
                <div style={{ color: 'var(--color-danger)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
                  Failed to fold messages into a SurfaceState.
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </ThemeProvider>
  )
}
