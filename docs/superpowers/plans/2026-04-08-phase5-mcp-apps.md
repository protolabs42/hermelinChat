# Phase 5: MCP Apps Iframe Adapter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `McpApp` component with a real sandboxed iframe + postMessage JSON-RPC 2.0 bridge implementing the MCP Apps protocol (spec `2026-01-26`), so A2UI surfaces can host arbitrary HTML/JS apps as an escape hatch from the catalog.

**Architecture:** Add a new module `v2/src/a2ui/mcp-app/` containing a React `AppHost` component that resolves a `ui://` resource to HTML, builds a deny-by-default sandboxed iframe with declared CSP, and wires the official `@modelcontextprotocol/ext-apps/app-bridge` `AppBridge` (with `null` MCP client — we relay through Aurora's existing action channel). MCP App messages flow back to Aurora via the same `[[A2UI_ACTION]]` envelope used by Phase 3 `Button` actions, so Aurora's existing prompt-handling can route them. Ship 3 bundled demo apps under `v2/src/a2ui/mcp-app/bundled/` that prove the handshake + tool input + tool result + open-link paths work end-to-end.

**Tech Stack:**
- `@modelcontextprotocol/ext-apps@^1.5.0` (host-side `AppBridge` + `PostMessageTransport`)
- `@modelcontextprotocol/sdk` (transitive dep of ext-apps)
- React 18 + Vite ?raw imports for bundled HTML
- Existing zustand `chat` store for `acp_send_prompt` routing
- Existing Aurora `--color-*` theme system pushed via `hostContext.styles.variables`

**TDD Pragmatics:** v2/ has no test runner today (Phases 1–4 used `validate-examples.ts` + dev preview + manual UAT). Adding vitest is its own phase. This plan extends `validate-examples.ts` with a small "MCP App resource integrity" check and relies on dev preview + live UAT for verification, matching the project pattern. Where pure logic warrants confidence (CSP builder, resolver), we add inline test scripts runnable via `tsx`.

**Spec source of truth:**
- Local: `docs/a2ui-and-mcp-apps-spec-notes.md` (865 lines, fetched 2026-04-07)
- Upstream: <https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx>
- Note: the local doc says the handshake method is `initialize` — the actual upstream spec uses **`ui/initialize`**. Trust the upstream.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `v2/src/a2ui/mcp-app/resolver.ts` | Create | Resolve `ui://` URI → HTML string. v1 supports `ui://aurora-bundled/<name>` only |
| `v2/src/a2ui/mcp-app/csp.ts` | Create | Build a sandbox-iframe Content-Security-Policy from declared `_meta.ui.csp` domains |
| `v2/src/a2ui/mcp-app/theme-bridge.ts` | Create | Read computed `--color-*` CSS vars + package as `hostContext.styles.variables` |
| `v2/src/a2ui/mcp-app/AppHost.tsx` | Create | React component: iframe + AppBridge + lifecycle |
| `v2/src/a2ui/mcp-app/types.ts` | Create | Local types (CSPDeclared, HostContext, etc.) — keep narrow, reuse SDK types where possible |
| `v2/src/a2ui/mcp-app/__tests__/csp.test.ts` | Create | Pure unit test for `buildCsp`, runnable via `tsx` |
| `v2/src/a2ui/mcp-app/__tests__/resolver.test.ts` | Create | Pure unit test for `resolveUiResource`, runnable via `tsx` |
| `v2/src/a2ui/mcp-app/bundled/counter.html` | Create | Demo: increment button + tool input echo (smallest sane MCP App) |
| `v2/src/a2ui/mcp-app/bundled/clock.html` | Create | Demo: live clock + theme color preview (proves theme bridge works) |
| `v2/src/a2ui/mcp-app/bundled/tool-input-echo.html` | Create | Demo: pretty-prints whatever toolInput it receives (proves ui/notifications/tool-input wire) |
| `v2/src/a2ui/renderer/components/EmbedComponents.tsx` | Modify | Replace `McpAppRender` placeholder body with `<AppHost {...c} />` |
| `v2/src/a2ui/examples/mcp-app-embed.json` | Modify | Point `resourceUri` at `ui://aurora-bundled/tool-input-echo.html` so the example renders a real bundled app |
| `v2/src/a2ui/renderer/A2UIDevPreview.tsx` | Modify | Add `three-component.json` import (carry-over from Phase 4); confirm mcp-app-embed renders an iframe |
| `v2/src/a2ui/validate-examples.ts` | Modify | Extend with a `validateMcpAppResources` pass that checks every `McpApp` component's `resourceUri` resolves cleanly |
| `v2/package.json` | Modify | Add `@modelcontextprotocol/ext-apps` and `@modelcontextprotocol/sdk` deps + `a2ui:test` script |
| `docs/a2ui-and-mcp-apps-spec-notes.md` | Modify | One-line corrigendum: handshake method is `ui/initialize`, not `initialize` |

---

## Tasks

### Task 1: Add SDK dependency and verify

**Files:**
- Modify: `v2/package.json`

- [ ] **Step 1: Install both packages**

```bash
cd v2 && npm install @modelcontextprotocol/ext-apps@^1.5.0 @modelcontextprotocol/sdk
```

Expected: clean install, both packages added to `dependencies`.

- [ ] **Step 2: Sanity-check the AppBridge import + constructor signatures**

Create a temporary file `v2/src/a2ui/mcp-app/__import_check.ts`:

```typescript
// Temporary — deleted at end of Task 1.
// Verifies BOTH the import resolves AND the constructor shapes the plan
// uses in Task 6 actually compile. If this fails, fix Task 6 BEFORE Task 6.
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'

// AppBridge constructor: 4 args, null as MCP client allowed
const _bridge: AppBridge = new AppBridge(
  null,
  { name: 'aurora-chat', version: '0.1.0' },
  { openLinks: {}, logging: {} },
  { hostContext: { theme: 'dark', styles: { variables: {} }, displayMode: 'inline' } as any }
)
void _bridge

// PostMessageTransport constructor: figure out the real signature.
// The plan assumes (source, target). If the SDK uses a different shape
// (single window arg, options bag), THIS LINE WILL FAIL TYPECHECK and
// you must fix Task 6 Step 1 to match before continuing.
declare const fakeWin: Window
const _t: PostMessageTransport = new PostMessageTransport(fakeWin, fakeWin)
void _t
```

Run: `cd v2 && npx tsc --noEmit src/a2ui/mcp-app/__import_check.ts`
Expected: PASS. **If it fails on the constructor shape, read the SDK's `.d.ts` for `AppBridge` and `PostMessageTransport`, update Task 6 Step 1's component code to match, and re-run before deleting this file.**

- [ ] **Step 3: Delete the import check, commit**

```bash
rm v2/src/a2ui/mcp-app/__import_check.ts
git add v2/package.json v2/package-lock.json
git commit -m "feat(a2ui): add @modelcontextprotocol/ext-apps SDK for Phase 5"
```

---

### Task 2: ui:// resource resolver with bundled apps

**Files:**
- Create: `v2/src/a2ui/mcp-app/resolver.ts`
- Create: `v2/src/a2ui/mcp-app/__tests__/resolver.test.ts`
- Create: `v2/src/a2ui/mcp-app/bundled/counter.html` (skeleton — full content in Task 4)
- Create: `v2/src/a2ui/mcp-app/bundled/clock.html` (skeleton)
- Create: `v2/src/a2ui/mcp-app/bundled/tool-input-echo.html` (skeleton)
- Modify: `v2/package.json` (add `a2ui:test` script)

- [ ] **Step 1: Create skeleton bundled HTML files**

Three files at `v2/src/a2ui/mcp-app/bundled/`. Each is just `<!doctype html><html><body>placeholder</body></html>` for now — Task 4 fills in the real content. We need them to exist so the resolver tests have something to import.

- [ ] **Step 2: Write the failing resolver test**

`v2/src/a2ui/mcp-app/__tests__/resolver.test.ts`:

```typescript
/**
 * Resolver smoke test — runnable via `npm run a2ui:test`.
 * Uses tsx, no vitest. Asserts return values via plain assert.
 */
import assert from 'node:assert/strict'
import { resolveUiResource, isUiUri } from '../resolver'

async function main() {
  // Bundled URI resolves to non-empty HTML
  const html = await resolveUiResource('ui://aurora-bundled/counter.html')
  assert.ok(html.includes('<html'), 'counter.html should contain <html>')

  // Unknown bundled name throws
  await assert.rejects(
    () => resolveUiResource('ui://aurora-bundled/does-not-exist.html'),
    /not found/i
  )

  // Non-aurora-bundled scheme throws (Phase 5.1 work)
  await assert.rejects(
    () => resolveUiResource('ui://threejs-server/scene.html'),
    /unsupported/i
  )

  // Non-ui URI throws
  await assert.rejects(
    () => resolveUiResource('https://example.com/x.html'),
    /not a ui/i
  )

  // isUiUri sanity
  assert.equal(isUiUri('ui://aurora-bundled/counter.html'), true)
  assert.equal(isUiUri('https://example.com'), false)

  console.log('✓ resolver tests passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 3: Add the test script to package.json**

In `v2/package.json` `scripts`:

```json
"a2ui:test": "tsx src/a2ui/mcp-app/__tests__/resolver.test.ts && tsx src/a2ui/mcp-app/__tests__/csp.test.ts"
```

(`csp.test.ts` is created in Task 3 — keep both in the script from the start.)

- [ ] **Step 4: Run the test to confirm it fails**

Run: `cd v2 && npm run a2ui:test`
Expected: FAIL with `Cannot find module '../resolver'`.

- [ ] **Step 5: Implement the dual-mode resolver**

The resolver runs in TWO contexts: the production Vite browser build (which can use `?raw` imports) AND the `tsx` node test (which can't). One file, two code paths, same return value.

`v2/src/a2ui/mcp-app/resolver.ts`:

```typescript
/**
 * Resolve a ui:// URI to HTML.
 *
 * Phase 5 v1 supports only `ui://aurora-bundled/<name>` — local HTML files
 * shipped with Aurora Chat under v2/src/a2ui/mcp-app/bundled/. Future
 * iterations (Phase 5.1+) will resolve other schemes via hermes.
 *
 * Dual-mode: browser builds use Vite ?raw imports (synchronous string),
 * node test mode falls back to fs reads. Both populate the same cache.
 */

// Vite ?raw imports — at runtime the browser bundler inlines these as strings.
// In node + tsx, the ?raw suffix is stripped and these imports throw, which
// is why they're wrapped in a try/catch initialize block below.
const BUNDLED_CACHE = new Map<string, string>()

async function ensureBundledCache(): Promise<void> {
  if (BUNDLED_CACHE.size > 0) return

  // Browser path: import each ?raw module. Wrapped in try because
  // node-tsx can't resolve the ?raw suffix and will throw.
  try {
    const [counter, clock, echo] = await Promise.all([
      import('./bundled/counter.html?raw'),
      import('./bundled/clock.html?raw'),
      import('./bundled/tool-input-echo.html?raw'),
    ])
    BUNDLED_CACHE.set('counter.html', (counter as { default: string }).default)
    BUNDLED_CACHE.set('clock.html', (clock as { default: string }).default)
    BUNDLED_CACHE.set('tool-input-echo.html', (echo as { default: string }).default)
    return
  } catch {
    // Fall through to node path
  }

  // Node test path: read from disk via import.meta.url
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    for (const name of ['counter.html', 'clock.html', 'tool-input-echo.html']) {
      const path = fileURLToPath(new URL('./bundled/' + name, import.meta.url))
      BUNDLED_CACHE.set(name, await readFile(path, 'utf8'))
    }
  }
}

