import assert from 'node:assert/strict'
import {
  deliverCoeditBootstrap,
  deriveCoeditSurfaceInstanceId,
  parseCoeditMessageContent,
  parseCoeditPatchMarkers,
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

test('parseCoeditPatchMarkers extracts single-line patch envelopes from assistant text', () => {
  const matches = parseCoeditPatchMarkers(
    'Here is the rewrite.\n[[COEDIT_PATCH]] {"surfaceInstanceId":"sess:surface:cmp","baseRevision":2,"patch":[{"op":"replace","path":"/text","value":"hi"}],"authoredBy":"sophie"}'
  )

  assert.equal(matches.length, 1)
  assert.equal(matches[0].envelope.surfaceInstanceId, 'sess:surface:cmp')
  assert.equal(matches[0].envelope.baseRevision, 2)
  assert.equal(matches[0].envelope.authoredBy, 'sophie')
})

test('parseCoeditPatchMarkers ignores malformed or partial marker payloads', () => {
  const matches = parseCoeditPatchMarkers(
    '[[COEDIT_PATCH]] {"surfaceInstanceId":"oops"\n[[COEDIT_PATCH]] not-json'
  )
  assert.deepEqual(matches, [])
})

test('deliverCoeditBootstrap posts a tool-input notification with arguments', () => {
  const calls: Array<{ message: unknown; targetOrigin: string }> = []
  const target = {
    postMessage(message: unknown, targetOrigin: string) {
      calls.push({ message, targetOrigin })
    },
  }

  deliverCoeditBootstrap(target, {
    text: 'draft one',
    revision: 1,
    surfaceInstanceId: 'sess:surface:viewer',
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].targetOrigin, '*')
  assert.deepEqual(calls[0].message, {
    jsonrpc: '2.0',
    method: 'ui/notifications/tool-input',
    params: {
      arguments: {
        text: 'draft one',
        revision: 1,
        surfaceInstanceId: 'sess:surface:viewer',
      },
    },
  })
})
