const STORAGE_KEY = 'aurora-chat-mcp-server-theme-prefs'

export function loadMcpServerThemePrefs(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return {}
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const prefs: Record<string, boolean> = {}
    for (const [server, value] of Object.entries(parsed)) {
      if (typeof value === 'boolean') prefs[server] = value
    }
    return prefs
  } catch {
    return {}
  }
}

function saveMcpServerThemePrefs(prefs: Record<string, boolean>): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export function getMcpServerThemePreference(serverName: string): boolean {
  const prefs = loadMcpServerThemePrefs()
  return prefs[serverName] ?? true
}

export function setMcpServerThemePreference(serverName: string, sendTheme: boolean): void {
  const prefs = loadMcpServerThemePrefs()
  prefs[serverName] = sendTheme
  saveMcpServerThemePrefs(prefs)
}

export function clearMcpServerThemePreferences(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}
