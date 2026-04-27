import assert from 'node:assert/strict'

import { closeBridgePanel, focusBridgePanel, normalizeBridgePaneTarget, openBridgeWorkspace, workspaceIdFromBridgeName } from '../workspace-bridge'
import { createEmptyWorkspaceState, type WorkspaceState } from '../../lane2/schema'
import { usePaneStore } from '../../stores/panes'
import { useWorkspaceStore } from '../../stores/workspaces'

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

function resetStores(workspaces: WorkspaceState[] = []) {
  usePaneStore.setState({ workspaceId: 'ws-1', layout: { mode: 'hidden' } })
  useWorkspaceStore.setState({
    activeWorkspace: workspaces[0] ?? null,
    workspaces,
    hydrated: true,
    setActiveWorkspace: async (workspaceId: string) => {
      const target = useWorkspaceStore.getState().workspaces.find((workspace) => workspace.workspaceId === workspaceId) ?? null
      useWorkspaceStore.setState({ activeWorkspace: target })
    },
    upsertWorkspace: async (workspace: WorkspaceState, makeActive = true) => {
      useWorkspaceStore.setState((state) => ({
        workspaces: [...state.workspaces.filter((item) => item.workspaceId !== workspace.workspaceId), workspace],
        activeWorkspace: makeActive ? workspace : state.activeWorkspace,
      }))
      return workspace
    },
  })
}

console.log('workspace bridge store integration')

await test('workspace bridge names become stable workspace ids', () => {
  assert.equal(workspaceIdFromBridgeName('Deep Work'), 'deep-work')
  assert.equal(workspaceIdFromBridgeName(' proto.shell '), 'proto.shell')
})

await test('normalizes bridge targets to known pane ids', () => {
  assert.equal(normalizeBridgePaneTarget('artifact'), 'artifacts')
  assert.equal(normalizeBridgePaneTarget('TASKS'), 'tasks')
  assert.equal(normalizeBridgePaneTarget('unknown'), null)
})

await test('openBridgeWorkspace focuses an existing workspace by exact id', async () => {
  const alpha = createEmptyWorkspaceState({ workspaceId: 'alpha' })
  const beta = createEmptyWorkspaceState({ workspaceId: 'beta' })
  resetStores([alpha, beta])

  await openBridgeWorkspace('beta', true)

  assert.equal(useWorkspaceStore.getState().activeWorkspace?.workspaceId, 'beta')
})

await test('openBridgeWorkspace creates a missing workspace when allowed', async () => {
  resetStores([])

  await openBridgeWorkspace('Deep Work', true)

  assert.equal(useWorkspaceStore.getState().activeWorkspace?.workspaceId, 'deep-work')
  assert.equal(useWorkspaceStore.getState().workspaces.length, 1)
})

await test('focusBridgePanel opens and promotes right rail panes', () => {
  resetStores([])

  focusBridgePanel('plan')
  assert.deepEqual(usePaneStore.getState().layout, { mode: 'single', primaryPane: 'plan' })

  focusBridgePanel('tasks')
  assert.deepEqual(usePaneStore.getState().layout, {
    mode: 'stacked',
    primaryPane: 'tasks',
    secondaryPane: 'plan',
  })
})

await test('closeBridgePanel closes a targeted pane', () => {
  resetStores([])
  usePaneStore.setState({
    workspaceId: 'ws-1',
    layout: { mode: 'stacked', primaryPane: 'tasks', secondaryPane: 'plan' },
  })

  closeBridgePanel('tasks')

  assert.deepEqual(usePaneStore.getState().layout, { mode: 'single', primaryPane: 'plan' })
})
