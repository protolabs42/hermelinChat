import assert from 'node:assert/strict'

import { clampSidebarWidth } from '../sidebar'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('sidebar layout persistence')

test('clampSidebarWidth keeps widths inside workspace bounds', () => {
  assert.equal(clampSidebarWidth(120), 220)
  assert.equal(clampSidebarWidth(280), 280)
  assert.equal(clampSidebarWidth(700, 1000), 450)
})