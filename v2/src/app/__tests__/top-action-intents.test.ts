import assert from 'node:assert/strict'

import { getTopActionIntents } from '../top-action-intents'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('top action intents')

test('new chat and workspace actions stay visibly distinct', () => {
  const intents = getTopActionIntents()

  assert.deepEqual(intents.newChat, {
    label: '+ chat',
    shortcutLabel: 'Ctrl+N',
    title: 'Start a new chat in this workspace (Ctrl+N)',
  })
  assert.deepEqual(intents.workspace, {
    label: '+ workspace',
    title: 'Create or switch workspaces',
    overflowTitle: 'Show more workspaces',
  })
})

console.log('✓ all top action intent tests passed')
