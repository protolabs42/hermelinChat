/**
 * MCP Servers settings panel section.
 *
 * Manages the list of MCP servers Aurora Chat connects to directly for
 * MCP Apps resource fetching + tools/call backchannel routing (Phase 5
 * Option C-A — Aurora Chat owns the MCP client connections; Phase 5.1
 * will migrate ownership to hermes).
 *
 * Persists to localStorage via mcp-config. Live connection state lives
 * in the mcpClients zustand store and is visible as a colored dot on
 * each server row.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { useMcpClientStore } from '../../stores/mcpClients'
import {
  loadConfiguredServers,
  saveConfiguredServers,
} from '../../a2ui/mcp-app/mcp-config'

const DOT_COLOR: Record<string, string> = {
  disconnected: 'var(--color-muted)',
  connecting: 'var(--color-warning)',
  connected: 'var(--color-success)',
  error: 'var(--color-danger)',
}

export default function McpServerSettings() {
  const servers = useMcpClientStore((s) => s.servers)
  const addServer = useMcpClientStore((s) => s.addServer)
  const removeServer = useMcpClientStore((s) => s.removeServer)
  const reconnect = useMcpClientStore((s) => s.reconnect)

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  // Hydrate from persisted config on first mount. Safe to call repeatedly
  // because addServer checks the current state map.
  useEffect(() => {
    const persisted = loadConfiguredServers()
    for (const cfg of persisted) {
      if (!useMcpClientStore.getState().servers[cfg.name]) {
        void addServer(cfg)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persistCurrent = () => {
    const current = Object.values(useMcpClientStore.getState().servers).map(
      (s) => s.config
    )
    saveConfiguredServers(current)
  }

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedUrl = url.trim()
    if (!trimmedName || !trimmedUrl) return
    await addServer({ name: trimmedName, url: trimmedUrl })
    persistCurrent()
    setName('')
    setUrl('')
  }

  const handleRemove = async (n: string) => {
    await removeServer(n)
    persistCurrent()
  }

  const entries = Object.values(servers)

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          fontSize: 12,
          color: 'var(--color-muted)',
          lineHeight: 1.5,
        }}
      >
        Configure MCP servers that expose MCP Apps (ui:// resources). Aurora
        Chat connects directly and renders <code>McpApp</code> components from
        them inline in chat.
      </div>

      {entries.length === 0 && (
        <div
          style={{
            padding: 12,
            fontSize: 12,
            color: 'var(--color-muted)',
            fontFamily: 'var(--font-mono, monospace)',
            background: 'var(--color-elevated)',
            borderRadius: 8,
            border: '1px dashed var(--color-border)',
            textAlign: 'center',
          }}
        >
          No MCP servers configured.
        </div>
      )}

      {entries.map((entry) => (
        <div
          key={entry.config.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            background: 'var(--color-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: DOT_COLOR[entry.state],
              flexShrink: 0,
            }}
          />
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              minWidth: 0,
            }}
          >
            <div
              style={{
                color: 'var(--color-text-bright)',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.config.name}
            </div>
            <div
              style={{
                color: 'var(--color-muted)',
                fontSize: 11,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.config.url}
            </div>
            {entry.error && (
              <div style={{ color: 'var(--color-danger)', fontSize: 11 }}>
                {entry.error}
              </div>
            )}
          </div>
          <button
            onClick={() => reconnect(entry.config.name)}
            style={{
              background: 'transparent',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              cursor: 'pointer',
            }}
          >
            reconnect
          </button>
          <button
            onClick={() => handleRemove(entry.config.name)}
            style={{
              background: 'transparent',
              color: 'var(--color-danger)',
              border: '1px solid var(--color-danger)',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              cursor: 'pointer',
            }}
          >
            remove
          </button>
        </div>
      ))}

      <form
        onSubmit={handleAdd}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <input
          type="text"
          placeholder="name (e.g. get-time-server)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            padding: '8px 12px',
            fontSize: 12,
            fontFamily: 'var(--font-mono, monospace)',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            outline: 'none',
          }}
        />
        <input
          type="text"
          placeholder="http://localhost:3001/mcp"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{
            padding: '8px 12px',
            fontSize: 12,
            fontFamily: 'var(--font-mono, monospace)',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            background: 'var(--color-accent)',
            color: 'var(--color-bg)',
            border: 'none',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'var(--font-mono, monospace)',
            cursor: 'pointer',
          }}
        >
          add server
        </button>
      </form>
    </section>
  )
}
