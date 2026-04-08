/**
 * MCP client store — manages connections to configured MCP servers.
 *
 * One Client per server, keyed by a logical name that matches the `server`
 * field in A2UI McpApp components. AppHost looks up the Client at iframe
 * mount time and hands it to AppBridge for automatic tools/call +
 * resources/read proxying.
 *
 * Phase 5 Option C-A: Aurora Chat owns these connections directly.
 * Phase 5.1 will migrate ownership to hermes and this store becomes
 * a thin view over hermes' MCP layer.
 */

import { create } from 'zustand'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface McpServerConfig {
  /** Logical name — must match the `server` field in McpApp components. */
  name: string
  /** HTTP URL of the MCP server (e.g. http://localhost:3001/mcp). */
  url: string
}

export interface McpServerEntry {
  config: McpServerConfig
  state: ConnectionState
  error?: string
  client?: Client
}

interface McpClientStore {
  servers: Record<string, McpServerEntry>
  /** Add a server and attempt to connect immediately. */
  addServer: (config: McpServerConfig) => Promise<void>
  /** Remove + disconnect a server. */
  removeServer: (name: string) => Promise<void>
  /**
   * Force reconnect an existing server. Unlike removeServer→addServer,
   * the entry stays in place (state flips to 'connecting') so the
   * settings UI doesn't see the row vanish and reappear.
   */
  reconnect: (name: string) => Promise<void>
  /** Look up a connected client by server name. Returns null if not connected. */
  getClient: (name: string) => Client | null
  /** Close every connection + wipe the store. Mirrors the pattern in chat.ts / surfaces.ts for test teardown. */
  reset: () => Promise<void>
}

async function connect(config: McpServerConfig): Promise<Client> {
  const client = new Client({ name: 'aurora-chat', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(new URL(config.url))
  await client.connect(transport)
  return client
}

export const useMcpClientStore = create<McpClientStore>((set, get) => ({
  servers: {},

  addServer: async (config: McpServerConfig) => {
    set((s) => ({
      servers: {
        ...s.servers,
        [config.name]: { config, state: 'connecting' },
      },
    }))
    try {
      const client = await connect(config)
      set((s) => ({
        servers: {
          ...s.servers,
          [config.name]: { config, state: 'connected', client },
        },
      }))
    } catch (e) {
      set((s) => ({
        servers: {
          ...s.servers,
          [config.name]: {
            config,
            state: 'error',
            error: (e as Error).message,
          },
        },
      }))
    }
  },

  removeServer: async (name: string) => {
    const entry = get().servers[name]
    if (!entry) return
    if (entry.client) {
      try {
        await entry.client.close()
      } catch {
        /* best effort */
      }
    }
    set((s) => {
      const next = { ...s.servers }
      delete next[name]
      return { servers: next }
    })
  },

  reconnect: async (name: string) => {
    const entry = get().servers[name]
    if (!entry) return
    // Close the old client if any, then flip the SAME entry to 'connecting'
    // in-place (keeps the settings UI row stable instead of vanish/reappear).
    if (entry.client) {
      try {
        await entry.client.close()
      } catch {
        /* best effort */
      }
    }
    set((s) => ({
      servers: {
        ...s.servers,
        [name]: { config: entry.config, state: 'connecting' },
      },
    }))
    try {
      const client = await connect(entry.config)
      set((s) => ({
        servers: {
          ...s.servers,
          [name]: { config: entry.config, state: 'connected', client },
        },
      }))
    } catch (e) {
      set((s) => ({
        servers: {
          ...s.servers,
          [name]: {
            config: entry.config,
            state: 'error',
            error: (e as Error).message,
          },
        },
      }))
    }
  },

  getClient: (name: string) => {
    const entry = get().servers[name]
    return entry?.state === 'connected' ? entry.client ?? null : null
  },

  reset: async () => {
    const entries = Object.values(get().servers)
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.client) {
          try {
            await entry.client.close()
          } catch {
            /* best effort */
          }
        }
      })
    )
    set({ servers: {} })
  },
}))
