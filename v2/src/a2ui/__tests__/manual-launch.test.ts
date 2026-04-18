import assert from 'node:assert/strict'
import { buildManualA2UIBatch } from '../manual-launch'

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

test('buildManualA2UIBatch wraps messages for a live session', () => {
  const batch = buildManualA2UIBatch('sess-1', [
    { version: 'v0.9', createSurface: { surfaceId: 'x', catalogId: 'aurora-chat://catalog/v0.1.json' } },
  ])
  assert.equal(batch.kind, 'a2ui-surface-batch')
  assert.equal(batch.sessionId, 'sess-1')
  assert.equal(batch.messages.length, 1)
  assert.ok(batch.seq > 0)
  assert.ok(batch.timestamp > 0)
})

test('buildManualA2UIBatch generates increasing seq values', () => {
  const a = buildManualA2UIBatch('sess-1', [])
  const b = buildManualA2UIBatch('sess-1', [])
  assert.ok(b.seq > a.seq)
})
