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
 */

export interface DeclaredCsp {
  connectDomains?: string[]
  resourceDomains?: string[]
  frameDomains?: string[]
  baseUriDomains?: string[]
}

export const DEFAULT_CSP =
  "default-src 'none'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "media-src 'self' data:; " +
  "connect-src 'none'"

export function buildCsp(declared?: DeclaredCsp): string {
  if (!declared || Object.keys(declared).length === 0) {
    return DEFAULT_CSP
  }

  const directives: Record<string, string[]> = {
    'default-src': ["'none'"],
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:'],
    'media-src': ["'self'", 'data:'],
    'connect-src': ["'none'"],
  }

  if (declared.connectDomains?.length) {
    directives['connect-src'] = ["'self'", ...declared.connectDomains]
  }
  if (declared.resourceDomains?.length) {
    // Spec: resourceDomains maps to script-src, style-src, img-src, font-src, media-src
    directives['script-src'].push(...declared.resourceDomains)
    directives['style-src'].push(...declared.resourceDomains)
    directives['img-src'].push(...declared.resourceDomains)
    directives['font-src'] = ["'self'", 'data:', ...declared.resourceDomains]
    directives['media-src'].push(...declared.resourceDomains)
  }
  if (declared.frameDomains?.length) {
    directives['frame-src'] = ["'self'", ...declared.frameDomains]
  }
  if (declared.baseUriDomains?.length) {
    directives['base-uri'] = ["'self'", ...declared.baseUriDomains]
  }

  return Object.entries(directives)
    .map(([k, vs]) => `${k} ${vs.join(' ')}`)
    .join('; ')
}
