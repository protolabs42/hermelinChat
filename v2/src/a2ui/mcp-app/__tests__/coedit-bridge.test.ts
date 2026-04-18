import assert from 'node:assert/strict'
import {
  deriveCoeditSurfaceInstanceId,
  parseCoeditMessageContent,
} from '../coedit-bridge'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('coedit host bridge')

test('deriveCoeditSurfaceInstanceId is stable and scoped to session/surface/component', () => {
  const id = deriveCoeditSurfaceInstanceId('sess-1', 'surface-9', 'cmp-2')
  assert.equal(id, 'sess-1:surface-9:cmp-2')
})

test('parseCoeditMessageContent extracts JSON payload from text block', () => {
  const payload = parseCoeditMessageContent([
    {
      type: 'text',
      text: JSON.stringify({
        type: 'submit_patch',
        surfaceInstanceId: 'coedit-1',
        localRevision: 2,
        patch: [{ op: 'replace', path: '/text', value: 'hello' }],
      }),
    },
  ])

  assert.equal(payload?.type, 'submit_patch')
  assert.equal(payload?.surfaceInstanceId, 'coedit-1')
  assert.equal(payload?.localRevision, 2)
})

test('parseCoeditMessageContent returns null for non-json text', () => {
  const payload = parseCoeditMessageContent([{ type: 'text', text: 'hello world' }])
  assert.equal(payload, null)
})
