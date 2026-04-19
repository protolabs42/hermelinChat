import assert from 'node:assert/strict'

import {
  buildActivityLabel,
  buildChatPaneHeaderModel,
  buildCompactPathLabel,
  formatTokenBudgetLabel,
} from '../pane-header'
import type { ChatMessage } from '../../stores/chat'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('pane header')

test('buildCompactPathLabel keeps the tail of deep cwd paths readable', () => {
  assert.equal(buildCompactPathLabel('/home/inu/hermelinChat/v2/src'), '/…/v2/src')
  assert.equal(buildCompactPathLabel('/repo'), '/repo')
})

test('formatTokenBudgetLabel reports remaining headroom instead of used tokens', () => {
  assert.equal(formatTokenBudgetLabel({ used: 1200, size: 8192, costUsd: null }), '7.0k left')
  assert.equal(formatTokenBudgetLabel({ used: 9000, size: 8192, costUsd: null }), '0 left')
})

test('buildActivityLabel maps assistant activity back to Aurora copy', () => {
  const messages: ChatMessage[] = [
    { id: 'm-1', role: 'assistant', content: 'hi', timestamp: 1000 },
  ]
  const activity = buildActivityLabel(messages, 61_000)
  assert.equal(activity?.label, 'Aurora · 1m ago')
  assert.match(activity?.title ?? '', /^Aurora activity at /)
})

test('buildChatPaneHeaderModel combines cwd, git, budget, and activity in one payload', () => {
  const messages: ChatMessage[] = [
    { id: 'm-1', role: 'user', content: 'ship it', timestamp: 30_000 },
  ]
  const model = buildChatPaneHeaderModel({
    cwd: '/home/inu/hermelinChat-dark-factory/run',
    branch: 'feat/live-header',
    dirty: true,
    usage: { used: 4000, size: 32768, costUsd: 0.12 },
    messages,
    now: 150_000,
  })

  assert.equal(model.cwdLabel, '/…/hermelinChat-dark-factory/run')
  assert.equal(model.branchLabel, 'feat/live-header')
  assert.equal(model.branchDirty, true)
  assert.equal(model.tokenBudgetLabel, '29k left')
  assert.equal(model.activityLabel, 'Inu · 2m ago')
})

console.log('✓ all pane header tests passed')
