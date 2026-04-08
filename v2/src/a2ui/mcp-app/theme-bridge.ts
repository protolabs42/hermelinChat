/**
 * Theme bridge: snapshot Aurora's --color-* / --font-* CSS custom properties
 * from document.documentElement and package them as an MCP Apps HostContext
 * that EVERY spec-compliant MCP App will understand.
 *
 * The MCP Apps spec (2026-01-26 §"Host Context") defines a canonical enum
 * of ~75 style variable keys (McpUiStyleVariableKey) that third-party
 * MCP Apps read at ui/initialize time. Aurora's internal variable names
 * (--color-bg, --color-text, --color-accent, etc) do NOT match this enum,
 * so a naive "push Aurora vars into hostContext.styles.variables" would
 * leave third-party apps rendering with their own defaults.
 *
 * Fix: this module reads Aurora's values from the DOM, then emits TWO
 * parallel sets into hostContext.styles.variables:
 *
 *   1. The spec's canonical keys (--color-background-primary, --font-sans,
 *      --color-text-primary, etc), mapped from Aurora's values via
 *      SPEC_KEY_MAPPING. This is what third-party MCP Apps read — the
 *      compatibility path the plan's Tier 2 + Tier 3 targets rely on.
 *
 *   2. Aurora's original keys (--color-bg, --color-accent, etc) alongside
 *      the canonical ones. This is what Aurora's bundled demos read —
 *      they were written before we knew about the canonical enum and it's
 *      cheap to keep them working.
 *
 * McpUiHostContext.styles has an index signature so both sets coexist
 * without type friction. Keys not present in AURORA_VAR_NAMES are silently
 * skipped rather than errored — a theme that doesn't define --color-accent
 * just gets an empty value in both --color-accent and --color-ring-primary.
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
}): McpUiHostContext {
  // McpUiHostContext.styles.variables is typed as Record<McpUiStyleVariableKey, string | undefined>
  // but the outer object has an index signature that allows arbitrary extra keys.
  // We build a plain record first and hand it off via cast — the type system
  // gets one contract, the runtime gets both key sets.
  const variables: Record<string, string> = {}

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const computed = getComputedStyle(document.documentElement)
    for (const auroraName of AURORA_VAR_NAMES) {
      const value = computed.getPropertyValue(auroraName).trim()
      if (!value) continue
      // Emit Aurora's original key (for bundled demos)
      variables[auroraName] = value
      // Emit every canonical spec key mapped from this Aurora var
      for (const specKey of SPEC_KEY_MAPPING[auroraName]) {
        variables[specKey] = value
      }
    }
  }

  const theme = detectTheme(variables['--color-bg'] ?? '')

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
