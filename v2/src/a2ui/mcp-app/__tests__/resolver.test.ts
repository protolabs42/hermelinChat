/**
 * Resolver smoke test — runnable via `npm run a2ui:test`.
 *
 * Covers the bundled path (ui://aurora-bundled/*) and the "no client"
 * error paths. Remote MCP client resolution is NOT tested here since
 * it requires a running MCP server — that's covered by the live tier
 * tests in Tasks 14-16.
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

  // Non-aurora-bundled scheme WITHOUT a resolver → throws
  await assert.rejects(
    () => resolveUiResource('ui://threejs-server/scene.html'),
    /no mcp resolver/i
  )

  // Non-ui URI throws
  await assert.rejects(
    () => resolveUiResource('https://example.com'),
    /not a ui/i
  )

  // isUiUri sanity
  assert.equal(isUiUri('ui://aurora-bundled/counter.html'), true)
  assert.equal(isUiUri('https://example.com'), false)
  assert.equal(isUiUri(''), false)

  // All three bundled demos resolve
  for (const name of ['counter.html', 'clock.html', 'tool-input-echo.html']) {
    const h = await resolveUiResource('ui://aurora-bundled/' + name)
    assert.ok(h.includes('<html'), name + ' should contain <html>')
    assert.ok(h.includes('ui/initialize'), name + ' should send ui/initialize')
  }

  console.log('✓ resolver tests passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
