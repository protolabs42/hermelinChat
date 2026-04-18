/**
 * Resolve a ui:// URI to HTML.
 *
 * Two paths:
 *  1. `ui://aurora-bundled/<name>` — local HTML shipped with Aurora Chat.
 *     Vite ?raw imports in browser build, fs fallback in node tests.
 *  2. `ui://<anything-else>` — fetched from an MCP client via
 *     `resources/read`. Caller must supply the client (paired by server
 *     name at call site).
 *
 * The bundled set is a closed allowlist — adding a new bundled demo
 * requires adding its filename to BUNDLED_FILENAMES below, so nothing
 * can be loaded from the aurora-bundled origin that isn't explicitly
 * shipped.
 */

const AURORA_BUNDLED_PREFIX = 'ui://aurora-bundled/'

/** Allowlist of filenames under v2/src/a2ui/mcp-app/bundled/ */
const BUNDLED_FILENAMES = [
  'counter.html',
  'clock.html',
  'tool-input-echo.html',
  'coedit-proof.html',
] as const

const BUNDLED_CACHE = new Map<string, string>()

/**
 * Populate the bundled HTML cache. Tries Vite ?raw imports first (browser
 * build), falls back to fs reads for node test mode. Same final state
 * either way.
 */
async function ensureBundledCache(): Promise<void> {
  if (BUNDLED_CACHE.size > 0) return

  // Browser path: Vite ?raw imports. In node + tsx, the ?raw suffix
  // is meaningless and these imports throw — we catch and fall through.
  try {
    const [counter, clock, echo, coeditProof] = await Promise.all([
      import('./bundled/counter.html?raw'),
      import('./bundled/clock.html?raw'),
      import('./bundled/tool-input-echo.html?raw'),
      import('./bundled/coedit-proof.html?raw'),
    ])
    BUNDLED_CACHE.set('counter.html', (counter as { default: string }).default)
    BUNDLED_CACHE.set('clock.html', (clock as { default: string }).default)
    BUNDLED_CACHE.set(
      'tool-input-echo.html',
      (echo as { default: string }).default
    )
    BUNDLED_CACHE.set(
      'coedit-proof.html',
      (coeditProof as { default: string }).default
    )
    return
  } catch {
    /* fall through to node path */
  }

  // Node test path: read files from disk via import.meta.url
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    for (const name of BUNDLED_FILENAMES) {
      const path = fileURLToPath(new URL('./bundled/' + name, import.meta.url))
      BUNDLED_CACHE.set(name, await readFile(path, 'utf8'))
    }
  }
}

export function isUiUri(uri: string): boolean {
  return typeof uri === 'string' && uri.startsWith('ui://')
}

/**
 * Resolve a ui:// URI to HTML text.
 *
 * @param uri      Either `ui://aurora-bundled/<name>` (uses the bundled
 *                 cache) or any other `ui://...` (uses the provided resolver).
 * @param resolver Optional function `(uri: string) => Promise<string>`.
 *                 Required for non-bundled URIs. Ignored for bundled URIs
 *                 (no network round-trip). Callers typically pass a closure
 *                 over `tauriReadResource(server, uri)`.
 */
export async function resolveUiResource(
  uri: string,
  resolver?: ((uri: string) => Promise<string>) | null
): Promise<string> {
  if (!isUiUri(uri)) {
    throw new Error(`Not a ui:// URI: ${uri}`)
  }

  if (uri.startsWith(AURORA_BUNDLED_PREFIX)) {
    await ensureBundledCache()
    const name = uri.slice(AURORA_BUNDLED_PREFIX.length)
    const html = BUNDLED_CACHE.get(name)
    if (!html) throw new Error(`Bundled MCP App not found: ${name}`)
    return html
  }

  // Remote path — delegate to the caller's resolver function
  if (!resolver) {
    throw new Error(`No MCP resolver available to resolve: ${uri}`)
  }
  return resolver(uri)
}