const AURORA_BUNDLED_PREFIX = 'ui://aurora-bundled/'

export function isUiUri(uri: string): boolean {
  return typeof uri === 'string' && uri.startsWith('ui://')
}

export async function resolveUiResource(uri: string): Promise<string> {
  if (!isUiUri(uri)) {
    throw new Error(`Not a ui:// URI: ${uri}`)
  }
  if (uri.startsWith(AURORA_BUNDLED_PREFIX)) {
    await ensureBundledCache()
    const name = uri.slice(AURORA_BUNDLED_PREFIX.length)
    const html = BUNDLED_CACHE.get(name)
    if (!html) {
      throw new Error(`Bundled MCP App not found: ${name}`)
    }
    return html
  }
  throw new Error(`Unsupported ui:// scheme (Phase 5 only resolves aurora-bundled): ${uri}`)
}
```

- [ ] **Step 6: Run the test, confirm pass**

Run: `cd v2 && npm run a2ui:test`
Expected: `✓ resolver tests passed`. csp.test.ts will fail (not yet written) — ignore that line until Task 3.

- [ ] **Step 7: Commit**

```bash
git add v2/src/a2ui/mcp-app/resolver.ts \
  v2/src/a2ui/mcp-app/__tests__/resolver.test.ts \
  v2/src/a2ui/mcp-app/bundled/ \
  v2/package.json
