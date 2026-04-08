/**
 * Theme bridge: snapshot Aurora's --color-* CSS custom properties from the
 * document root and package them as McpUi hostContext.styles.variables, so
 * bundled MCP Apps AND third-party apps can theme themselves to match
 * Aurora without any knowledge of our internal variable names.
 *
 * Spec reference: https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx
 * §"Host Context" — hostContext.styles.variables is a flat map of CSS
 * custom property name → resolved value that the host sends in the
 * ui/initialize response. The View applies them to
 * document.documentElement.
 */

const THEME_VAR_NAMES = [
  '--color-bg',
  '--color-surface',
  '--color-elevated',
  '--color-text',
  '--color-text-bright',
  '--color-muted',
  '--color-border',
  '--color-accent',
  '--color-danger',
  '--color-success',
  '--color-warning',
  '--font-sans',
  '--font-mono',
] as const

export interface HostContext {
  theme: 'light' | 'dark'
  styles: {
    variables: Record<string, string>
  }
  displayMode: 'inline'
  containerDimensions?: { width?: number; maxHeight?: number }
}

/**
 * Detect whether the current theme is dark by looking at the computed
 * background color. Cheap heuristic: if --color-bg is a "dark" value
 * (leading 0-3 hex digit, rgb(0..), rgba(0..)), treat as dark.
 *
 * This falls back to 'dark' when no background value is available,
 * which matches Aurora Chat's default theme.
 */
function detectTheme(bg: string): 'light' | 'dark' {
  const trimmed = bg.trim().toLowerCase()
  if (!trimmed) return 'dark'
  // Hex: #0-3 -> dark
  if (trimmed.startsWith('#') && /^#[0-3]/.test(trimmed)) return 'dark'
  // rgb(0..30, ...) -> dark (rough threshold)
  const rgbMatch = trimmed.match(/^rgba?\((\d+)[\s,]/)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10)
    return r < 128 ? 'dark' : 'light'
  }
  // Default to dark (Aurora's default)
  return 'dark'
}

/**
 * Snapshot the current Aurora theme as an MCP Apps HostContext.
 *
 * @param opts Optional container dimensions to advertise to the app.
 */
export function getThemeContext(opts?: {
  width?: number
  maxHeight?: number
}): HostContext {
  const styles: Record<string, string> = {}
  if (typeof window !== 'undefined') {
    const computed = getComputedStyle(document.documentElement)
    for (const name of THEME_VAR_NAMES) {
      const v = computed.getPropertyValue(name).trim()
      if (v) styles[name] = v
    }
  }
  const theme = detectTheme(styles['--color-bg'] ?? '')
  return {
    theme,
    styles: { variables: styles },
    displayMode: 'inline',
    containerDimensions: opts,
  }
}
