# Phase 5 — Local MCP test servers

Three ext-apps MCP servers used to validate Aurora Chat's MCP Apps host against real-world targets during Phase 5 Tier 1/2/3 compatibility testing.

**Repo clone:** `/home/inu/src/ext-apps` (cloned shallow from `github.com/modelcontextprotocol/ext-apps`)

## Run targets

| Tier | Example | Port | Runtime | Start cmd |
|---|---|---|---|---|
| 1 | `examples/quickstart` | 3001 | node (tsx) | `cd examples/quickstart && PORT=3001 npx tsx main.ts` |
| 2 | `examples/qr-server` | 3002 | python (uv) | `cd examples/qr-server && PORT=3002 uv run server.py` |
| 3 | `examples/threejs-server` | 3003 | node (bun) | `cd examples/threejs-server && PORT=3003 bun main.ts` |

Reference implementation: `examples/basic-host` — the upstream host SDK's own iframe shell, used as a known-good baseline to compare Aurora Chat's behavior against. Launch via `cd examples/basic-host && npm start`.

## Build first

The quickstart and threejs-server need their `dist/` built before they can serve the UI resource. Run ONCE after cloning (or after pulling updates):

```bash
cd /home/inu/src/ext-apps
npm install                                          # workspace install, ~2 min
npm run --workspace examples/quickstart build
npm run --workspace examples/threejs-server build
# qr-server is Python, no build step
```

## Aurora Chat settings entries

In Aurora Chat, Settings → MCP Servers → add one entry per tier (names MUST match the tier example JSON files under `v2/src/a2ui/examples/tier{1,2,3}-*.json`):

| name | url |
|---|---|
| `quickstart` | `http://localhost:3001/mcp` |
| `qr-server` | `http://localhost:3002/mcp` |
| `threejs-server` | `http://localhost:3003/mcp` |

After adding, each server dot should turn green (connected). If red, reconnect.

## What each tier actually verifies

**Tier 1 (get-time):** The simplest possible MCP App — tool returns current time, UI displays it. Exercises:
- MCP client connection via `StreamableHTTPClientTransport`
- `resources/read` fetching `ui://get-time/mcp-app.html`
- CSP meta tag injection into the iframe
- `ui/initialize` handshake
- `hostContext.styles.variables` theme snapshot applied by the view
- `ui/notifications/tool-input` push (if toolInput prop is set)
- Teardown on unmount

Pass criteria: iframe loads, ui/initialize completes (look for `[mcp-app:quickstart:*]` console logs), no CSP violations, theme colors look right.

**Tier 2 (qr-server):** Bidirectional tools/call backchannel. The view has form inputs + a generate button. Clicking it fires `tools/call` through AppBridge → MCP client → qr-server's `generate_qr` tool → result back to the iframe via `ui/notifications/tool-result`. Exercises:
- Everything in Tier 1
- `tools/call` backchannel routing through AppBridge
- `ui/notifications/tool-result` push back into the iframe
- Async round-trip timing

Pass criteria: typing text + clicking generate regenerates the QR code without reloading the iframe. If this works, the full bidirectional MCP Apps protocol is proven spec-compliant.

**Tier 3 (threejs-server):** Real-world 3D rendering with external resources. The view loads Three.js (potentially from a CDN depending on the bundled build) and renders a 3D scene. Exercises:
- Everything in Tier 1 + 2
- CSP `resourceDomains` widening for external script/style sources
- Large (>1MB) HTML resource fetching
- Heavy WebGL rendering inside the sandbox
- Sandbox attribute compatibility (`allow-scripts` only)

Pass criteria: 3D scene renders, no CSP violations in console, theme bridge applies to any non-WebGL UI chrome (Three.js scene colors are WebGL and don't read CSS custom properties).

## Comparing against `basic-host`

For each tier, the acceptance bar is "same app, same behavior in Aurora Chat as in basic-host." Run `basic-host` alongside Aurora Chat with the same server URLs and visually confirm equivalent rendering. Any divergence is a Phase 5 bug.

## Troubleshooting

- **Red server dot:** confirm the server process is running, check the URL (no typos), try `reconnect` button
- **iframe shows "MCP App error: MCP server 'X' is not connected":** server name in the test JSON doesn't match the settings entry, OR the server isn't connected yet
- **CSP violation in console for Tier 3:** the server's `_meta.ui.csp` declared domains aren't being plumbed through to AppHost's CSP construction. Filed as Phase 5.2 (hermelinChat-xbb area). Workaround: pass a `csp` prop on the McpApp component explicitly in the tier3 JSON.
- **Theme not applying:** check that the canonical MCP Apps spec keys (`--color-background-primary`, etc) are reaching the iframe via ui/initialize response. The theme bridge emits these from theme-bridge.ts SPEC_KEY_MAPPING.
