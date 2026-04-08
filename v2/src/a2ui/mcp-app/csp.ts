/**
 * CSP builder for MCP Apps iframe sandbox.
 *
 * Applies the deny-by-default baseline from the MCP Apps spec
 * (2026-01-26, §"Default Content-Security-Policy") and widens individual
 * directives based on the declared `_meta.ui.csp` domains. Hosts MUST NOT
 * allow undeclared domains — widening is the only path.
 *
 * resourceDomains maps to script-src, style-src, img-src, font-src, media-src
 * per spec, which is how the Three.js demo can load from unpkg.com.
 *
 * Single source of truth: BASELINE is the deny-by-default directive map.
 * DEFAULT_CSP is derived from it via serialize(), and buildCsp() clones it
 * as its starting point. A spec update changes BASELINE in one place and
 * both the constant and the builder stay aligned automatically.
 */

export interface DeclaredCsp {
  connectDomains?: string[]
  resourceDomains?: string[]
  frameDomains?: string[]
  baseUriDomains?: string[]
}

/**
 * Directives widened by `resourceDomains` per MCP Apps spec.
 * Named as a single constant so the widening loop and any future
 * maintenance stay in sync with the spec's resourceDomains definition.
 */
const RESOURCE_DIRECTIVES = [
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'media-src',
] as const

/**
 * Deny-by-default baseline directives. Note that `font-src` is absent —
 * it falls through `default-src 'none'` until a caller declares resources.
 * When widened via `resourceDomains`, `font-src` is seeded with the usual
 * `'self' data:` baseline to match the other resource directives.
 */
const BASELINE: Record<string, string[]> = {
  'default-src': ["'none'"],
  'script-src': ["'self'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:'],
  'media-src': ["'self'", 'data:'],
  'connect-src': ["'none'"],
}

function serialize(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([k, vs]) => `${k} ${vs.join(' ')}`)
    .join('; ')
}

function cloneBaseline(): Record<string, string[]> {
  const clone: Record<string, string[]> = {}
  for (const [k, vs] of Object.entries(BASELINE)) {
    clone[k] = [...vs]
  }
  return clone
}

export const DEFAULT_CSP = serialize(BASELINE)

export function buildCsp(declared?: DeclaredCsp): string {
  if (!declared || Object.keys(declared).length === 0) {
    return DEFAULT_CSP
  }

  const directives = cloneBaseline()

  if (declared.connectDomains?.length) {
    directives['connect-src'] = ["'self'", ...declared.connectDomains]
  }
  if (declared.resourceDomains?.length) {
    for (const dir of RESOURCE_DIRECTIVES) {
      // font-src isn't in BASELINE (falls through default-src 'none'), so seed
      // it on first widen. Every other resource directive already exists in
      // the clone and just needs the declared domains appended.
      const existing = directives[dir] ?? ["'self'", 'data:']
      directives[dir] = [...existing, ...declared.resourceDomains]
    }
  }
  if (declared.frameDomains?.length) {
    directives['frame-src'] = ["'self'", ...declared.frameDomains]
  }
  if (declared.baseUriDomains?.length) {
    directives['base-uri'] = ["'self'", ...declared.baseUriDomains]
  }

  return serialize(directives)
}
