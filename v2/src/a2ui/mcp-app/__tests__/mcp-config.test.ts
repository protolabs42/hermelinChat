/**
 * MCP config parser test.
 *
 * Tests the pure parseMcpServers function and the STORAGE_KEY constant.
 * Does NOT test loadConfiguredServers / saveConfiguredServers since those
 * depend on localStorage (browser-only).
 */
import assert from 'node:assert/strict'
import { parseMcpServers, STORAGE_KEY } from '../mcp-config'

function main() {
  // Valid JSON array with one entry
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

  // Non-array JSON → []
  assert.deepEqual(parseMcpServers('{"name":"x"}'), [])
  assert.deepEqual(parseMcpServers('"just a string"'), [])
  assert.deepEqual(parseMcpServers('42'), [])

  // Missing required field → entry skipped but valid siblings kept
  const b = parseMcpServers('[{"name":"x"},{"name":"y","url":"http://y/mcp"}]')
  assert.equal(b.length, 1)
  assert.equal(b[0].name, 'y')

  // Extra fields on entries are stripped (only name + url survive)
  const c = parseMcpServers('[{"name":"x","url":"http://x/mcp","extra":"ignored"}]')
  assert.equal(c.length, 1)
  assert.equal(c[0].name, 'x')
  assert.equal(c[0].url, 'http://x/mcp')
  assert.equal((c[0] as unknown as Record<string, unknown>).extra, undefined)

  // Non-object entries inside the array → skipped
  const d = parseMcpServers('[null, 42, "string", {"name":"ok","url":"http://ok/mcp"}]')
  assert.equal(d.length, 1)
  assert.equal(d[0].name, 'ok')

  // STORAGE_KEY constant sanity
  assert.equal(typeof STORAGE_KEY, 'string')
  assert.ok(STORAGE_KEY.length > 0)
  assert.ok(STORAGE_KEY.includes('mcp-servers'))

  console.log('✓ mcp-config tests passed')
}

main()
