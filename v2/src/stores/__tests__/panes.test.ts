import assert from 'node:assert/strict'

import {
  createHiddenPaneLayout,
  usePaneStore,
} from '../panes'
import type { WorkspacePaneLayout } from '../../lane2/schema'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

function resetPaneStore(layout: WorkspacePaneLayout = createHiddenPaneLayout()) {
  usePaneStore.setState({
    workspaceId: 'ws-1',
    layout,
  })
}

console.log('workspace-scoped pane model')

test('openPane promotes a hidden right rail into a single pane', () => {
  resetPaneStore()

  usePaneStore.getState().openPane('plan')

  assert.deepEqual(usePaneStore.getState().layout, {
    mode: 'single',
    primaryPane: 'plan',
  })
})

test('opening a second pane creates a stacked pair with the new pane focused', () => {
  resetPaneStore({
    mode: 'single',
    primaryPane: 'plan',
  })

  usePaneStore.getState().openPane('tasks')

  assert.deepEqual(usePaneStore.getState().layout, {
    mode: 'stacked',
    primaryPane: 'tasks',
    secondaryPane: 'plan',
  })
})

test('closing one pane in a stacked pair collapses back to the survivor', () => {
  resetPaneStore({
    mode: 'stacked',
    primaryPane: 'tasks',
    secondaryPane: 'plan',
  })

  usePaneStore.getState().closePane('tasks')

  assert.deepEqual(usePaneStore.getState().layout, {
    mode: 'single',
    primaryPane: 'plan',
  })
})

test('togglePane hides the rail when the active single pane is toggled again', () => {
  resetPaneStore({
    mode: 'single',
    primaryPane: 'plan',
  })

  usePaneStore.getState().togglePane('plan')

  assert.deepEqual(usePaneStore.getState().layout, {
    mode: 'hidden',
  })
})

test('togglePane promotes a secondary pane to the front when it is toggled from a stacked pair', () => {
  resetPaneStore({
    mode: 'stacked',
    primaryPane: 'tasks',
    secondaryPane: 'plan',
  })

  usePaneStore.getState().togglePane('plan')

  assert.deepEqual(usePaneStore.getState().layout, {
    mode: 'stacked',
    primaryPane: 'plan',
    secondaryPane: 'tasks',
  })
})

test('hydrating a workspace pane layout keeps the layout scoped to that workspace', () => {
  resetPaneStore()

  usePaneStore.getState().hydrateWorkspacePanes('ws-9', {
    mode: 'stacked',
    primaryPane: 'surfaces',
    secondaryPane: 'artifacts',
  })

  const state = usePaneStore.getState()
  assert.equal(state.workspaceId, 'ws-9')
  assert.deepEqual(state.snapshotWorkspacePanes(), {
    mode: 'stacked',
    primaryPane: 'surfaces',
    secondaryPane: 'artifacts',
  })
})