git commit -m "feat(a2ui): MCP App ui:// resolver with bundled apps"
```

---

### Task 3: CSP builder

**Files:**
- Create: `v2/src/a2ui/mcp-app/csp.ts`
- Create: `v2/src/a2ui/mcp-app/__tests__/csp.test.ts`

- [ ] **Step 1: Write the failing CSP test**

`v2/src/a2ui/mcp-app/__tests__/csp.test.ts`:

```typescript
/**
 * CSP builder smoke test — runnable via `npm run a2ui:test`.
 *
 * Verifies the deny-by-default baseline matches the spec and that declared
 * domains widen the policy correctly without weakening defaults.
 */
import assert from 'node:assert/strict'
import { buildCsp, DEFAULT_CSP } from '../csp'

function has(csp: string, directive: string, source: string): boolean {
  // crude: split into directive blocks and look for the source under it
  return csp.split(';').some((d) => d.trim().startsWith(directive + ' ') && d.includes(source))
}

function main() {
  // Default (deny-by-default) matches spec exactly
  const def = buildCsp(undefined)
  assert.equal(def, DEFAULT_CSP, 'undefined declared should return DEFAULT_CSP')
  assert.match(def, /default-src 'none'/)
  assert.match(def, /script-src 'self' 'unsafe-inline'/)
  assert.match(def, /connect-src 'none'/)

  // Empty object also returns default
  assert.equal(buildCsp({}), DEFAULT_CSP)

  // connectDomains widens connect-src
  const withConnect = buildCsp({ connectDomains: ['https://api.example.com'] })
  assert.ok(has(withConnect, 'connect-src', 'https://api.example.com'))

  // resourceDomains widens script-src AND img-src AND style-src AND font-src
  const withRes = buildCsp({ resourceDomains: ['https://cdn.example.com'] })
  assert.ok(has(withRes, 'script-src', 'https://cdn.example.com'))
  assert.ok(has(withRes, 'img-src', 'https://cdn.example.com'))

  // frameDomains widens frame-src
  const withFrame = buildCsp({ frameDomains: ['https://embed.example.com'] })
  assert.ok(has(withFrame, 'frame-src', 'https://embed.example.com'))

  // baseUriDomains widens base-uri
  const withBase = buildCsp({ baseUriDomains: ['https://app.example.com'] })
  assert.ok(has(withBase, 'base-uri', 'https://app.example.com'))

  console.log('✓ csp tests passed')
}

