/**
 * CSP builder smoke test — runnable via `npm run a2ui:test`.
 *
 * Spec reference: https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx
 * Default CSP from spec §"Default Content-Security-Policy".
 * resourceDomains maps to script-src, style-src, img-src, font-src, media-src per spec.
 */
import assert from 'node:assert/strict'
import { buildCsp, DEFAULT_CSP } from '../csp'

function has(csp: string, directive: string, source: string): boolean {
  // Split directive blocks on `;`, then check the source is in the block's
  // whitespace-delimited token list (not just a substring — avoids false
  // positives where one source is a substring of a malicious sibling, e.g.
  // `https://cdn.example.com` vs `https://cdn.example.com.attacker.net`).
  return csp.split(';').some((d) => {
    const tokens = d.trim().split(/\s+/)
    return tokens[0] === directive && tokens.slice(1).includes(source)
  })
}

function main() {
  // Default (deny-by-default)
  assert.match(DEFAULT_CSP, /default-src 'none'/)
  assert.match(DEFAULT_CSP, /script-src 'self' 'unsafe-inline'/)
  assert.match(DEFAULT_CSP, /style-src 'self' 'unsafe-inline'/)
  assert.match(DEFAULT_CSP, /img-src 'self' data:/)
  assert.match(DEFAULT_CSP, /media-src 'self' data:/)
  assert.match(DEFAULT_CSP, /connect-src 'none'/)

  // undefined → default
  assert.equal(buildCsp(undefined), DEFAULT_CSP)
  // empty object → default
  assert.equal(buildCsp({}), DEFAULT_CSP)

  // connectDomains widens connect-src
  const c = buildCsp({ connectDomains: ['https://api.weather.com', 'wss://realtime.service.com'] })
  assert.ok(has(c, 'connect-src', 'https://api.weather.com'))
  assert.ok(has(c, 'connect-src', 'wss://realtime.service.com'))

  // resourceDomains widens script-src + style-src + img-src + font-src + media-src per spec
  const r = buildCsp({ resourceDomains: ['https://cdn.jsdelivr.net'] })
  for (const dir of ['script-src', 'style-src', 'img-src', 'font-src', 'media-src']) {
    assert.ok(has(r, dir, 'https://cdn.jsdelivr.net'), `${dir} should include cdn.jsdelivr.net`)
  }

  // frameDomains widens frame-src
  const f = buildCsp({ frameDomains: ['https://www.youtube.com'] })
  assert.ok(has(f, 'frame-src', 'https://www.youtube.com'))

  // baseUriDomains widens base-uri
  const b = buildCsp({ baseUriDomains: ['https://app.example.com'] })
  assert.ok(has(b, 'base-uri', 'https://app.example.com'))

  // Three.js CDN compound case (Tier 3 realism)
  const three = buildCsp({
    resourceDomains: ['https://unpkg.com', 'https://cdn.jsdelivr.net'],
    connectDomains: ['https://threejs.org'],
  })
  assert.ok(has(three, 'script-src', 'https://unpkg.com'))
  assert.ok(has(three, 'script-src', 'https://cdn.jsdelivr.net'))
  assert.ok(has(three, 'connect-src', 'https://threejs.org'))

  console.log('✓ csp tests passed')
}

main()
