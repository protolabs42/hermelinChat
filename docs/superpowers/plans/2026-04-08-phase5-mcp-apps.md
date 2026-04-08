# Phase 5: MCP Apps Iframe Adapter — Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **v1 → v2:** Original plan scoped real-world MCP App compatibility out of Phase 5 ("escape hatch" only talks to bundled HTML). User overrode: real-world compat is the actual acceptance bar — "100% fully compatible." All three tiers (simple / backchannel / visually-rich) must run against real MCP servers in the wild before we close `hermelinChat-afp`.

**Goal:** Ship a spec-compliant MCP Apps host inside Aurora Chat such that any MCP App that runs in the ext-apps `basic-host` reference implementation also runs in Aurora Chat with zero client-side modifications. Three real-world test targets must pass: `get-time` (resource + tool result), `qr-server` (tools/call backchannel), and `threejs-server` (external CSP resources, visually rich).

**Architecture:** Aurora Chat owns its own `@modelcontextprotocol/sdk` MCP client connections (Option C-A — the "fast path" before we migrate MCP client ownership to hermes in the deferred Phase 5.1). A new `stores/mcpClients.ts` zustand connection manager holds one `Client` instance per configured server, keyed by server name. When an A2UI surface contains an `McpApp` component with `server: "qrcode-server"`, `AppHost` looks up that client and passes it to `AppBridge`. `AppBridge` then auto-proxies `resources/read` (for the `ui://` resource HTML) and `tools/call` (for the iframe's backchannel) through the paired client — **no custom routing code needed**, the SDK handles it. Aurora Chat's role is: connection management, iframe sandboxing, CSP construction, theme bridging, and wiring `AppBridge` to the right `Client`.

**Tech Stack:**
- `@modelcontextprotocol/sdk@^1.29.0` (MCP `Client` + `StreamableHTTPClientTransport`)
- `@modelcontextprotocol/ext-apps@^1.5.0` (`AppBridge` + `PostMessageTransport`)
- React 18 + zustand (existing)
- Tauri 2 (existing, for config persistence via `localStorage` or a Rust-side store)

**TDD Pragmatics:** v2/ has no test runner. Phases 1–4 used examples + `validate-examples.ts` + dev preview + live UAT. This plan follows that pattern: inline `tsx`-runnable scripts under `mcp-app/__tests__/` for pure logic (resolver, CSP, config parser), and real-world E2E validation via running the three ext-apps servers locally and verifying in dev preview. Adding vitest is explicitly out of scope.

**Spec sources:**
- Local: `docs/a2ui-and-mcp-apps-spec-notes.md` (865 lines, fetched 2026-04-07)
- Upstream spec: <https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx>
- Upstream examples: <https://github.com/modelcontextprotocol/ext-apps/tree/main/examples>
- Note: local doc simplifies the handshake method as `initialize` — upstream uses `ui/initialize`. Trust upstream. Corrigendum lands in Task 17.

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `v2/src/a2ui/mcp-app/resolver.ts` | Resolve `ui://` → HTML. Bundled path (Vite ?raw or node fs) + remote path (MCP client `resources/read`). |
| `v2/src/a2ui/mcp-app/csp.ts` | Build spec-compliant CSP from declared `_meta.ui.csp` domains. Widens `script-src`, `style-src`, `img-src`, `font-src`, `media-src` on `resourceDomains`. |
| `v2/src/a2ui/mcp-app/theme-bridge.ts` | Snapshot Aurora `--color-*` vars → `hostContext.styles.variables`. |
| `v2/src/a2ui/mcp-app/mcp-config.ts` | MCP server config: parse from `localStorage` + env var, persist on change. |
| `v2/src/a2ui/mcp-app/AppHost.tsx` | React component: iframe + AppBridge + MCP client lookup + lifecycle. |
| `v2/src/a2ui/mcp-app/bundled/counter.html` | Smoke test demo (vanilla postMessage, full ui/initialize protocol). |
| `v2/src/a2ui/mcp-app/bundled/clock.html` | Smoke test demo (theme bridge verification). |
| `v2/src/a2ui/mcp-app/bundled/tool-input-echo.html` | Smoke test demo (ui/notifications/tool-input display). |
| `v2/src/a2ui/mcp-app/__tests__/resolver.test.ts` | Pure unit test, runnable via `tsx`. |
| `v2/src/a2ui/mcp-app/__tests__/csp.test.ts` | Pure unit test, runnable via `tsx`. |
| `v2/src/a2ui/mcp-app/__tests__/mcp-config.test.ts` | Pure unit test for config parser. |
| `v2/src/stores/mcpClients.ts` | zustand store managing per-server MCP `Client` instances. |
| `v2/src/components/settings/McpServerSettings.tsx` | Settings panel section: add/remove/list MCP servers with connection status. |
| `docs/phase5-test-servers.md` | How to clone + run the three ext-apps servers for local testing. |

### Modified files

| File | Change |
|---|---|
| `v2/src/a2ui/renderer/components/EmbedComponents.tsx` | Replace placeholder `McpAppRender` with `<AppHost {...} />`. |
| `v2/src/a2ui/examples/mcp-app-embed.json` | Point at `ui://aurora-bundled/tool-input-echo.html` (swapping the fictional `threejs-viewer` URI). |
| `v2/src/a2ui/renderer/A2UIDevPreview.tsx` | Add `three-component.json` (Phase 4 carryover) + an MCP App test section. |
| `v2/src/a2ui/validate-examples.ts` | Walk `McpApp` components + verify `resourceUri` resolves (bundled check only). |
| `v2/src/components/SettingsPanel.tsx` | Mount the new `McpServerSettings` section. |
| `v2/package.json` | Add `@modelcontextprotocol/sdk` + `@modelcontextprotocol/ext-apps` + `a2ui:test` script. |
| `docs/a2ui-and-mcp-apps-spec-notes.md` | One-line corrigendum: handshake method is `ui/initialize`. |

---

## Tasks

### Task 1: Install SDKs and verify constructor shapes

**Files:** `v2/package.json`

- [ ] **Step 1: Install both packages**

```bash
cd v2 && npm install @modelcontextprotocol/sdk@^1.29.0 @modelcontextprotocol/ext-apps@^1.5.0
```

Expected: clean install.

- [ ] **Step 2: Constructor shape sanity-check**

Create `v2/src/a2ui/mcp-app/__import_check.ts`:

```typescript
// Temporary — deleted at end of Task 1.
// Verifies BOTH imports resolve AND the constructor shapes the plan uses
// actually compile. If this fails, fix the downstream tasks BEFORE starting
// them — don't discover the SDK mismatch in Task 8.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'

// Client constructor
const _client = new Client({ name: 'aurora-chat', version: '0.1.0' })
void _client

// StreamableHTTPClientTransport constructor
const _transport = new StreamableHTTPClientTransport(new URL('http://localhost:3001/mcp'))
void _transport

// AppBridge constructor — 4 args, accepts Client OR null
const _bridgeNull = new AppBridge(
  null,
  { name: 'aurora-chat', version: '0.1.0' },
  { openLinks: {}, logging: {} },
  { hostContext: { theme: 'dark', styles: { variables: {} }, displayMode: 'inline' } as any }
)
void _bridgeNull

const _bridgeReal = new AppBridge(
  _client,
  { name: 'aurora-chat', version: '0.1.0' },
  { openLinks: {}, serverTools: {}, serverResources: {}, logging: {} },
  { hostContext: { theme: 'dark', styles: { variables: {} }, displayMode: 'inline' } as any }
)
void _bridgeReal

// PostMessageTransport — plan assumes (source, target)
declare const fakeWin: Window
const _pmt = new PostMessageTransport(fakeWin, fakeWin)
void _pmt
```

Run: `cd v2 && npx tsc --noEmit`
Expected: PASS.

> **Gotcha:** Do NOT pass the filename to `tsc` (`npx tsc --noEmit src/.../__import_check.ts`) — passing a filename makes tsc ignore the project tsconfig, which means `moduleResolution: bundler` isn't applied, which means subpath exports like `@modelcontextprotocol/ext-apps/app-bridge` fail to resolve, which looks like a fake SDK mismatch. Run without the filename so tsc uses `tsconfig.json` (which `include`s `src/`).

**If the check actually fails** (after running tsc correctly), read the relevant `.d.ts` file in `node_modules/@modelcontextprotocol/` and update the plan's downstream tasks to match the actual signatures BEFORE continuing. This is the plan's single SDK compatibility gate.

- [ ] **Step 3: Delete the check, commit**

```bash
rm v2/src/a2ui/mcp-app/__import_check.ts
git add v2/package.json v2/package-lock.json
git commit -m "feat(a2ui): add @modelcontextprotocol/sdk + ext-apps SDKs for Phase 5"
```

---

### Task 2: CSP builder (spec-compliant)

**Files:** `v2/src/a2ui/mcp-app/csp.ts`, `v2/src/a2ui/mcp-app/__tests__/csp.test.ts`, `v2/package.json` (add `a2ui:test` script)

Doing CSP first — no deps, pure logic, sets up the test infra for the remaining tasks.

- [ ] **Step 1: Add test script to package.json**

```json
"scripts": {
  ...
  "a2ui:test": "tsx src/a2ui/mcp-app/__tests__/csp.test.ts && tsx src/a2ui/mcp-app/__tests__/resolver.test.ts && tsx src/a2ui/mcp-app/__tests__/mcp-config.test.ts"
}
```

- [ ] **Step 2: Write failing test**

`v2/src/a2ui/mcp-app/__tests__/csp.test.ts`:

```typescript
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
  return csp.split(';').some((d) => d.trim().startsWith(directive + ' ') && d.includes(source))
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
```

- [ ] **Step 3: Run test, confirm fail**

Run: `cd v2 && npm run a2ui:test`
Expected: `Cannot find module '../csp'`.

- [ ] **Step 4: Implement csp.ts**

```typescript
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
```

- [ ] **Step 5: Run test, confirm pass**

Run: `cd v2 && npm run a2ui:test`
Expected: `✓ csp tests passed` (resolver + mcp-config still fail — expected).

- [ ] **Step 6: Commit**

```bash
git add v2/src/a2ui/mcp-app/csp.ts v2/src/a2ui/mcp-app/__tests__/csp.test.ts v2/package.json
git commit -m "feat(a2ui): MCP App CSP builder (spec-compliant resourceDomains widening)"
```

---

### Task 3: MCP client store

**Files:** `v2/src/stores/mcpClients.ts`

The zustand store owns per-server `Client` instances. Components look up a client by server name; the store handles connect/reconnect/disconnect lifecycle.

- [ ] **Step 1: Implement the store**

```typescript
/**
 * MCP client store — manages connections to configured MCP servers.
 *
 * One Client per server, keyed by a logical name that matches the `server`
 * field in A2UI McpApp components. AppHost looks up the Client at iframe
 * mount time and hands it to AppBridge for automatic tools/call +
 * resources/read proxying.
 *
 * Phase 5 Option C-A: Aurora Chat owns these connections directly.
 * Phase 5.1 will migrate ownership to hermes and this store becomes
 * a thin view over hermes' MCP layer.
 */

import { create } from 'zustand'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface McpServerConfig {
  /** Logical name — must match the `server` field in McpApp components. */
  name: string
  /** HTTP URL of the MCP server (e.g. http://localhost:3001/mcp). */
  url: string
}

export interface McpServerEntry {
  config: McpServerConfig
  state: ConnectionState
  error?: string
  client?: Client
}

interface McpClientStore {
  servers: Record<string, McpServerEntry>
  /** Add a server and attempt to connect immediately. */
  addServer(config: McpServerConfig): Promise<void>
  /** Remove + disconnect a server. */
  removeServer(name: string): Promise<void>
  /** Force reconnect an existing server. */
  reconnect(name: string): Promise<void>
  /** Look up a connected client by server name. Returns null if not connected. */
  getClient(name: string): Client | null
}

async function connect(config: McpServerConfig): Promise<Client> {
  const client = new Client({ name: 'aurora-chat', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(new URL(config.url))
  await client.connect(transport)
  return client
}

export const useMcpClientStore = create<McpClientStore>((set, get) => ({
  servers: {},

  addServer: async (config) => {
    set((s) => ({
      servers: {
        ...s.servers,
        [config.name]: { config, state: 'connecting' },
      },
    }))
    try {
      const client = await connect(config)
      set((s) => ({
        servers: {
          ...s.servers,
          [config.name]: { config, state: 'connected', client },
        },
      }))
    } catch (e) {
      set((s) => ({
        servers: {
          ...s.servers,
          [config.name]: { config, state: 'error', error: (e as Error).message },
        },
      }))
    }
  },

  removeServer: async (name) => {
    const entry = get().servers[name]
    if (entry?.client) {
      try {
        await entry.client.close()
      } catch {
        /* best effort */
      }
    }
    set((s) => {
      const next = { ...s.servers }
      delete next[name]
      return { servers: next }
    })
  },

  reconnect: async (name) => {
    const entry = get().servers[name]
    if (!entry) return
    await get().removeServer(name)
    await get().addServer(entry.config)
  },

  getClient: (name) => {
    const entry = get().servers[name]
    return entry?.state === 'connected' ? entry.client ?? null : null
  },
}))
```

- [ ] **Step 2: Type-check**

Run: `cd v2 && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add v2/src/stores/mcpClients.ts
git commit -m "feat(a2ui): MCP client store — zustand connection manager per server"
```

---

### Task 4: MCP config parser + persistence

**Files:** `v2/src/a2ui/mcp-app/mcp-config.ts`, `v2/src/a2ui/mcp-app/__tests__/mcp-config.test.ts`

Persists the list of configured servers across sessions via `localStorage`, with env var fallback for dev convenience.

- [ ] **Step 1: Write failing test**

```typescript
/**
 * MCP config parser test.
 */
import assert from 'node:assert/strict'
import { parseMcpServers, STORAGE_KEY } from '../mcp-config'

function main() {
  // Valid JSON array
  const a = parseMcpServers('[{"name":"x","url":"http://localhost:3001/mcp"}]')
  assert.equal(a.length, 1)
  assert.equal(a[0].name, 'x')
  assert.equal(a[0].url, 'http://localhost:3001/mcp')

  // Empty array
  assert.deepEqual(parseMcpServers('[]'), [])

  // Null / empty string / undefined → []
  assert.deepEqual(parseMcpServers(null), [])
  assert.deepEqual(parseMcpServers(''), [])
  assert.deepEqual(parseMcpServers(undefined), [])

  // Malformed JSON → []
  assert.deepEqual(parseMcpServers('not json'), [])

  // Missing required field → entry skipped
  const b = parseMcpServers('[{"name":"x"},{"name":"y","url":"http://y/mcp"}]')
  assert.equal(b.length, 1)
  assert.equal(b[0].name, 'y')

  // Constant
  assert.equal(typeof STORAGE_KEY, 'string')
  assert.ok(STORAGE_KEY.length > 0)

  console.log('✓ mcp-config tests passed')
}

main()
```

- [ ] **Step 2: Run, confirm fail**

Run: `cd v2 && npm run a2ui:test`
Expected: mcp-config test fails.

- [ ] **Step 3: Implement mcp-config.ts**

```typescript
/**
 * MCP server config: parse, persist, hydrate.
 *
 * Sources in priority order:
 *   1. localStorage[STORAGE_KEY] — set by settings UI
 *   2. import.meta.env.VITE_AURORA_MCP_SERVERS — dev convenience
 *
 * Both are JSON arrays of McpServerConfig.
 */

import type { McpServerConfig } from '../../stores/mcpClients'

export const STORAGE_KEY = 'aurora.mcp-servers'

export function parseMcpServers(
  raw: string | null | undefined
): McpServerConfig[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter(
      (x): x is McpServerConfig =>
        !!x &&
        typeof x === 'object' &&
        typeof (x as McpServerConfig).name === 'string' &&
        typeof (x as McpServerConfig).url === 'string'
    )
    .map((x) => ({ name: x.name, url: x.url }))
}

export function loadConfiguredServers(): McpServerConfig[] {
  // Browser path only — this module isn't imported in node tests
  if (typeof localStorage === 'undefined') return []
  const fromStorage = parseMcpServers(localStorage.getItem(STORAGE_KEY))
  if (fromStorage.length > 0) return fromStorage
  // Fallback to env var (Vite inlines at build time)
  const fromEnv = parseMcpServers(
    (import.meta.env?.VITE_AURORA_MCP_SERVERS as string | undefined) ?? null
  )
  return fromEnv
}

export function saveConfiguredServers(servers: McpServerConfig[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers))
}
```

- [ ] **Step 4: Run test, confirm pass**

Run: `cd v2 && npm run a2ui:test`
Expected: `✓ mcp-config tests passed`.

- [ ] **Step 5: Commit**

```bash
git add v2/src/a2ui/mcp-app/mcp-config.ts v2/src/a2ui/mcp-app/__tests__/mcp-config.test.ts
git commit -m "feat(a2ui): MCP server config parser + localStorage persistence"
```

---

### Task 5: Bundled HTML demo apps (3)

**Files:** `v2/src/a2ui/mcp-app/bundled/counter.html`, `clock.html`, `tool-input-echo.html`

Smoke tests for offline development + CI. Each implements the REAL ui/initialize protocol (not a shortcut) so they stress the same code paths as external MCP Apps. Vanilla postMessage, zero dependencies — keeps the bundled set auditable.

- [ ] **Step 1: counter.html**

Full implementation in plan v1 Task 4 Step 1 — reuse that verbatim. Key: listens for `ui/notifications/tool-input` and resets count to `arguments.startAt` if provided.

- [ ] **Step 2: clock.html**

Full implementation in plan v1 Task 4 Step 2 — reuse verbatim. Renders theme swatches using `var(--color-*)` fallback chain so it works before AND after hostContext arrives.

- [ ] **Step 3: tool-input-echo.html**

Full implementation in plan v1 Task 4 Step 3 — reuse verbatim. Pretty-prints whatever `ui/notifications/tool-input` it receives.

**Patch for all three:** each demo should ALSO listen for the `ui/initialize` response and apply `hostContext.styles.variables` to `document.documentElement` so they theme correctly. Add at the end of each `<script>`:

```javascript
// Apply hostContext.styles.variables when the host responds to ui/initialize
window.addEventListener('message', (e) => {
  const m = e.data
  if (m && m.id === 1 && m.result?.hostContext?.styles?.variables) {
    const vars = m.result.hostContext.styles.variables
    for (const [k, v] of Object.entries(vars)) {
      document.documentElement.style.setProperty(k, v)
    }
  }
})
```

(The `id === 1` match assumes ui/initialize is the first request. If `nextId` starts at 1, that's true.)

- [ ] **Step 4: Commit**

```bash
git add v2/src/a2ui/mcp-app/bundled/
git commit -m "feat(a2ui): bundled MCP App smoke tests with hostContext theme apply"
```

---

### Task 6: ui:// resource resolver

**Files:** `v2/src/a2ui/mcp-app/resolver.ts`, `v2/src/a2ui/mcp-app/__tests__/resolver.test.ts`

Dual-mode resolver: bundled `ui://aurora-bundled/*` paths (Vite ?raw in browser, fs in node test), OR remote `ui://*` paths via an injected MCP client's `resources/read`.

- [ ] **Step 1: Failing test**

```typescript
import assert from 'node:assert/strict'
import { resolveUiResource, isUiUri } from '../resolver'

async function main() {
  // Bundled
  const html = await resolveUiResource('ui://aurora-bundled/counter.html')
  assert.ok(html.includes('<html'))

  // Unknown bundled name
  await assert.rejects(
    () => resolveUiResource('ui://aurora-bundled/does-not-exist.html'),
    /not found/i
  )

  // Non-aurora-bundled scheme WITHOUT a client → throws
  await assert.rejects(
    () => resolveUiResource('ui://threejs-server/scene.html'),
    /no mcp client/i
  )

  // Non-ui URI
  await assert.rejects(() => resolveUiResource('https://example.com'), /not a ui/i)

  // isUiUri sanity
  assert.equal(isUiUri('ui://a/b'), true)
  assert.equal(isUiUri('https://x'), false)

  console.log('✓ resolver tests passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement resolver**

```typescript
/**
 * Resolve a ui:// URI to HTML.
 *
 * Two paths:
 *  1. `ui://aurora-bundled/<name>` — local HTML shipped with Aurora Chat.
 *     Vite ?raw imports in browser build, fs fallback in node tests.
 *  2. `ui://<anything-else>` — fetched from an MCP client via resources/read.
 *     Caller must supply the client (paired by server name at call site).
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js'

const AURORA_BUNDLED_PREFIX = 'ui://aurora-bundled/'
const BUNDLED_CACHE = new Map<string, string>()

async function ensureBundledCache(): Promise<void> {
  if (BUNDLED_CACHE.size > 0) return

  // Browser path: Vite ?raw imports
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
    /* fall through to node path */
  }

  // Node test path: fs reads
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    for (const name of ['counter.html', 'clock.html', 'tool-input-echo.html']) {
      const path = fileURLToPath(new URL('./bundled/' + name, import.meta.url))
      BUNDLED_CACHE.set(name, await readFile(path, 'utf8'))
    }
  }
}

