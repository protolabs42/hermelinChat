/**
 * MCP server config: parse, persist, hydrate.
 *
 * Sources in priority order:
 *   1. localStorage[STORAGE_KEY] — written by the settings UI
 *   2. import.meta.env.VITE_AURORA_MCP_SERVERS — dev convenience
 *
 * Both are JSON arrays of McpServerConfig ({ name, url }). Any entries
 * missing a required field are silently dropped rather than throwing,
 * so a malformed config can't brick the app at startup.
 */

import type { McpServerConfig } from '../../stores/mcpClients'

export const STORAGE_KEY = 'aurora.mcp-servers'

/**
 * Parse a JSON string into a list of McpServerConfigs. Rejects malformed
 * JSON, non-array roots, and entries missing name or url. Extra fields
 * on entries are stripped — only name and url survive into the result.
 */
export function parseMcpServers(
  raw: string | null | undefined
): McpServerConfig[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const result: McpServerConfig[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    if (typeof obj.name !== 'string' || typeof obj.url !== 'string') continue
    result.push({ name: obj.name, url: obj.url })
  }
  return result
}

/**
 * Hydrate the configured server list. Checks localStorage first, then
 * falls back to the Vite-inlined env var. Returns [] in node contexts
 * where neither source is available.
 */
export function loadConfiguredServers(): McpServerConfig[] {
  if (typeof localStorage !== 'undefined') {
    const fromStorage = parseMcpServers(localStorage.getItem(STORAGE_KEY))
    if (fromStorage.length > 0) return fromStorage
  }
  // Vite inlines import.meta.env.VITE_* at build time. This check is a
  // no-op in tsx/node where import.meta.env is undefined.
  const env = (import.meta as { env?: Record<string, string | undefined> }).env
  const fromEnv = parseMcpServers(env?.VITE_AURORA_MCP_SERVERS ?? null)
  return fromEnv
}

/**
 * Persist the configured server list to localStorage. No-ops in node.
 */
export function saveConfiguredServers(servers: McpServerConfig[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers))
}
