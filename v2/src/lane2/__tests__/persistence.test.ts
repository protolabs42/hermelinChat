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
    chrome: {
      sidebarOpen: true,
      artifactPanelOpen: true,
      artifactPanelWidth: 512,
      activeArtifactId: 'artifact-1',
      pinnedSurfaceId: 'surface-b',
    },
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
  assert.equal(next.chrome.sidebarOpen, true)
  assert.equal(next.chrome.artifactPanelOpen, true)
  assert.equal(next.chrome.artifactPanelWidth, 512)
  assert.equal(next.chrome.activeArtifactId, 'artifact-1')
  assert.equal(next.chrome.pinnedSurfaceId, 'surface-b')
})

test('buildWorkspaceSnapshot clamps artifact panel width into sane workspace bounds', () => {
  const next = buildWorkspaceSnapshot({
    orderedSurfaceIds: [],
    projectId: 'proj-1',
    sessionId: 'sess-1',
    chrome: {
      sidebarOpen: false,
      artifactPanelOpen: true,
      artifactPanelWidth: 120,
      activeArtifactId: null,
      pinnedSurfaceId: null,
    },
    now: 456,
  })

  assert.equal(next.chrome.artifactPanelWidth, 280)
})

test('extractProjectIdFromWorkspace reads project context ids', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'ws-1' })
  workspace.resident.heldContextIds = ['memory:abc', 'project:scratchpad']

  assert.equal(extractProjectIdFromWorkspace(workspace), 'scratchpad')
  assert.equal(extractProjectIdFromWorkspace(null), null)
})
