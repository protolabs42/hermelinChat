import assert from 'node:assert/strict'
import { buildManualA2UIEmitRequest } from '../manual-launch'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('manual A2UI launcher')

test('buildManualA2UIEmitRequest wraps messages for a live session', () => {
  const request = buildManualA2UIEmitRequest('sess-1', [
    { version: 'v0.9', createSurface: { surfaceId: 'x', catalogId: 'aurora-chat://catalog/v0.1.json' } },
  ])
  assert.equal(request.sessionId, 'sess-1')
  assert.equal(request.messages.length, 1)
})

test('buildManualA2UIEmitRequest preserves message payloads without adding transport metadata', () => {
  const request = buildManualA2UIEmitRequest('sess-1', [
    { version: 'v0.9', createSurface: { surfaceId: 'mcp_app_coedit_proof', catalogId: 'aurora-chat://catalog/v0.1.json' } },
  ])
  assert.deepEqual(request.messages[0], {
    version: 'v0.9',
    createSurface: { surfaceId: 'mcp_app_coedit_proof', catalogId: 'aurora-chat://catalog/v0.1.json' },
  })
  assert.equal('seq' in request, false)
  assert.equal('timestamp' in request, false)
  assert.equal('kind' in request, false)
})
