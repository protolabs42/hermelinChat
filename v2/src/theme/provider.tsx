import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { THEMES, DEFAULT_THEME_ID, type Theme } from './themes'

interface ThemeContextValue {
  theme: Theme
  themeId: string
  setThemeId: (id: string) => void
}

const ThemeContext = createContext<ThemeContextValue>(null!)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState(() => {
    return localStorage.getItem('hermelinchat-theme') || DEFAULT_THEME_ID
  })

  const theme = THEMES[themeId] || THEMES[DEFAULT_THEME_ID]

  const setThemeId = useCallback((id: string) => {
    if (THEMES[id]) {
      setThemeIdState(id)
      localStorage.setItem('hermelinchat-theme', id)
    }
  }, [])

  // Inject CSS custom properties on <html>
  useEffect(() => {
    const root = document.documentElement
    const c = theme.colors
    root.style.setProperty('--color-bg', c.bg)
    root.style.setProperty('--color-surface', c.surface)
    root.style.setProperty('--color-elevated', c.elevated)
    root.style.setProperty('--color-border', c.border)
    root.style.setProperty('--color-muted', c.muted)
    root.style.setProperty('--color-text', c.text)
    root.style.setProperty('--color-text-bright', c.textBright)
    root.style.setProperty('--color-accent', c.accent)
    root.style.setProperty('--color-danger', c.danger)
    root.style.setProperty('--color-success', c.success)
    root.style.setProperty('--color-info', c.info)
    root.style.setProperty('--color-purple', c.purple)
    root.style.setProperty('--color-cyan', c.cyan)
    root.style.setProperty('--color-accent-300', c.accent300)
    root.style.setProperty('--color-accent-400', c.accent400)
    root.style.setProperty('--color-accent-500', c.accent500)
    root.style.setProperty('--color-accent-600', c.accent600)
    root.style.setProperty('--color-accent-700', c.accent700)
    root.style.setProperty('--color-accent-800', c.accent800)
    root.style.setProperty('--color-accent-900', c.accent900)
    document.body.style.background = c.bg
    document.body.style.color = c.text
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, themeId, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
