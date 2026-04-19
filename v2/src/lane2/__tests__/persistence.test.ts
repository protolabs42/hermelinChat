import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkspaceSnapshot,
  DEFAULT_WORKSPACE_ID,
  extractProjectIdFromWorkspace,
} from '../persistence'
import { createEmptyWorkspaceState } from '../schema'

test('buildWorkspaceSnapshot seeds resident continuity from live state', () => {
  const existing = createEmptyWorkspaceState({ workspaceId: DEFAULT_WORKSPACE_ID, sessionId: 'sess-old' })
  const next = buildWorkspaceSnapshot({
    existing,
    orderedSurfaceIds: ['surface-a', 'surface-b'],
    projectId: 'proj-1',
    sessionId: 'sess-1',
    now: 123,
  })

  assert.equal(next.workspaceId, DEFAULT_WORKSPACE_ID)
  assert.equal(next.resident.sessionId, 'sess-1')
  assert.deepEqual(next.resident.activeSurfaceIds, ['surface-a', 'surface-b'])
  assert.deepEqual(next.resident.heldContextIds, ['project:proj-1'])
  assert.equal(next.continuity.activeThreadId, 'sess-1')
  assert.equal(next.continuity.lastActiveSurfaceId, 'surface-b')
  assert.deepEqual(next.continuity.localAnchorIds, ['surface-a', 'surface-b'])
  assert.equal(next.surfaces['surface-a']?.workspaceId, DEFAULT_WORKSPACE_ID)
  assert.equal(next.surfaces['surface-a']?.heldBy, 'aurora')
})

test('extractProjectIdFromWorkspace reads project context ids', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'ws-1' })
  workspace.resident.heldContextIds = ['memory:abc', 'project:scratchpad']

  assert.equal(extractProjectIdFromWorkspace(workspace), 'scratchpad')
  assert.equal(extractProjectIdFromWorkspace(null), null)
})
