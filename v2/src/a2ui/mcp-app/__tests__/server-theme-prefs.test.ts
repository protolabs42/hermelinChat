import assert from 'node:assert/strict'

import {
  clearMcpServerThemePreferences,
  getMcpServerThemePreference,
  loadMcpServerThemePrefs,
  setMcpServerThemePreference,
} from '../server-theme-prefs'

class MemoryStorage {
  private store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

function main() {
  const storage = new MemoryStorage()
  Object.assign(globalThis, { localStorage: storage })

  clearMcpServerThemePreferences()
  assert.deepEqual(loadMcpServerThemePrefs(), {})
  assert.equal(getMcpServerThemePreference('weather'), true)

  setMcpServerThemePreference('weather', false)
  setMcpServerThemePreference('chorus', true)

  assert.deepEqual(loadMcpServerThemePrefs(), { weather: false, chorus: true })
  assert.equal(getMcpServerThemePreference('weather'), false)
  assert.equal(getMcpServerThemePreference('chorus'), true)
  assert.equal(getMcpServerThemePreference('unknown'), true)

  storage.setItem('aurora-chat-mcp-server-theme-prefs', '{"bad":"data","weather":false}')
  assert.deepEqual(loadMcpServerThemePrefs(), { weather: false })

  clearMcpServerThemePreferences()
  assert.deepEqual(loadMcpServerThemePrefs(), {})

  console.log('✓ mcp server theme preference tests passed')
}

main()
