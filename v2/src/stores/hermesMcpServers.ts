// v2/src/stores/hermesMcpServers.ts
//
// Read-only view of hermes MCP server config, backed by Tauri commands.
// Replaces mcpClients.ts — no JS SDK Client instances.

import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export type TransportType = 'stdio' | 'http'

export interface HermesMcpServer {
  name: string
  transportType: TransportType
  url?: string
  command?: string
  args?: string[]
  envKeys: string[]
  hasInlineSecrets: boolean
  enabled: boolean
  timeout?: number
  connectTimeout?: number
}

export interface McpTransportConfig {
  type: 'stdio' | 'http'
  url?: string
  command?: string
  args?: string[]
  headers?: Record<string, string>
}

interface TestResult {
  status: string
  transport: string
  tools?: unknown
  url?: string
  command_path?: string
}

interface HermesMcpServerStore {
  servers: Record<string, HermesMcpServer>
  loading: boolean
  error: string | null

  refresh: () => Promise<void>
  addServer: (
    name: string,
    transport: McpTransportConfig,
    secrets: Array<{ key: string; value: string }>,
    opts?: { enabled?: boolean; timeout?: number; connectTimeout?: number }
  ) => Promise<void>
  updateServer: (
    name: string,
    transport: McpTransportConfig,
    secrets: Array<{ key: string; value: string }>,
    opts?: { enabled?: boolean; timeout?: number; connectTimeout?: number }
  ) => Promise<void>
  removeServer: (name: string) => Promise<string[]>
  toggleServer: (name: string, enabled: boolean) => Promise<void>
  testServer: (name: string) => Promise<TestResult>
}

function buildTransportPayload(config: McpTransportConfig): Record<string, unknown> {
  if (config.type === 'http') {
    return { url: config.url!, headers: config.headers ?? {} }
  }
  return { command: config.command!, args: config.args ?? [] }
}

function buildEnvRefs(
  secrets: Array<{ key: string; value: string }>
): Record<string, string> {
  const refs: Record<string, string> = {}
  for (const { key } of secrets) {
    refs[key] = `\${${key}}`
  }
  return refs
}

export const useHermesMcpServers = create<HermesMcpServerStore>((set, get) => ({
  servers: {},
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const list = await invoke<Array<{
        name: string
        transport_type: string
        url: string | null
        command: string | null
        args: string[] | null
        env_keys: string[]
        has_inline_values: boolean
        enabled: boolean
        timeout: number | null
        connect_timeout: number | null
      }>>('list_mcp_servers')

      const servers: Record<string, HermesMcpServer> = {}
      for (const s of list) {
        servers[s.name] = {
          name: s.name,
          transportType: s.transport_type as TransportType,
          url: s.url ?? undefined,
          command: s.command ?? undefined,
          args: s.args ?? undefined,
          envKeys: s.env_keys,
          hasInlineSecrets: s.has_inline_values,
          enabled: s.enabled,
          timeout: s.timeout ?? undefined,
          connectTimeout: s.connect_timeout ?? undefined,
        }
      }
      set({ servers, loading: false })
    } catch (e) {
      set({ error: (e as Error).message ?? String(e), loading: false })
    }
  },

  addServer: async (name, transport, secrets, opts) => {
    // 1. Save secrets first (write-only from frontend)
    for (const { key, value } of secrets) {
      await invoke('save_env_var', { key, value })
    }
    // 2. Add server with ${VAR} refs
    await invoke('add_mcp_server', {
      name,
      transport: buildTransportPayload(transport),
      envRefs: buildEnvRefs(secrets),
      enabled: opts?.enabled ?? true,
      timeout: opts?.timeout ?? null,
      connectTimeout: opts?.connectTimeout ?? null,
    })
    // 3. Refresh
    await get().refresh()
  },

  updateServer: async (name, transport, secrets, opts) => {
    for (const { key, value } of secrets) {
      await invoke('save_env_var', { key, value })
    }
    await invoke('update_mcp_server', {
      name,
      transport: buildTransportPayload(transport),
      envRefs: buildEnvRefs(secrets),
      enabled: opts?.enabled ?? true,
      timeout: opts?.timeout ?? null,
      connectTimeout: opts?.connectTimeout ?? null,
    })
    await get().refresh()
  },

  removeServer: async (name) => {
    const orphaned = await invoke<string[]>('remove_mcp_server', { name })
    await get().refresh()
    return orphaned
  },

  toggleServer: async (name, enabled) => {
    await invoke('toggle_mcp_server', { name, enabled })
    await get().refresh()
  },

  testServer: async (name) => {
    return await invoke<TestResult>('test_mcp_server', { name })
  },
}))