main()
```

- [ ] **Step 2: Run, confirm fail**

Run: `cd v2 && npm run a2ui:test`
Expected: csp.test.ts fails with `Cannot find module '../csp'`.

- [ ] **Step 3: Implement buildCsp**

`v2/src/a2ui/mcp-app/csp.ts`:

```typescript
/**
 * CSP builder for MCP Apps iframe sandbox.
 *
 * Applies the deny-by-default baseline from the MCP Apps spec
 * (2026-01-26, §"Default Content-Security-Policy") and widens individual
 * directives based on the declared `_meta.ui.csp` domains. Hosts MUST NOT
 * allow undeclared domains, so this is the only widening path.
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

  const { connectDomains, resourceDomains, frameDomains, baseUriDomains } = declared

  // Start from the base directives (mirror DEFAULT_CSP exactly) then widen.
  // font-src is intentionally omitted: the spec default falls through to
  // default-src 'none', and Phase 5 demos don't load custom fonts. Add
  // back when a real demo needs it.
  const directives: Record<string, string[]> = {
    'default-src': ["'none'"],
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:'],
    'media-src': ["'self'", 'data:'],
    'connect-src': ["'none'"],
  }

  if (connectDomains?.length) {
    directives['connect-src'] = ["'self'", ...connectDomains]
  }
  if (resourceDomains?.length) {
    directives['script-src'].push(...resourceDomains)
    directives['style-src'].push(...resourceDomains)
    directives['img-src'].push(...resourceDomains)
  }
  if (frameDomains?.length) {
    directives['frame-src'] = ["'self'", ...frameDomains]
  }
  if (baseUriDomains?.length) {
    directives['base-uri'] = ["'self'", ...baseUriDomains]
  }

  return Object.entries(directives)
    .map(([k, vs]) => `${k} ${vs.join(' ')}`)
    .join('; ')
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd v2 && npm run a2ui:test`
Expected: `✓ resolver tests passed` then `✓ csp tests passed`.

- [ ] **Step 5: Commit**

```bash
git add v2/src/a2ui/mcp-app/csp.ts v2/src/a2ui/mcp-app/__tests__/csp.test.ts
git commit -m "feat(a2ui): MCP App CSP builder with deny-by-default baseline"
```

---

### Task 4: Bundled demo MCP Apps

**Files:**
- Modify: `v2/src/a2ui/mcp-app/bundled/counter.html`
- Modify: `v2/src/a2ui/mcp-app/bundled/clock.html`
- Modify: `v2/src/a2ui/mcp-app/bundled/tool-input-echo.html`

Each demo uses **vanilla postMessage** (no SDK import in the iframe — keeps the bundled apps zero-dependency and easy to audit).

- [ ] **Step 1: Write counter.html**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>MCP App: Counter</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: var(--color-bg, #0a0a0a);
        --fg: var(--color-text, #e5e5e5);
        --accent: var(--color-accent, #5eead4);
      }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--fg);
        font-family: var(--font-sans, system-ui, sans-serif);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 16px;
        height: 100vh;
      }
      .count { font-size: 48px; font-weight: 600; color: var(--accent); }
      button {
        background: var(--accent);
        color: var(--bg);
        border: none;
        border-radius: 8px;
        padding: 12px 24px;
        font-size: 16px;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <div class="count" id="count">0</div>
    <button id="btn">Increment</button>
    <script>
      let nextId = 1
      let count = 0
      const countEl = document.getElementById('count')
      const btn = document.getElementById('btn')

      // 1. Send ui/initialize on load
      function initialize() {
        const id = nextId++
        window.parent.postMessage({
          jsonrpc: '2.0',
          id,
          method: 'ui/initialize',
          params: {
            appCapabilities: {},
            clientInfo: { name: 'aurora-counter-demo', version: '0.1.0' },
            protocolVersion: '2026-01-26',
          },
        }, '*')
      }

      // 2. Listen for tool-input notifications and reset count
      window.addEventListener('message', (e) => {
        const msg = e.data
        if (msg && msg.method === 'ui/notifications/tool-input') {
          const start = msg.params?.arguments?.startAt
          if (typeof start === 'number') {
            count = start
            countEl.textContent = String(count)
          }
        }
      })

      // 3. Increment locally
      btn.addEventListener('click', () => {
        count += 1
        countEl.textContent = String(count)
      })

      initialize()
    </script>
  </body>
</html>
```

- [ ] **Step 2: Write clock.html**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>MCP App: Clock</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: var(--color-bg, #0a0a0a);
        --fg: var(--color-text, #e5e5e5);
        --accent: var(--color-accent, #5eead4);
        --muted: var(--color-muted, #737373);
      }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--fg);
        font-family: var(--font-sans, system-ui, sans-serif);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 8px;
        height: 100vh;
      }
      .time {
        font-family: var(--font-mono, monospace);
        font-size: 56px;
        font-weight: 600;
        color: var(--accent);
        letter-spacing: 0.04em;
      }
      .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
      .swatches { display: flex; gap: 8px; margin-top: 16px; }
      .sw { width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--muted); }
    </style>
  </head>
  <body>
    <div class="label">Aurora theme bridge</div>
    <div class="time" id="time">--:--:--</div>
    <div class="swatches">
      <div class="sw" style="background:var(--color-bg)"></div>
      <div class="sw" style="background:var(--color-surface)"></div>
      <div class="sw" style="background:var(--color-elevated)"></div>
      <div class="sw" style="background:var(--color-accent)"></div>
      <div class="sw" style="background:var(--color-text)"></div>
    </div>
    <script>
      let nextId = 1
      window.parent.postMessage({
        jsonrpc: '2.0', id: nextId++, method: 'ui/initialize',
        params: { appCapabilities: {}, clientInfo: { name: 'aurora-clock-demo', version: '0.1.0' }, protocolVersion: '2026-01-26' },
      }, '*')
      const el = document.getElementById('time')
      const tick = () => { el.textContent = new Date().toLocaleTimeString('en-GB') }
      tick(); setInterval(tick, 1000)
    </script>
  </body>
</html>
```

- [ ] **Step 3: Write tool-input-echo.html**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>MCP App: Tool Input Echo</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: var(--color-bg, #0a0a0a);
        --fg: var(--color-text, #e5e5e5);
        --accent: var(--color-accent, #5eead4);
      }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--fg);
        font-family: var(--font-mono, monospace);
        font-size: 12px;
        padding: 24px;
      }
      h1 { margin: 0 0 16px 0; color: var(--accent); font-size: 16px; font-weight: 600; }
      pre { background: var(--color-elevated, #1a1a1a); padding: 16px; border-radius: 8px; overflow: auto; }
    </style>
  </head>
  <body>
    <h1>tool-input echo</h1>
    <pre id="out">(awaiting ui/notifications/tool-input)</pre>
    <script>
      let nextId = 1
      window.parent.postMessage({
        jsonrpc: '2.0', id: nextId++, method: 'ui/initialize',
        params: { appCapabilities: {}, clientInfo: { name: 'aurora-echo-demo', version: '0.1.0' }, protocolVersion: '2026-01-26' },
      }, '*')
      window.addEventListener('message', (e) => {
        const m = e.data
        if (m && m.method === 'ui/notifications/tool-input') {
          document.getElementById('out').textContent = JSON.stringify(m.params, null, 2)
        }
      })
    </script>
  </body>
</html>
```

- [ ] **Step 4: Re-run resolver test to confirm files load**

Run: `cd v2 && npm run a2ui:test`
Expected: still passes — the resolver test only checks the file is non-empty `<html>`.

- [ ] **Step 5: Commit**

```bash
git add v2/src/a2ui/mcp-app/bundled/
git commit -m "feat(a2ui): bundled MCP App demos (counter, clock, tool-input echo)"
```

---

### Task 5: Theme bridge — push Aurora theme into iframe hostContext

**Files:**
- Create: `v2/src/a2ui/mcp-app/theme-bridge.ts`

- [ ] **Step 1: Implement getThemeContext**

```typescript
/**
 * Theme bridge: snapshot Aurora's --color-* CSS custom properties from the
 * document root and package them as McpUi hostContext.styles.variables, so
 * bundled MCP Apps can theme themselves to match Aurora.
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

export function getThemeContext(opts?: { width?: number; maxHeight?: number }): HostContext {
  const styles: Record<string, string> = {}
  if (typeof window !== 'undefined') {
    const computed = getComputedStyle(document.documentElement)
    for (const name of THEME_VAR_NAMES) {
      const v = computed.getPropertyValue(name).trim()
      if (v) styles[name] = v
    }
  }
  // Crude theme detection: check the bg lightness. Cheap and good enough.
  const bg = styles['--color-bg'] ?? ''
  const isDark = /^#?[0-3]/.test(bg.replace(/^#/, '')) || bg.includes('rgb(0') || bg === ''
  return {
    theme: isDark ? 'dark' : 'light',
    styles: { variables: styles },
    displayMode: 'inline',
    containerDimensions: opts,
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd v2 && npx tsc --noEmit`
Expected: PASS (the new file is wired into nothing yet, but should type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add v2/src/a2ui/mcp-app/theme-bridge.ts
git commit -m "feat(a2ui): MCP App theme bridge — snapshot --color-* into hostContext"
```

---

### Task 6: AppHost React component

**Files:**
- Create: `v2/src/a2ui/mcp-app/AppHost.tsx`

- [ ] **Step 1: Implement AppHost**

```tsx
/**
 * AppHost — sandboxed iframe + MCP Apps bridge for a single McpApp component.
 *
 * Lifecycle:
 *  1. On mount: resolve resourceUri → HTML string via the resolver.
 *  2. Inject HTML into a sandboxed iframe via srcDoc + Content-Security-Policy
 *     meta tag (sandbox attr is the strong wall, CSP is defense-in-depth).
 *  3. Once the iframe loads, instantiate AppBridge with a null MCP client and
 *     a PostMessageTransport pointing at the iframe's contentWindow.
 *  4. Hook bridge.oninitialized → bridge.sendToolInput(toolInput).
 *  5. Hook bridge.onsizechange → resize the iframe.
 *  6. Hook bridge.onmessage / onopenlink / onloggingmessage → relay through
 *     A2UI action channel as a structured 'mcp-app-message' action.
 *  7. On unmount: bridge.teardownResource and remove iframe.
 */

