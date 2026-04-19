import assert from 'node:assert/strict'

import { createEmptyWorkspaceState } from '../../lane2/schema'
import { buildWorkspaceStripModel } from '../workspace-strip'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('workspace strip')

test('active workspace gets active styling without overflow when count fits', () => {
  const forge = createEmptyWorkspaceState({ workspaceId: 'forge', sessionId: 'sess-1', now: 1_700 })
  forge.resident.activeInvocationId = 'live:sess-1'
  forge.attention.primaryFocus = { kind: 'surface', id: 'surface-a' }
  forge.attention.unresolvedTargets = [{ kind: 'surface', id: 'surface-a' }]
  forge.invocations['live:sess-1'] = {
    invocationId: 'live:sess-1',
    kind: 'background',
    target: 'live-session',
    summary: 'Working in surface surface-a with the deploy diff open',
    recoveryActionLabel: 'Resume thread sess-1',
    initiatedBy: 'aurora',
    workspaceId: 'forge',
    sessionId: 'sess-1',
    surfaceId: 'surface-a',
    threadId: 'sess-1',
    contextRefs: [
      { kind: 'workspace', id: 'forge' },
      { kind: 'thread', id: 'sess-1' },
      { kind: 'surface', id: 'surface-a' },
    ],
    status: 'active',
    createdAt: 1_700,
    updatedAt: 1_700,
  }

  const archive = createEmptyWorkspaceState({ workspaceId: 'archive', now: 1_701 })
  archive.resident.stance = 'waiting'

  const model = buildWorkspaceStripModel({
    activeWorkspaceId: 'forge',
    maxVisibleCount: 4,
    workspaces: [forge, archive],
  })

  assert.equal(model.visibleTabs.length, 2)
  assert.equal(model.overflowCount, 0)
  assert.deepEqual(model.visibleTabs[0], {
    workspaceId: 'forge',
    label: 'forge',
    isActive: true,
    tone: 'active',
    hint: 'Working in surface surface-a wi…',
  })
  assert.deepEqual(model.visibleTabs[1], {
    workspaceId: 'archive',
    label: 'archive',
    isActive: false,
    tone: 'idle',
    hint: 'Waiting',
  })
})

test('ready workspaces prefer unresolved continuity labels over generic idle copy', () => {
  const research = createEmptyWorkspaceState({ workspaceId: 'research', sessionId: 'sess-9', now: 1_800 })
  research.attention.primaryFocus = { kind: 'thread', id: 'sess-9' }
  research.attention.unresolvedTargets = [
    { kind: 'thread', id: 'sess-9' },
    { kind: 'surface', id: 'surface-z' },
  ]

  const model = buildWorkspaceStripModel({
    activeWorkspaceId: 'research',
    maxVisibleCount: 4,
    workspaces: [research],
  })

  assert.equal(model.visibleTabs[0]?.tone, 'ready')
  assert.equal(model.visibleTabs[0]?.hint, '2 unresolved remembered')
})

test('overflow keeps the active workspace visible and exposes the rest through the switcher', () => {
  const workspaces = Array.from({ length: 8 }, (_, index) => {
    const workspace = createEmptyWorkspaceState({ workspaceId: `ws-${index + 1}`, now: 2_000 + index })
    if (index === 6) {
      workspace.attention.primaryFocus = { kind: 'thread', id: 'sess-focus' }
      workspace.attention.unresolvedTargets = [{ kind: 'thread', id: 'sess-focus' }]
    }
    return workspace
  })

  const model = buildWorkspaceStripModel({
    activeWorkspaceId: 'ws-8',
    maxVisibleCount: 4,
    workspaces,
  })

  assert.deepEqual(
    model.visibleTabs.map((tab) => tab.workspaceId),
    ['ws-1', 'ws-2', 'ws-3', 'ws-8']
  )
  assert.equal(model.overflowCount, 4)
  assert.deepEqual(
    model.overflowTabs.map((tab) => tab.workspaceId),
    ['ws-4', 'ws-5', 'ws-6', 'ws-7']
  )
  assert.equal(model.visibleTabs[model.visibleTabs.length - 1]?.isActive, true)
})

console.log('✓ all workspace strip tests passed')
