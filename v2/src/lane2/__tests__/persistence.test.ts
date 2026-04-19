import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkspaceCreationSnapshot,
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

test('buildWorkspaceSnapshot derives resident stance and background holdings from live posture', () => {
  const next = buildWorkspaceSnapshot({
    orderedSurfaceIds: ['surface-a', 'surface-b'],
    projectId: 'proj-1',
    sessionId: 'sess-1',
    isStreaming: true,
    chrome: {
      sidebarOpen: false,
      sidebarWidth: 280,
      artifactPanelOpen: true,
      artifactPanelWidth: 420,
      activeArtifactId: 'artifact-2',
      pinnedSurfaceId: 'surface-b',
    },
    now: 1100,
  })

  assert.equal(next.resident.stance, 'building')
  assert.deepEqual(next.attention.backgroundHoldings, [
    { kind: 'surface', id: 'surface-a' },
    { kind: 'artifact', id: 'artifact-2' },
  ])
})

test('buildWorkspaceSnapshot falls back to waiting stance with no session', () => {
  const next = buildWorkspaceSnapshot({
    orderedSurfaceIds: [],
    projectId: null,
    sessionId: null,
    now: 1200,
  })

  assert.equal(next.resident.stance, 'waiting')
  assert.deepEqual(next.attention.backgroundHoldings, [])
})

test('buildWorkspaceSnapshot scaffolds a live invocation while streaming', () => {
  const next = buildWorkspaceSnapshot({
    orderedSurfaceIds: ['surface-a'],
    projectId: 'proj-1',
    sessionId: 'sess-1',
    isStreaming: true,
    now: 1300,
  })

  assert.equal(next.resident.activeInvocationId, 'live:sess-1')
  assert.deepEqual(next.attention.unresolvedTargets, [{ kind: 'surface', id: 'surface-a' }])
  assert.deepEqual(next.invocations['live:sess-1'], {
    invocationId: 'live:sess-1',
    kind: 'background',
    target: 'live-session',
    summary: 'Working in surface surface-a',
    recoveryActionLabel: 'Resume thread sess-1',
    initiatedBy: 'aurora',
    workspaceId: DEFAULT_WORKSPACE_ID,
    sessionId: 'sess-1',
    surfaceId: 'surface-a',
    threadId: 'sess-1',
    contextRefs: [
      { kind: 'workspace', id: DEFAULT_WORKSPACE_ID },
      { kind: 'thread', id: 'sess-1' },
      { kind: 'surface', id: 'surface-a' },
    ],
    status: 'active',
    createdAt: 1300,
    updatedAt: 1300,
  })
})

test('buildWorkspaceSnapshot clears live invocation scaffolding when not streaming', () => {
  const existing = createEmptyWorkspaceState({ workspaceId: DEFAULT_WORKSPACE_ID, sessionId: 'sess-1' })
  existing.resident.activeInvocationId = 'live:sess-1'
  existing.attention.unresolvedTargets = [{ kind: 'surface', id: 'surface-a' }]
  existing.invocations['live:sess-1'] = {
    invocationId: 'live:sess-1',
    kind: 'background',
    target: 'live-session',
    summary: 'Working in surface surface-a',
    recoveryActionLabel: 'Resume thread sess-1',
    initiatedBy: 'aurora',
    workspaceId: DEFAULT_WORKSPACE_ID,
    sessionId: 'sess-1',
    surfaceId: 'surface-a',
    threadId: 'sess-1',
    contextRefs: [],
    status: 'active',
    createdAt: 1,
    updatedAt: 1,
  }

  const next = buildWorkspaceSnapshot({
    existing,
    orderedSurfaceIds: ['surface-a'],
    projectId: 'proj-1',
    sessionId: 'sess-1',
    isStreaming: false,
    now: 1400,
  })

  assert.equal(next.resident.activeInvocationId, null)
  assert.deepEqual(next.attention.unresolvedTargets, [])
  assert.equal(next.invocations['live:sess-1'], undefined)
})

test('buildWorkspaceCreationSnapshot creates a blank workspace without cloning the active desk', () => {
  const next = buildWorkspaceCreationSnapshot({
    mode: 'blank',
    workspaceId: 'blank-lab',
    projectId: 'proj-blank',
    sessionId: 'sess-live',
    orderedSurfaceIds: ['surface-a', 'surface-b'],
    chrome: {
      sidebarOpen: true,
      sidebarWidth: 344,
      artifactPanelOpen: true,
      artifactPanelWidth: 512,
      activeArtifactId: 'artifact-1',
      pinnedSurfaceId: 'surface-b',
    },
    now: 1_500,
  })

  assert.equal(next.workspaceId, 'blank-lab')
  assert.equal(next.resident.sessionId, null)
  assert.equal(next.resident.stance, 'waiting')
  assert.deepEqual(next.resident.heldContextIds, ['project:proj-blank'])
  assert.deepEqual(next.resident.activeSurfaceIds, [])
  assert.deepEqual(next.continuity.localAnchorIds, [])
  assert.deepEqual(next.surfaces, {})
  assert.equal(next.chrome.sidebarOpen, false)
  assert.equal(next.chrome.sidebarWidth, 280)
  assert.equal(next.chrome.artifactPanelOpen, false)
  assert.equal(next.chrome.pinnedSurfaceId, null)
})

test('buildWorkspaceCreationSnapshot duplicates the current workspace into a new id', () => {
  const existing = createEmptyWorkspaceState({ workspaceId: 'forge', sessionId: 'sess-old', now: 1_600 })
  existing.surfaces['surface-a'] = {
    surfaceId: 'surface-a',
    surfaceKind: 'a2ui',
    title: 'surface-a',
    workspaceId: 'forge',
    sessionId: 'sess-old',
    createdBy: 'aurora',
    heldBy: 'aurora',
    createdAt: 1_590,
    updatedAt: 1_590,
    status: 'active',
  }

  const next = buildWorkspaceCreationSnapshot({
    mode: 'duplicate',
    existing,
    workspaceId: 'forge-copy',
    projectId: 'proj-1',
    sessionId: 'sess-1',
    orderedSurfaceIds: ['surface-a'],
    chrome: {
      sidebarOpen: true,
      sidebarWidth: 344,
      artifactPanelOpen: true,
      artifactPanelWidth: 512,
      activeArtifactId: 'artifact-1',
      pinnedSurfaceId: 'surface-a',
    },
    now: 1_601,
  })

  assert.equal(next.workspaceId, 'forge-copy')
  assert.equal(next.resident.sessionId, 'sess-1')
  assert.deepEqual(next.resident.activeSurfaceIds, ['surface-a'])
  assert.deepEqual(next.resident.heldContextIds, ['project:proj-1'])
  assert.equal(next.surfaces['surface-a']?.workspaceId, 'forge-copy')
  assert.equal(next.chrome.sidebarOpen, true)
  assert.equal(next.chrome.sidebarWidth, 344)
  assert.equal(next.chrome.activeArtifactId, 'artifact-1')
  assert.deepEqual(next.continuity.localAnchorIds, ['surface-a'])
})

test('extractProjectIdFromWorkspace reads project context ids', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'ws-1' })
  workspace.resident.heldContextIds = ['memory:abc', 'project:scratchpad']

  assert.equal(extractProjectIdFromWorkspace(workspace), 'scratchpad')
  assert.equal(extractProjectIdFromWorkspace(null), null)
})