import { useEffect, useRef, useState } from 'react'
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import { resolveUiResource } from './resolver'
import { buildCsp, type DeclaredCsp } from './csp'
import { getThemeContext } from './theme-bridge'
import { useA2UI } from '../renderer/context'

interface AppHostProps {
  componentId: string
  surfaceId: string
  resourceUri: string
  server: string
  height?: number
  toolInput?: Record<string, unknown>
  csp?: DeclaredCsp
}

export default function AppHost({
  componentId,
  surfaceId,
  resourceUri,
  server,
  height = 500,
  toolInput,
  csp,
}: AppHostProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const bridgeRef = useRef<AppBridge | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [iframeHeight, setIframeHeight] = useState<number>(height)

  const ctx = useA2UI()

  // 1. Resolve the ui:// resource → HTML
  useEffect(() => {
    let cancelled = false
    resolveUiResource(resourceUri)
      .then((raw) => {
        if (cancelled) return
        // Inject the CSP meta tag into <head> so the iframe enforces it
        // even though srcDoc has no Content-Security-Policy header.
        const cspText = buildCsp(csp)
        const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${cspText.replace(/"/g, '&quot;')}">`
        const injected = raw.replace(/<head[^>]*>/i, (m) => m + cspMeta)
        setHtml(injected)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [resourceUri, csp])

  // 2. Wire AppBridge once the iframe finishes loading
  const onIframeLoad = () => {
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentWindow) return

    const bridge = new AppBridge(
      null, // no MCP client — Aurora relays via action channel
      { name: 'aurora-chat', version: '0.1.0' },
      {
        openLinks: {},
        logging: {},
      },
      { hostContext: getThemeContext({ maxHeight: height }) }
    )

    bridge.oninitialized = () => {
      if (toolInput) {
        bridge.sendToolInput({ arguments: toolInput })
      }
    }

    bridge.onsizechange = ({ height: h }) => {
      if (h && h > 0) setIframeHeight(h)
    }

    bridge.onopenlink = async ({ url }: { url: string }) => {
      // Defense in depth: only allow http/https
      if (!/^https?:\/\//.test(url)) return { isError: true }
      window.open(url, '_blank', 'noopener,noreferrer')
      return {}
    }

    bridge.onloggingmessage = ({ level, logger, data }: { level: string; logger: string; data: unknown }) => {
      // eslint-disable-next-line no-console
      console[level === 'error' ? 'error' : 'log'](`[mcp-app:${logger}]`, data)
    }

    bridge.onmessage = async ({ role, content }: { role: string; content: unknown }) => {
      // Route the app's chat-bot-style message back through Aurora's
      // existing action channel as a structured 'mcp-app-message' action.
      ctx.emitAction({
        action: {
          name: 'mcpAppMessage',
          surfaceId,
          sourceComponentId: componentId,
          timestamp: new Date().toISOString(),
          context: { server, resourceUri, role, content },
        },
      })
      return {}
    }

    const transport = new PostMessageTransport(iframe.contentWindow, iframe.contentWindow)
    bridge.connect(transport).catch((e: Error) => {
      // eslint-disable-next-line no-console
      console.error('[mcp-app] bridge.connect failed:', e)
    })
    bridgeRef.current = bridge
  }

  // 3. Tear down on unmount
  useEffect(() => {
    return () => {
      const bridge = bridgeRef.current
      if (bridge) {
        bridge.teardownResource({}).catch(() => {})
        bridgeRef.current = null
      }
    }
  }, [])

  if (error) {
    return (
      <div
        style={{
          padding: 16,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 12,
          color: 'var(--color-danger)',
          background: 'var(--color-elevated)',
          border: '1px dashed var(--color-danger)',
          borderRadius: 8,
        }}
      >
        Failed to load MCP App resource <code>{resourceUri}</code>: {error}
      </div>
    )
  }

  if (!html) {
    return (
      <div
        style={{
          padding: 16,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 12,
          color: 'var(--color-muted)',
          background: 'var(--color-elevated)',
          border: '1px dashed var(--color-border)',
          borderRadius: 8,
        }}
      >
        Loading MCP App…
      </div>
    )
  }

  return (
    <iframe
      ref={iframeRef}
      title={`mcp-app-${componentId}`}
      srcDoc={html}
      onLoad={onIframeLoad}
      sandbox="allow-scripts"
      style={{
        width: '100%',
        height: iframeHeight,
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        background: 'var(--color-bg)',
      }}
    />
  )
}
```

- [ ] **Step 2: Type-check the new file**

Run: `cd v2 && npx tsc --noEmit`
Expected: PASS. The hook is named `useA2UI` (verified at `v2/src/a2ui/renderer/context.tsx:97`); the relative import from `mcp-app/AppHost.tsx` is `'../renderer/context'`.

- [ ] **Step 3: Commit**

```bash
git add v2/src/a2ui/mcp-app/AppHost.tsx
git commit -m "feat(a2ui): MCP App host iframe + AppBridge wiring"
```

---

### Task 7: Wire AppHost into the EmbedComponents registry

**Files:**
- Modify: `v2/src/a2ui/renderer/components/EmbedComponents.tsx`

- [ ] **Step 1: Replace the placeholder McpAppRender body**

The current `McpAppRender` is a static placeholder div. Replace its body with `<AppHost ... />` that forwards every prop, plus `componentId` from `c.id` and `surfaceId` from `surface.surfaceId`. Keep the placeholder code commented out for one commit so the diff is reviewable, then strip in Task 11.

```typescript
import AppHost from '../../mcp-app/AppHost'

const McpAppRender = ({ component, surface }: RenderProps) => {
  const c = component as McpAppComponent
  return (
    <AppHost
      componentId={c.id}
      surfaceId={surface.surfaceId}
      resourceUri={c.resourceUri}
      server={c.server}
      height={c.height}
      toolInput={c.toolInput}
    />
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd v2 && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add v2/src/a2ui/renderer/components/EmbedComponents.tsx
git commit -m "feat(a2ui): replace McpApp placeholder with real AppHost"
```

---

### Task 8: Update the mcp-app-embed example to use a bundled URI

**Files:**
- Modify: `v2/src/a2ui/examples/mcp-app-embed.json`

- [ ] **Step 1: Swap resourceUri**

Change line 39 from `"ui://threejs-viewer/scene.html"` to `"ui://aurora-bundled/tool-input-echo.html"` and `server` from `"threejs-server"` to `"aurora-bundled"`. Update `toolInput` to a value that the echo demo will display nicely:

```json
"toolInput": {
  "modelUrl": "https://example.com/models/engine.glb",
  "renderer": "preview",
  "demo": true
}
```

Also update the `_description` to reflect that this is now using a bundled echo demo.

- [ ] **Step 2: Run the validator**

Run: `cd v2 && npm run a2ui:validate`
Expected: 4 examples, 29 components, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add v2/src/a2ui/examples/mcp-app-embed.json
git commit -m "feat(a2ui): point mcp-app-embed example at bundled echo demo"
```

---

### Task 9: Extend validate-examples.ts with MCP App resource integrity check

**Files:**
- Modify: `v2/src/a2ui/validate-examples.ts`

- [ ] **Step 1: Add MCP App URI verification pass**

After the existing component validation loop, walk every example's components and for each `McpApp`, call `resolveUiResource` (the node-mode path) to confirm the URI loads. Fail the script if any returns an error.

> **Note on top-level await:** `validate-examples.ts` runs under `tsx` against the v2/ tsconfig (`module: ESNext`, `target: ES2020+`), which supports top-level await. The new for-loop sits at module top-level alongside the existing sync loop — fine. If it errors with `Top-level await not supported`, wrap the new block in `async function checkMcpApps() { ... }; await checkMcpApps()` (also valid at module top level).

```typescript
import { resolveUiResource } from './mcp-app/resolver'

// ... after the existing for-loop, before the summary log ...

let mcpErrors = 0
for (const file of files) {
  const path = join(EXAMPLES_DIR, file)
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as ExampleFile
  const mcpApps: Array<{ id: string; resourceUri: string }> = []
  for (const msg of parsed.messages) {
    if (isUpdateComponentsMessage(msg)) {
      for (const comp of msg.updateComponents.components) {
        if ((comp as { component?: string }).component === 'McpApp') {
          mcpApps.push(comp as never)
        }
      }
    }
  }
  for (const m of mcpApps) {
    try {
      await resolveUiResource(m.resourceUri)
    } catch (e) {
      console.error(`❌ ${file}: McpApp ${m.id} resourceUri ${m.resourceUri} — ${(e as Error).message}`)
      mcpErrors++
    }
  }
}

if (mcpErrors > 0) {
  totalErrors += mcpErrors
  console.error(`\n${mcpErrors} MCP App resource error(s)`)
}
```

- [ ] **Step 2: Run validator**

Run: `cd v2 && npm run a2ui:validate`
Expected: all 4 examples valid, no MCP App resource errors.

- [ ] **Step 3: Commit**

```bash
git add v2/src/a2ui/validate-examples.ts
git commit -m "feat(a2ui): validator checks MCP App ui:// resources resolve"
```

---

### Task 10: Update dev preview to load three-component.json + verify mcp-app-embed renders

**Files:**
- Modify: `v2/src/a2ui/renderer/A2UIDevPreview.tsx`

- [ ] **Step 1: Add three-component import**

Add the `?raw` import + push into the `EXAMPLES` array. This is carry-over from Phase 4 — `three-component.json` was added in commit `602a16d` but never wired into the dev preview.

```typescript
import threeComponentRaw from '../examples/three-component.json?raw'

const EXAMPLES: Example[] = [
  parse(contactFormRaw, 'contact-form.json'),
  parse(interactiveChartRaw, 'interactive-chart.json'),
  parse(mcpAppEmbedRaw, 'mcp-app-embed.json'),
  parse(threeComponentRaw, 'three-component.json'),
]
```

- [ ] **Step 2: Type-check**

Run: `cd v2 && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add v2/src/a2ui/renderer/A2UIDevPreview.tsx
git commit -m "feat(a2ui): dev preview loads three-component example"
```

---

### Task 11: Build, run, manual UAT

**Files:** none (build artifacts only)

- [ ] **Step 1: Run unit + validator + build**

```bash
cd v2 && npm run a2ui:test && npm run a2ui:validate && npm run build
```

Expected:
- `✓ resolver tests passed`
- `✓ csp tests passed`
- `Validating 4 example surface(s)... 0 error(s)`
- `vite build` produces a clean `dist/`

- [ ] **Step 2: Cargo build**

```bash
cargo build --manifest-path src-tauri/Cargo.toml --release
```

Expected: clean release binary at `target/release/aurora-chat`. (Rust unchanged for Phase 5 — sanity build only.)

- [ ] **Step 3: Launch dev preview, visually inspect**

```bash
aurora-chat
```

Then in F12 devtools console:

```js
localStorage.setItem('a2ui-dev', '1'); location.reload()
```

Expected: 4 example surfaces stacked. mcp-app-embed shows a real iframe (not the placeholder div) rendering the tool-input-echo demo. The echo `<pre>` displays the toolInput JSON. Check console for `[mcp-app:*]` log lines and zero CSP violations.

- [ ] **Step 4: Live UAT — ask Aurora to render**

Exit dev preview. In a real chat session:

> Create an A2UI surface that contains a heading text "MCP App live test" and an MCP App component with `resourceUri: "ui://aurora-bundled/clock.html"`, `server: "aurora-bundled"`, `height: 240`. Wrap them in a Card with a Column.

Expected: Aurora calls `create_surface`, the iframe renders the clock demo with theme-aware swatches, the time updates every second.

- [ ] **Step 5: Commit any binary updates if needed**

```bash
git status   # only target/ changes — do NOT commit those
```

If there are no source changes, skip the commit.

---

### Task 12: Strip placeholder code, update docs, close beads

**Files:**
- Modify: `v2/src/a2ui/renderer/components/EmbedComponents.tsx` (remove header comment about placeholder, update file-level docstring)
- Modify: `docs/a2ui-and-mcp-apps-spec-notes.md` (one-line corrigendum)

- [ ] **Step 1: Update EmbedComponents docstring**

Replace the file-level comment about "Phase 5 placeholder" with the new reality: McpApp is now real, lives in `mcp-app/AppHost.tsx`, EmbedComponents just dispatches.

- [ ] **Step 2: Add corrigendum to spec notes**

Insert near the MCP Apps "Methods" subsection:

```markdown
> **Spec note (added 2026-04-08):** This summary uses `initialize` for the
> View→Host handshake for brevity. The actual upstream method name is
> `ui/initialize` (see <https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx>).
> Aurora Chat's `AppHost` uses the upstream form.
```

- [ ] **Step 3: Final build sanity**

```bash
cd v2 && npm run a2ui:test && npm run a2ui:validate && npm run build && cd .. && cargo build --manifest-path src-tauri/Cargo.toml --release
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add v2/src/a2ui/renderer/components/EmbedComponents.tsx docs/a2ui-and-mcp-apps-spec-notes.md
git commit -m "docs(a2ui): Phase 5 — strip placeholder, add ui/initialize corrigendum"
```

- [ ] **Step 5: Update chorus memory + emit signal**

Update `memory:83s91ho70mxs10dwndtj` so a fresh session knows Phase 5 is done. Emit a `sense` signal under `dev` role summarizing the bidirectional MCP Apps loop.

- [ ] **Step 6: Close beads issue**

```bash
bd close hermelinChat-afp --reason="Phase 5 shipped: MCP Apps iframe adapter live with sandboxed iframe + ui/initialize handshake + AppBridge wiring + bundled demo apps + CSP builder + theme bridge. mcp-app-embed.json renders the bundled tool-input-echo demo. hermelinChat-z1n (Phase 6) now ready."
```

---

## Verification checklist (paste into final commit message)

- [ ] All 4 examples validate (`npm run a2ui:validate`)
- [ ] Resolver + CSP unit tests pass (`npm run a2ui:test`)
- [ ] `vite build` clean
- [ ] `cargo build --release` clean
- [ ] Dev preview shows real iframe for mcp-app-embed
- [ ] Console: zero CSP violations, `[mcp-app]` logs visible
- [ ] Live UAT: Aurora can render `ui://aurora-bundled/clock.html`
- [ ] tool-input-echo displays the toolInput JSON in the iframe
- [ ] No placeholder text remains in EmbedComponents.tsx

## Out of scope (deferred to Phase 5.1+)

- Real `ui://`-from-MCP-server resource fetching (currently only `ui://aurora-bundled/*`)
- Tools/call backchannel routing to real MCP servers (currently relayed as `mcpAppMessage` action through hermes)
- Three.js / large bundled demos (counter + clock + echo are sufficient for v1)
- vitest / proper test runner setup (currently inline `tsx` scripts)
- @modelcontextprotocol/ext-apps SDK update path / version pinning
- Display modes beyond `inline` (`fullscreen`, `pip`)
- Permission policy (camera/mic/geolocation) — placeholder only
- Persistence of MCP App state across session reload (covered by `hermelinChat-1h2`)
