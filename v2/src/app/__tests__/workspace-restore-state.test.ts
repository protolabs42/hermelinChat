import assert from 'node:assert/strict'

import { buildWorkspaceRestoreState } from '../workspace-restore-state'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('workspace restore state')

test('returns restoring state when a pinned surface is remembered but not live yet', () => {
  assert.deepEqual(
    buildWorkspaceRestoreState({
      activeWorkspaceId: 'default',
      liveSurfaceIds: [],
      pinnedSurfaceId: 'mcp_app_coedit_proof',
      primaryFocus: { kind: 'surface', id: 'mcp_app_coedit_proof' },
      surfaceAnchorIds: ['mcp_app_coedit_proof'],
    }),
    {
      detail: 'Pinned surface mcp_app_coedit_proof is reconnecting for workspace default.',
      label: 'Restoring mcp_app_coedit_proof',
      reason: 'pinned-surface-reconnecting',
      surfaceId: 'mcp_app_coedit_proof',
      title: 'Restoring pinned surface',
      workspaceId: 'default',
    }
  )
})

test('returns anchor restore state when a remembered surface anchor exists but runtime is still absent', () => {
  assert.deepEqual(
    buildWorkspaceRestoreState({
      activeWorkspaceId: 'forge',
      liveSurfaceIds: [],
      pinnedSurfaceId: null,
      primaryFocus: { kind: 'thread', id: 'sess-1' },
      surfaceAnchorIds: ['surface-a'],
    }),
    {
      detail: 'Surface surface-a is still restoring into workspace forge.',
      label: 'Restoring surface-a',
      reason: 'anchored-surface-reconnecting',
      surfaceId: 'surface-a',
      title: 'Restoring remembered surface',
      workspaceId: 'forge',
    }
  )
})

test('returns null when the focused surface is already live', () => {
  assert.equal(
    buildWorkspaceRestoreState({
      activeWorkspaceId: 'forge',
      liveSurfaceIds: ['surface-a'],
      pinnedSurfaceId: 'surface-a',
      primaryFocus: { kind: 'surface', id: 'surface-a' },
      surfaceAnchorIds: ['surface-a'],
    }),
    null
  )
})

console.log('✓ all workspace restore state tests passed')
