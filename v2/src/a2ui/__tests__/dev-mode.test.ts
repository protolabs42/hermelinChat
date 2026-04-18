import assert from 'node:assert/strict'
import { isA2UIDevMode } from '../dev-mode'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('A2UI dev mode')

test('enables preview only from the query string flag', () => {
  assert.equal(isA2UIDevMode('?a2ui-dev=1'), true)
  assert.equal(isA2UIDevMode('?foo=bar&a2ui-dev=1'), true)
})

test('does not enable preview without the query string flag', () => {
  assert.equal(isA2UIDevMode(''), false)
  assert.equal(isA2UIDevMode('?foo=bar'), false)
})
