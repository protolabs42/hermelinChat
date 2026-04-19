import assert from 'node:assert/strict'

import {
  buildSurfaceAnchorLoadingCopy,
  buildSurfacePaneEmptyState,
  resolveRightPaneLayout,
} from '../right-pane-state'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('right pane state')

test('resolveRightPaneLayout promotes legacy artifact-panel state into the artifacts pane', () => {
  assert.deepEqual(
    resolveRightPaneLayout({
      panelOpen: true,
      pinnedSurfaceId: null,
      storedLayout: { mode: 'hidden' },
    }),
    { mode: 'single', primaryPane: 'artifacts' }
  )
})

test('resolveRightPaneLayout promotes pinned surfaces into the surfaces pane before the store syncs', () => {
  assert.deepEqual(
    resolveRightPaneLayout({
      panelOpen: true,
      pinnedSurfaceId: 'surface-9',
      storedLayout: { mode: 'hidden' },
    }),
    { mode: 'single', primaryPane: 'surfaces' }
  )
})

test('buildSurfacePaneEmptyState distinguishes restoring pinned surfaces from genuinely empty rails', () => {
  assert.deepEqual(
    buildSurfacePaneEmptyState({
      liveSurfaceCount: 0,
      pinnedSurfaceId: 'mcp_app_coedit_proof',
      pinnedSurfaceTitle: 'coedit proof',
    }),
    {
      detail: 'coedit proof is pinned for this workspace. Waiting for the live surface runtime to reconnect.',
      title: 'Restoring pinned surface',
    }
  )
})

test('buildSurfaceAnchorLoadingCopy gets more specific when a pinned surface is restoring', () => {
  assert.equal(
    buildSurfaceAnchorLoadingCopy({
      isPinned: true,
      surfaceId: 'mcp_app_coedit_proof',
    }),
    'Restoring pinned surface "mcp_app_coedit_proof" for this workspace…'
  )
})

console.log('✓ all right pane state tests passed')
