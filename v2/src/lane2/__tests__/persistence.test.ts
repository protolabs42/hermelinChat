import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkspaceSnapshot,
  DEFAULT_WORKSPACE_ID,
  extractProjectIdFromWorkspace,
} from '../persistence'
import { createEmptyWorkspaceState } from '../schema'
import type { SurfaceState } from '../../a2ui/types'

function surfaceState(overrides: Partial<SurfaceState> & { surfaceId: string }): SurfaceState {
  return {
    surfaceId: overrides.surfaceId,
    catalogId: overrides.catalogId ?? 'catalog-1',
    theme: overrides.theme ?? {},
    sendDataModel: overrides.sendDataModel ?? true,
    components: overrides.components ?? {},
    dataModel: overrides.dataModel ?? {},
    revision: overrides.revision ?? 1,
  }
}

test('buildWorkspaceSnapshot seeds resident continuity from live state', () => {
  const existing = createEmptyWorkspaceState({ workspaceId: DEFAULT_WORKSPACE_ID, sessionId: 'sess-old' })
  const next = buildWorkspaceSnapshot({
    existing,
    chrome: {
      sidebarOpen: true,
      sidebarWidth: 344,
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
  assert.equal(next.chrome.sidebarWidth, 344)
  assert.equal(next.chrome.artifactPanelOpen, true)
  assert.equal(next.chrome.artifactPanelWidth, 512)
  assert.equal(next.chrome.activeArtifactId, 'artifact-1')
  assert.equal(next.chrome.pinnedSurfaceId, 'surface-b')
  assert.deepEqual(next.attention.primaryFocus, { kind: 'surface', id: 'surface-b' })
  assert.deepEqual(next.attention.pinnedTargets, [{ kind: 'surface', id: 'surface-b' }])
  assert.deepEqual(next.continuity.pinnedSurfaceIds, ['surface-b'])
  assert.deepEqual(next.resident.focusTarget, { kind: 'surface', id: 'surface-b' })
})

test('buildWorkspaceSnapshot clamps artifact panel width into sane workspace bounds', () => {
  const next = buildWorkspaceSnapshot({
    orderedSurfaceIds: [],
    projectId: 'proj-1',
    sessionId: 'sess-1',
    chrome: {
      sidebarOpen: false,
      sidebarWidth: 120,
      artifactPanelOpen: true,
      artifactPanelWidth: 120,
      activeArtifactId: null,
      pinnedSurfaceId: null,
    },
    now: 456,
  })

  assert.equal(next.chrome.sidebarWidth, 220)
  assert.equal(next.chrome.artifactPanelWidth, 280)
})

test('buildWorkspaceSnapshot falls back to active artifact focus when no surface is pinned', () => {
  const next = buildWorkspaceSnapshot({
    orderedSurfaceIds: ['surface-a'],
    projectId: 'proj-1',
    sessionId: 'sess-1',
    chrome: {
      sidebarOpen: false,
      sidebarWidth: 280,
      artifactPanelOpen: true,
      artifactPanelWidth: 420,
      activeArtifactId: 'artifact-9',
      pinnedSurfaceId: null,
    },
    now: 789,
  })

  assert.deepEqual(next.attention.primaryFocus, { kind: 'artifact', id: 'artifact-9' })
  assert.deepEqual(next.attention.pinnedTargets, [])
  assert.deepEqual(next.continuity.pinnedSurfaceIds, [])
  assert.deepEqual(next.resident.focusTarget, { kind: 'artifact', id: 'artifact-9' })
})

test('buildWorkspaceSnapshot persists live runtime for active surfaces', () => {
  const next = buildWorkspaceSnapshot({
    orderedSurfaceIds: ['surface-a'],
    projectId: 'proj-1',
    sessionId: 'sess-1',
    liveSurfaces: {
      'surface-a': surfaceState({
        surfaceId: 'surface-a',
        revision: 7,
        dataModel: { value: 42 },
        components: {
          root: {
            id: 'root',
            component: 'Text',
            text: 'hi',
          },
        },
      }),
    },
    now: 999,
  })

  assert.deepEqual(next.runtime['surface-a'], {
    revision: 7,
    currentState: {
      catalogId: 'catalog-1',
      theme: {},
      sendDataModel: true,
      dataModel: { value: 42 },
      components: {
        root: {
          id: 'root',
          component: 'Text',
          text: 'hi',
        },
      },
    },
    pendingOutbound: null,
    pendingInbound: null,
    localAttention: null,
  })
})

test('buildWorkspaceSnapshot preserves explicit inline anchor ordering when provided', () => {
  const next = buildWorkspaceSnapshot({
    orderedSurfaceIds: ['surface-a', 'surface-b'],
    anchorSurfaceIds: ['surface-b', 'surface-a'],
    projectId: 'proj-1',
    sessionId: 'sess-1',
    now: 1000,
  })

  assert.deepEqual(next.continuity.localAnchorIds, ['surface-b', 'surface-a'])
})

test('extractProjectIdFromWorkspace reads project context ids', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'ws-1' })
  workspace.resident.heldContextIds = ['memory:abc', 'project:scratchpad']

  assert.equal(extractProjectIdFromWorkspace(workspace), 'scratchpad')
  assert.equal(extractProjectIdFromWorkspace(null), null)
})