export function isUiUri(uri: string): boolean {
  return typeof uri === 'string' && uri.startsWith('ui://')
}

export async function resolveUiResource(uri: string, client?: Client | null): Promise<string> {
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

  // Remote path — delegate to the caller's MCP client
  if (!client) {
    throw new Error(`No MCP client available to resolve: ${uri}`)
  }
  const result = await client.readResource({ uri })
  // Find the first content item with text (HTML bundle)
  const text = result.contents.find((c: { text?: string }) => typeof c.text === 'string')?.text
  if (typeof text !== 'string') {
    throw new Error(`MCP resource ${uri} returned no text content`)
  }
  return text
}
```

- [ ] **Step 4: Run test, confirm pass**

- [ ] **Step 5: Commit**

```bash
git add v2/src/a2ui/mcp-app/resolver.ts v2/src/a2ui/mcp-app/__tests__/resolver.test.ts
git commit -m "feat(a2ui): dual-mode MCP App resolver (bundled + MCP client remote)"
```

---

### Task 7: Theme bridge

**Files:** `v2/src/a2ui/mcp-app/theme-bridge.ts`

- [ ] **Step 1: Implement** (same as plan v1 Task 5, unchanged)

See plan v1 Task 5 for full code. Snapshots `--color-*` and `--font-*` vars from `document.documentElement`, returns `HostContext` matching the MCP Apps spec shape.

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit && git add v2/src/a2ui/mcp-app/theme-bridge.ts && git commit -m "feat(a2ui): MCP App theme bridge — --color-* into hostContext"
```

