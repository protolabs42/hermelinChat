import assert from 'node:assert/strict'

import { isWorkspaceSwitcherShortcut } from '../keyboard-shortcuts'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('keyboard shortcuts')

test('workspace switcher shortcut matches ctrl/cmd+shift+o only', () => {
  assert.equal(isWorkspaceSwitcherShortcut({ ctrlKey: true, metaKey: false, shiftKey: true, key: 'O' }), true)
  assert.equal(isWorkspaceSwitcherShortcut({ ctrlKey: false, metaKey: true, shiftKey: true, key: 'o' }), true)
  assert.equal(isWorkspaceSwitcherShortcut({ ctrlKey: true, metaKey: false, shiftKey: false, key: 'O' }), false)
  assert.equal(isWorkspaceSwitcherShortcut({ ctrlKey: true, metaKey: false, shiftKey: true, key: 'P' }), false)
})

console.log('✓ all keyboard shortcut tests passed')
