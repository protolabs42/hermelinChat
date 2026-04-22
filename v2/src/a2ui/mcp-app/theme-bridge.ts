/**
 * Theme bridge: read Aurora's internal --color-* / --font-* CSS custom
 * properties from document.documentElement and emit them as an MCP Apps
 * HostContext keyed by the spec's canonical McpUiStyleVariableKey enum.
 *
 * The MCP Apps spec (2026-01-26 §"Host Context") defines a canonical ~75-key
 * enum (McpUiStyleVariableKey) like --color-background-primary, --font-sans,
 * --color-ring-primary. Third-party MCP Apps read THESE keys via CSS custom
 * property fallbacks (e.g. `var(--color-background-primary, #171717)`), so
 * they opt in to host theming on their own terms: apps that want to theme
 * use the snapshot, apps that hardcode colors ignore it, apps that draw to
 * canvas/WebGL are unaffected either way.
 *
 * This bridge ONLY emits the canonical spec keys — no Aurora-specific
 * aliases. The bundled Aurora demos (counter, clock, tool-input-echo)
 * consume the same canonical keys as any third-party MCP App, so our
 * code stays symmetric with the rest of the ecosystem.
 */

import type {
  McpUiHostContext,
  McpUiStyleVariableKey,
} from '@modelcontextprotocol/ext-apps/app-bridge'

/** Aurora's internal CSS custom properties we snapshot from the DOM. */
const AURORA_VAR_NAMES = [
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

type AuroraVarName = (typeof AURORA_VAR_NAMES)[number]

/**
 * Aurora var → MCP Apps canonical spec keys. One Aurora value may map
 * to multiple spec keys (e.g. --color-danger emits background/text/border/ring
 * variants). Omitted Aurora vars are skipped at emit time.
 *
 * Mapping choices:
 *   - --color-bg           → background-primary          (main surface)
 *   - --color-surface      → background-secondary        (card surface)
 *   - --color-elevated     → background-tertiary         (popover/tooltip)
 *   - --color-text         → text-primary                (body copy)
 *   - --color-text-bright  → text-primary + text-inverse (emphasis fallback)
 *   - --color-muted        → text-secondary + text-tertiary (dim copy)
 *   - --color-border       → border-primary + border-secondary + ring-secondary
 *   - --color-accent       → ring-primary + border-info + background-info (focus/CTA)
 *   - --color-danger       → background-danger + text-danger + border-danger + ring-danger
 *   - --color-success      → same pattern
 *   - --color-warning      → same pattern
 *   - --font-sans          → --font-sans
 *   - --font-mono          → --font-mono
 */
const SPEC_KEY_MAPPING: Record<AuroraVarName, McpUiStyleVariableKey[]> = {
  '--color-bg': ['--color-background-primary'],
  '--color-surface': ['--color-background-secondary'],
  '--color-elevated': ['--color-background-tertiary'],
  '--color-text': ['--color-text-primary'],
  '--color-text-bright': ['--color-text-inverse'],
  '--color-muted': ['--color-text-secondary', '--color-text-tertiary'],
  '--color-border': [
    '--color-border-primary',
    '--color-border-secondary',
    '--color-ring-secondary',
  ],
  '--color-accent': [
    '--color-ring-primary',
    '--color-border-info',
    '--color-background-info',
  ],
  '--color-danger': [
    '--color-background-danger',
    '--color-text-danger',
    '--color-border-danger',
    '--color-ring-danger',
  ],
  '--color-success': [
    '--color-background-success',
    '--color-text-success',
    '--color-border-success',
    '--color-ring-success',
  ],
  '--color-warning': [
    '--color-background-warning',
    '--color-text-warning',
    '--color-border-warning',
    '--color-ring-warning',
  ],
  '--font-sans': ['--font-sans'],
  '--font-mono': ['--font-mono'],
}

/**
 * Detect light vs dark theme from the computed --color-bg. Used both in
 * hostContext.theme and as a hint for color-scheme: light dark.
 * Cheap heuristic: parse the first rgb component, threshold at 128.
 * Defaults to 'dark' (Aurora's default).
 */
function detectTheme(bg: string): 'light' | 'dark' {
  const trimmed = bg.trim().toLowerCase()
  if (!trimmed) return 'dark'
  if (trimmed.startsWith('#') && /^#[0-3]/.test(trimmed)) return 'dark'
  const rgbMatch = trimmed.match(/^rgba?\((\d+)[\s,]/)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10)
    return r < 128 ? 'dark' : 'light'
  }
  return 'dark'
}

/**
 * Snapshot Aurora's current theme as an MCP Apps HostContext, ready to
 * pass to AppBridge's constructor as `{ hostContext: ... }`.
 *
 * Emits BOTH Aurora's original variable names AND the canonical spec
 * keys (via SPEC_KEY_MAPPING) into styles.variables, so both bundled
 * and third-party MCP Apps theme correctly off the same snapshot.
 *
 * Safe to call in node (returns an empty variables map) — `window`
 * and `document` are only touched behind a typeof check, and the
 * overall shape stays valid.
 */
export function getThemeContext(opts?: {
  width?: number
  maxHeight?: number
  includeStyleVariables?: boolean
}): McpUiHostContext {
  // McpUiHostContext.styles.variables is typed as Record<McpUiStyleVariableKey, string | undefined>
  // but the outer object has an index signature that allows arbitrary extra keys.
  // We build a plain record first and hand it off via cast — the type system
  // gets one contract, the runtime gets both key sets.
  const variables: Record<string, string> = {}
  const includeStyleVariables = opts?.includeStyleVariables ?? true
  let auroraBgForDetect = ''

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const computed = getComputedStyle(document.documentElement)
    for (const auroraName of AURORA_VAR_NAMES) {
      const value = computed.getPropertyValue(auroraName).trim()
      if (!value) continue
      if (includeStyleVariables) {
        for (const specKey of SPEC_KEY_MAPPING[auroraName]) {
          variables[specKey] = value
        }
      }
      if (auroraName === '--color-bg') {
        auroraBgForDetect = value
      }
    }
  }

  const theme = detectTheme(auroraBgForDetect)

  return {
    theme,
    styles: {
      variables: variables as unknown as Record<
        McpUiStyleVariableKey,
        string | undefined
      >,
    },
    displayMode: 'inline',
    containerDimensions: opts,
  } as McpUiHostContext
}