---

### Task 8: AppHost React component

**Files:** `v2/src/a2ui/mcp-app/AppHost.tsx`

The meat of Phase 5. Pulls an MCP `Client` from the store by the McpApp component's `server` field, resolves the HTML (bundled or via the client), constructs the iframe with CSP meta-tag, wires `AppBridge`, and handles the full lifecycle.

- [ ] **Step 1: Implement**

```tsx
/**
 * AppHost — sandboxed iframe + MCP Apps bridge for a single McpApp component.
 *
 * Lifecycle:
 *  1. On mount: look up MCP Client for the component's `server` field from
 *     the mcpClients store. If `server === 'aurora-bundled'`, no client needed.
 *  2. Resolve resourceUri → HTML via resolveUiResource(uri, client).
 *  3. Inject CSP meta tag into <head> based on the component's csp prop (or
 *     the resource's _meta.ui.csp if we ever plumb it through — Phase 5.1).
 *  4. Render iframe with sandbox="allow-scripts" + srcDoc.
 *  5. On iframe load: instantiate AppBridge with the real Client (auto-proxies
 *     tools/call + resources/read), PostMessageTransport, and current theme as
 *     hostContext. When client is null (bundled-only), pass null to AppBridge
 *     and the bundled demo's postMessage handlers will no-op for backchannel.
 *  6. Hook bridge.oninitialized → bridge.sendToolInput(toolInput).
 *  7. Hook bridge.onsizechange → resize iframe.
 *  8. On unmount: teardownResource, clear refs.
 */

import { useEffect, useRef, useState } from 'react'
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import { resolveUiResource } from './resolver'
import { buildCsp, type DeclaredCsp } from './csp'
import { getThemeContext } from './theme-bridge'
import { useMcpClientStore } from '../../stores/mcpClients'
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

const BUNDLED_SERVER_NAME = 'aurora-bundled'

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

  const a2uiCtx = useA2UI()
  const getClient = useMcpClientStore((s) => s.getClient)

  // 1 + 2 + 3: resolve HTML and inject CSP
  useEffect(() => {
    let cancelled = false
    const client = server === BUNDLED_SERVER_NAME ? null : getClient(server)
    if (server !== BUNDLED_SERVER_NAME && !client) {
      setError(`MCP server "${server}" is not connected. Add it in Settings → MCP Servers.`)
      return
    }
    resolveUiResource(resourceUri, client)
      .then((raw) => {
        if (cancelled) return
        const cspText = buildCsp(csp)
        const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${cspText.replace(/"/g, '&quot;')}">`
        const injected = raw.replace(/<head[^>]*>/i, (m) => m + cspMeta)
        setHtml(injected)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [resourceUri, server, csp, getClient])

  // 5–7: wire AppBridge on iframe load
  const onIframeLoad = () => {
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentWindow) return

    const client = server === BUNDLED_SERVER_NAME ? null : getClient(server)

    const bridge = new AppBridge(
      client,
      { name: 'aurora-chat', version: '0.1.0' },
      client
        ? { openLinks: {}, serverTools: {}, serverResources: {}, logging: {} }
        : { openLinks: {}, logging: {} },
      { hostContext: getThemeContext({ maxHeight: height }) }
    )

    bridge.oninitialized = () => {
      if (toolInput) {
        bridge.sendToolInput({ arguments: toolInput })
      }
    }

    bridge.onsizechange = ({ height: h }: { height?: number; width?: number }) => {
      if (h && h > 0) setIframeHeight(h)
    }

    bridge.onopenlink = async ({ url }: { url: string }) => {
      if (!/^https?:\/\//.test(url)) return { isError: true }
      window.open(url, '_blank', 'noopener,noreferrer')
      return {}
    }

    bridge.onloggingmessage = ({ level, logger, data }: { level: string; logger: string; data: unknown }) => {
      // eslint-disable-next-line no-console
      console[level === 'error' ? 'error' : 'log'](`[mcp-app:${server}:${logger}]`, data)
    }

    // onmessage is for chat-bot style messages from the app. Relay to Aurora
    // via the A2UI action channel for any agent-side handling.
    bridge.onmessage = async ({ role, content }: { role: string; content: unknown }) => {
      a2uiCtx.emitAction({
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

  // 8: teardown
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
        MCP App error: {error}
        <br />
        <code style={{ color: 'var(--color-muted)' }}>{resourceUri}</code>
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
        Loading MCP App from <code>{server}</code>…
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

- [ ] **Step 2: Type-check**

Run: `cd v2 && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add v2/src/a2ui/mcp-app/AppHost.tsx
git commit -m "feat(a2ui): AppHost — iframe + AppBridge with real MCP client"
```

---

### Task 9: Wire AppHost into EmbedComponents + update example

**Files:** `v2/src/a2ui/renderer/components/EmbedComponents.tsx`, `v2/src/a2ui/examples/mcp-app-embed.json`

- [ ] **Step 1: Replace placeholder** (same as v1 Task 7)

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

- [ ] **Step 2: Update example**

Edit `v2/src/a2ui/examples/mcp-app-embed.json`: change `resourceUri` → `ui://aurora-bundled/tool-input-echo.html`, `server` → `aurora-bundled`. Update `_description` and `toolInput` accordingly.

- [ ] **Step 3: Validator + commit**

```bash
cd v2 && npm run a2ui:validate
# expected: 4 examples, 29 components, 0 errors
git add v2/src/a2ui/renderer/components/EmbedComponents.tsx v2/src/a2ui/examples/mcp-app-embed.json
git commit -m "feat(a2ui): wire AppHost into McpApp render, bundled example"
```

---

### Task 10: Extend validator with MCP App resource integrity check

**Files:** `v2/src/a2ui/validate-examples.ts`

Only checks bundled URIs (remote fetch requires a running MCP server, out of scope for a validator). Unchanged from v1 Task 9 — reuse that step verbatim.

```bash
git add v2/src/a2ui/validate-examples.ts
git commit -m "feat(a2ui): validator checks bundled McpApp URIs resolve"
```

---

### Task 11: Settings UI for MCP servers

**Files:** `v2/src/components/settings/McpServerSettings.tsx`, `v2/src/components/SettingsPanel.tsx`

Ultra-lightweight settings section. List + add form + remove button + connection status dot.

- [ ] **Step 1: Build the section component**

```tsx
/**
 * MCP Servers settings panel section.
 *
 * Manages the list of MCP servers Aurora Chat connects to directly for
 * MCP Apps resource fetching + tool calls. Persists to localStorage via
 * mcp-config. Connection state lives in mcpClients store.
 */

import { useEffect, useState } from 'react'
import { useMcpClientStore } from '../../stores/mcpClients'
import { loadConfiguredServers, saveConfiguredServers } from '../../a2ui/mcp-app/mcp-config'

const dotColor: Record<string, string> = {
  disconnected: 'var(--color-muted)',
  connecting: 'var(--color-warning)',
  connected: 'var(--color-success)',
  error: 'var(--color-danger)',
}

export default function McpServerSettings() {
  const { servers, addServer, removeServer, reconnect } = useMcpClientStore()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  // Hydrate from persisted config on first mount
  useEffect(() => {
    for (const cfg of loadConfiguredServers()) {
      if (!servers[cfg.name]) addServer(cfg)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !url) return
    await addServer({ name, url })
    saveConfiguredServers(
      [...Object.values(servers).map((s) => s.config), { name, url }].filter(
        (c, i, arr) => arr.findIndex((c2) => c2.name === c.name) === i
      )
    )
    setName('')
    setUrl('')
  }

  const handleRemove = async (n: string) => {
    await removeServer(n)
    saveConfiguredServers(
      Object.values(useMcpClientStore.getState().servers).map((s) => s.config)
    )
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-accent)',
        }}
      >
        MCP Servers
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.5 }}>
        Configure MCP Apps servers. Aurora Chat connects directly and renders{' '}
        <code>McpApp</code> components from these servers inline.
      </div>

      {Object.values(servers).length === 0 && (
        <div
          style={{
            padding: 12,
            fontSize: 12,
            color: 'var(--color-muted)',
            fontFamily: 'var(--font-mono, monospace)',
            background: 'var(--color-elevated)',
            borderRadius: 8,
            border: '1px dashed var(--color-border)',
          }}
        >
          No MCP servers configured.
        </div>
      )}

      {Object.values(servers).map((entry) => (
        <div
          key={entry.config.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            background: 'var(--color-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: dotColor[entry.state],
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ color: 'var(--color-text-bright)', fontWeight: 600 }}>
              {entry.config.name}
            </div>
            <div style={{ color: 'var(--color-muted)' }}>{entry.config.url}</div>
            {entry.error && <div style={{ color: 'var(--color-danger)' }}>{entry.error}</div>}
          </div>
          <button
            onClick={() => reconnect(entry.config.name)}
            style={{
              background: 'transparent',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            reconnect
          </button>
          <button
            onClick={() => handleRemove(entry.config.name)}
            style={{
              background: 'transparent',
              color: 'var(--color-danger)',
              border: '1px solid var(--color-danger)',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            remove
          </button>
        </div>
      ))}

      <form
        onSubmit={handleAdd}
        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <input
          type="text"
          placeholder="name (e.g. get-time-server)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            flex: '1 1 180px',
            padding: '8px 12px',
            fontSize: 12,
            fontFamily: 'var(--font-mono, monospace)',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
          }}
        />
        <input
          type="text"
          placeholder="http://localhost:3001/mcp"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{
            flex: '2 1 280px',
            padding: '8px 12px',
            fontSize: 12,
            fontFamily: 'var(--font-mono, monospace)',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
          }}
        />
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            background: 'var(--color-accent)',
            color: 'var(--color-bg)',
            border: 'none',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          add
        </button>
      </form>
    </section>
  )
}
```

- [ ] **Step 2: Mount into SettingsPanel**

Read `v2/src/components/SettingsPanel.tsx` first to find the right insertion point (near other settings sections). Add `import McpServerSettings from './settings/McpServerSettings'` and render `<McpServerSettings />` as a new section.

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add v2/src/components/settings/McpServerSettings.tsx v2/src/components/SettingsPanel.tsx
git commit -m "feat(a2ui): MCP servers settings panel section"
```

---

### Task 12: Dev preview — hydrate MCP client store + load three-component

**Files:** `v2/src/a2ui/renderer/A2UIDevPreview.tsx`

Dev preview replaces the normal app shell entirely — it never mounts `SettingsPanel`, so the `mcpClients` store would otherwise be empty when the Tier 14/15/16 tests try to render MCP App surfaces. Fix: hydrate the store from persisted config on mount, same logic as `McpServerSettings` but headless.

- [ ] **Step 1: Add three-component.json import** + push to EXAMPLES

Same as v1 Task 10 — import via `?raw`, push into `EXAMPLES` array.

- [ ] **Step 2: Hydrate MCP client store on mount**

Add near the top of the `A2UIDevPreview` component body (before the existing `useMemo` for surfaces):

```typescript
import { useMcpClientStore } from '../../stores/mcpClients'
import { loadConfiguredServers } from '../mcp-app/mcp-config'

// ... inside A2UIDevPreview:
const addServer = useMcpClientStore((s) => s.addServer)
const servers = useMcpClientStore((s) => s.servers)

useEffect(() => {
  for (const cfg of loadConfiguredServers()) {
    if (!servers[cfg.name]) {
      addServer(cfg)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

Add a small "MCP servers" status strip near the top of the dev preview (below the header), so the implementer can visually confirm which servers are connected before the tier tests render:

```tsx
{Object.values(servers).length > 0 && (
  <section style={{
    display: 'flex',
    gap: 8,
    padding: 12,
    background: 'var(--color-elevated)',
    borderRadius: 8,
    border: '1px solid var(--color-border)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 11,
    flexWrap: 'wrap',
  }}>
    <div style={{ color: 'var(--color-accent)', fontWeight: 600 }}>MCP servers:</div>
    {Object.values(servers).map((entry) => (
      <div key={entry.config.name} style={{ color: 'var(--color-text)' }}>
        <span style={{ color: entry.state === 'connected' ? 'var(--color-success)' : 'var(--color-danger)' }}>●</span>{' '}
        {entry.config.name} <span style={{ color: 'var(--color-muted)' }}>({entry.state})</span>
      </div>
    ))}
  </section>
)}
```

- [ ] **Step 3: Type-check**

Run: `cd v2 && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add v2/src/a2ui/renderer/A2UIDevPreview.tsx
git commit -m "feat(a2ui): dev preview hydrates MCP client store + shows status strip"
```

**Prerequisite for tier tests:** Before running Tier 14/15/16, the implementer must open Aurora Chat in normal (non-dev) mode ONCE, go to Settings → MCP Servers, add all three test servers (get-time-server, qr-server, threejs-server with their URLs from Task 13). These are then persisted to `localStorage` and the dev preview picks them up automatically on its next launch.

---

### Task 13: Clone ext-apps repo + build test servers

**Files:** `docs/phase5-test-servers.md` (documentation for test setup)

This is prep work — no code changes in Aurora Chat yet, just spinning up the test targets.

- [ ] **Step 1: Clone ext-apps somewhere stable**

```bash
mkdir -p ~/src && cd ~/src
git clone https://github.com/modelcontextprotocol/ext-apps.git
cd ext-apps && npm install
```

- [ ] **Step 2: Build + start `basic-host` (reference implementation)**

```bash
cd ~/src/ext-apps
npm run examples:start  # or basic-host specifically per their README
```

Open `http://localhost:8080` in a browser. Confirm the reference implementation renders.

- [ ] **Step 3: Start `get-time` (Tier 1 target)**

```bash
# In a second terminal
cd ~/src/ext-apps/examples
# If there's a get-time-server workspace, build + start it. The quickstart
# guide at docs/quickstart.md has exact commands.
# Expected: server listens on http://localhost:3001/mcp (or whatever the
# quickstart sets).
```

Verify by configuring `basic-host` to point at this server (`SERVERS='["http://localhost:3001/mcp"]' npm run start` in basic-host) and confirming `get-time` renders there.

- [ ] **Step 4: Start `qr-server` (Tier 2 target)**

```bash
cd ~/src/ext-apps
npm run --workspace examples/qr-server build
npm run --workspace examples/qr-server start
# Expected: server on different port, likely http://localhost:3002/mcp
```

Verify in basic-host.

- [ ] **Step 5: Start `threejs-server` (Tier 3 target)**

```bash
cd ~/src/ext-apps
npm run --workspace examples/threejs-server build
npm run --workspace examples/threejs-server start
# Expected: server on http://localhost:3003/mcp or similar
```

Verify in basic-host — if Three.js scene renders there, we have a known-good baseline.

- [ ] **Step 6: Document setup in docs/phase5-test-servers.md**

Short file listing: test target names, their URLs, how to start/stop each, which tier they validate. Future runs reference this instead of re-learning ext-apps layout.

- [ ] **Step 7: Commit**

```bash
git add docs/phase5-test-servers.md
git commit -m "docs(a2ui): Phase 5 test server setup (get-time, qr-server, threejs-server)"
```

---

### Task 14: Tier 1 live test — get-time

- [ ] **Step 1: Build Aurora Chat**

```bash
cd v2 && npm run build && cd .. && cargo build --manifest-path src-tauri/Cargo.toml --release
```

- [ ] **Step 2: Launch Aurora Chat and configure get-time server**

```bash
aurora-chat
```

Open Settings → MCP Servers. Add:
- name: `get-time-server`
- url: `http://localhost:3001/mcp` (whatever the quickstart uses)

Expected: status dot turns green ("connected").

- [ ] **Step 3: Create test surface via dev preview**

Alternative to asking Aurora: use the dev preview to render a hardcoded surface. Add a one-off test example `v2/src/a2ui/examples/tier1-get-time.json`:

```json
{
  "_description": "Tier 1 compatibility test: get-time MCP server from ext-apps quickstart. Should render the get-time app UI inline.",
  "messages": [
    {
      "version": "v0.9",
      "createSurface": {
        "surfaceId": "tier1_get_time",
        "catalogId": "aurora-chat://catalog/v0.1.json"
      }
    },
    {
      "version": "v0.9",
      "updateComponents": {
        "surfaceId": "tier1_get_time",
        "components": [
          { "id": "root", "component": "Card", "title": "Tier 1: get-time", "child": "body" },
          { "id": "body", "component": "Column", "gap": 16, "children": ["desc", "app"] },
          { "id": "desc", "component": "Text", "variant": "caption", "text": "MCP App from get-time-server via quickstart" },
          {
            "id": "app",
            "component": "McpApp",
            "resourceUri": "ui://get-time/mcp-app.html",
            "server": "get-time-server",
            "height": 300
          }
        ]
      }
    }
  ]
}
```

Add the import to `A2UIDevPreview.tsx` EXAMPLES array.

- [ ] **Step 4: Verify in dev preview**

```js
localStorage.setItem('a2ui-dev', '1'); location.reload()
```

Expected:
- Surface renders
- iframe loads the `get-time` HTML (fetched via MCP client)
- ui/initialize handshake completes (check F12 console for `[mcp-app:get-time-server:*]` logs)
- Tool result (the current time) renders inside the iframe
- No CSP violations
- Surface looks indistinguishable from how it renders in basic-host

- [ ] **Step 5: Commit the test surface**

```bash
git add v2/src/a2ui/examples/tier1-get-time.json v2/src/a2ui/renderer/A2UIDevPreview.tsx
git commit -m "test(a2ui): Tier 1 compat — get-time MCP App live render"
```

---

### Task 15: Tier 2 live test — qr-server with tools/call backchannel

- [ ] **Step 1: Configure qr-server in Aurora Chat settings**

- [ ] **Step 2: Create Tier 2 test surface** `v2/src/a2ui/examples/tier2-qr-server.json`

Same shape as Tier 1 but pointing at the qr-server's UI resource. `toolInput` should include the initial QR text.

- [ ] **Step 3: Dev preview render + interact**

Expected:
- QR UI renders
- Typing into the text field + clicking "Generate" fires `tools/call` → AppBridge routes it through the MCP client → qr-server returns the QR data URL → pushed back to the iframe via `ui/notifications/tool-result` → QR renders
- **This is the full bidirectional real-world test.** If backchannel works here, our compatibility is proven.

- [ ] **Step 4: If Tier 2 fails**

Debug priorities:
1. Is `AppBridge` auto-proxying? Check F12 for tools/call log lines
2. Is the Client reaching the server? Check network tab
3. Is `bridge.sendToolResult` being called? Add a log line
4. Compare behavior against basic-host rendering the same app

- [ ] **Step 5: Commit**

```bash
git add v2/src/a2ui/examples/tier2-qr-server.json v2/src/a2ui/renderer/A2UIDevPreview.tsx
git commit -m "test(a2ui): Tier 2 compat — qr-server tools/call backchannel"
```

---

### Task 16: Tier 3 live test — threejs-server (CSP for external resources)

- [ ] **Step 1: Configure threejs-server in Aurora Chat settings**

- [ ] **Step 2: Create Tier 3 test surface** `v2/src/a2ui/examples/tier3-threejs-server.json`

Include a `csp` prop on the McpApp component that declares the CDN domains Three.js needs (e.g. `https://unpkg.com`, `https://cdn.jsdelivr.net`).

- [ ] **Step 3: Dev preview**

Expected:
- Three.js CDN scripts load (CSP allows unpkg.com/cdn.jsdelivr.net)
- 3D scene renders inside the iframe
- Rotation animation runs
- Zero CSP violations in console
- Looks identical to rendering in basic-host

- [ ] **Step 4: If Tier 3 fails**

Most likely failure: CSP too strict. Check F12 for "Refused to load the script" messages. If so, the resource's `_meta.ui.csp.resourceDomains` isn't being plumbed through. Note that currently the plan reads `csp` from the McpApp component prop, not from the fetched resource's `_meta.ui.csp`. **If tests reveal this gap, add a Phase 5 sub-task:** plumb `_meta.ui.csp` from the `resources/read` response through to AppHost's CSP construction.

- [ ] **Step 5: Commit**

```bash
git add v2/src/a2ui/examples/tier3-threejs-server.json v2/src/a2ui/renderer/A2UIDevPreview.tsx
git commit -m "test(a2ui): Tier 3 compat — threejs-server CSP external resources"
```

---

### Task 17: Strip placeholder, corrigendum, docs, close

- [ ] **Step 1: Clean up placeholder-era comments** in `EmbedComponents.tsx`

- [ ] **Step 2: Corrigendum** in `docs/a2ui-and-mcp-apps-spec-notes.md`

```markdown
> **Spec note (added 2026-04-08):** This summary uses `initialize` as the
> View→Host handshake method for brevity. The actual upstream method name
> is `ui/initialize` — Aurora Chat's `AppHost` and the bundled demos use
> the upstream form. See
> <https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx>
```

- [ ] **Step 3: Final green sweep**

```bash
cd v2 && npm run a2ui:test && npm run a2ui:validate && npm run build && cd .. && cargo build --manifest-path src-tauri/Cargo.toml --release
```

- [ ] **Step 4: Commit docs**

```bash
git add v2/src/a2ui/renderer/components/EmbedComponents.tsx docs/a2ui-and-mcp-apps-spec-notes.md
git commit -m "docs(a2ui): Phase 5 cleanup — strip placeholder, ui/initialize corrigendum"
```

- [ ] **Step 5: Update chorus memory + emit signal**

Update `memory:83s91ho70mxs10dwndtj` — Phase 5 done, all three tiers passed, Phase 6 ready. Emit `sense` signal under `dev` role summarizing the compatibility wins + file Phase 5.1 (migrate MCP client ownership to hermes).

- [ ] **Step 6: File Phase 5.1 follow-up**

```bash
bd create --title="Phase 5.1: Migrate MCP client ownership from Aurora Chat to hermes" \
  --description="Phase 5 Option C-A ships Aurora Chat owning its own @modelcontextprotocol/sdk MCP client connections. This was the fast path — Phase 5.1 migrates ownership to hermes as the architecturally-correct single MCP host. Aurora Chat becomes a thin client that asks hermes for resources + tool calls via ACP. See docs/superpowers/plans/2026-04-08-phase5-mcp-apps.md for the architecture rationale." \
  --type=task --priority=2
bd update <new-id> --parent=hermelinChat-j1q
```

- [ ] **Step 7: Close Phase 5**

```bash
bd close hermelinChat-afp --reason="Phase 5 shipped Option C-A: Aurora Chat hosts MCP Apps with full spec compliance. Three real-world test targets pass live: get-time (Tier 1, resource + tool result), qr-server (Tier 2, tools/call backchannel), threejs-server (Tier 3, CSP external resources). Equivalent rendering to basic-host reference implementation confirmed. Phase 5.1 (hermes MCP client ownership migration) filed as follow-up."
```

---

## Verification checklist (paste into final commit message)

- [ ] `npm run a2ui:test` — csp + resolver + mcp-config pass
- [ ] `npm run a2ui:validate` — 7 examples, 0 errors (4 originals + three-component + 3 tier tests)
- [ ] `npm run build` — clean
- [ ] `cargo build --release` — clean
- [ ] **Tier 1 (get-time):** iframe renders, tool result displays
- [ ] **Tier 2 (qr-server):** tools/call backchannel works, QR regenerates on input change
- [ ] **Tier 3 (threejs-server):** Three.js CDN loads under declared CSP, 3D scene animates
- [ ] Zero CSP violations across all three tiers
- [ ] basic-host equivalence: same app, same behavior, no client-side changes

## Out of scope (deferred to Phase 5.1+)

- **Phase 5.1:** Migrate MCP client ownership from Aurora Chat to hermes (architectural correctness — Aurora becomes a thin client over hermes MCP)
- **Phase 5.2:** Plumb `_meta.ui.csp` from the fetched resource's metadata through to AppHost's CSP construction (currently CSP comes from the McpApp component prop only — Tier 3 might reveal this gap, file sub-task if so)
- **Phase 5.3:** Permission policy — iframe `allow` attribute from `_meta.ui.permissions` (camera/mic/geolocation)
- **Phase 5.4:** Display modes beyond `inline` (`fullscreen`, `pip`)
- **Phase 5.5:** `basic-server-*` starter templates mirrored as Aurora-bundled for zero-dependency iteration
- MCP App persistence across session reload (covered by `hermelinChat-1h2`)
- Multi-server tool name collision handling
- OAuth / authenticated MCP server connections
