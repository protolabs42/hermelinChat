import assert from 'node:assert/strict'
import {
  applyHostPatch,
  createCoeditStore,
  recordLocalPatch,
  type CoeditSurfaceInstance,
  type PatchOp,
} from '../coedit'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

function instance(overrides: Partial<CoeditSurfaceInstance> = {}): CoeditSurfaceInstance {
  return {
    surfaceInstanceId: 'coedit-1',
    sessionId: 'sess-1',
    surfaceId: 'surface-1',
    server: 'aurora-bundled',
    resourceUri: 'ui://aurora-bundled/coedit-proof.html',
    state: { text: 'draft one' },
    revision: 1,
    updatedAt: 1,
    selection: null,
    pendingOutboundPatch: null,
    presence: {},
    ...overrides,
  }
}

console.log('coedit store')

test('createCoeditStore registers instances', () => {
  const store = createCoeditStore()
  store.registerInstance(instance())
  assert.equal(store.get('coedit-1')?.revision, 1)
})

test('recordLocalPatch applies patch, increments revision, and remembers outbound patch', () => {
  const current = instance()
  const patch: PatchOp[] = [{ op: 'replace', path: '/text', value: 'draft two' }]
  const next = recordLocalPatch(current, patch, { start: 0, end: 5 })

  assert.equal(next.revision, 2)
  assert.deepEqual(next.state, { text: 'draft two' })
  assert.deepEqual(next.selection, { start: 0, end: 5 })
  assert.deepEqual(next.pendingOutboundPatch?.patch, patch)
  assert.equal(next.pendingOutboundPatch?.baseRevision, 1)
})

test('applyHostPatch rejects stale base revision', () => {
  const current = instance({ revision: 3 })
  const patch: PatchOp[] = [{ op: 'replace', path: '/text', value: 'stale' }]

  assert.throws(
    () => applyHostPatch(current, 2, patch, 'sophie'),
    /revision conflict/
  )
})

test('applyHostPatch updates state in place when base revision matches', () => {
  const current = instance({ revision: 3, state: { text: 'draft three' } })
  const patch: PatchOp[] = [{ op: 'replace', path: '/text', value: 'sophie rewrite' }]
  const next = applyHostPatch(current, 3, patch, 'sophie')

  assert.equal(next.revision, 4)
  assert.deepEqual(next.state, { text: 'sophie rewrite' })
  assert.equal(next.pendingOutboundPatch, null)
  assert.equal(next.presence.sophie, 'patched')
})
