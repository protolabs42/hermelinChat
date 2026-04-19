import assert from 'node:assert/strict'
import test from 'node:test'

import { createEmptyWorkspaceState, type FocusTarget } from '../schema'
import { activateWorkspaceSnapshot, buildWorkspaceActivationPlan } from '../workspace-activation'

test('buildWorkspaceActivationPlan prefers continuity thread id over resident session id', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'forge', sessionId: 'sess-resident', now: 100 })
  workspace.resident.heldContextIds = ['project:proj-1']
  workspace.continuity.activeThreadId = 'sess-continuity'
  workspace.continuity.localAnchorIds = ['surface-a']

  assert.deepEqual(buildWorkspaceActivationPlan(workspace), {
    workspaceId: 'forge',
    projectId: 'proj-1',
    sessionId: 'sess-continuity',
    anchorSurfaceIds: ['surface-a'],
  })
})

test('activateWorkspaceSnapshot restores scratchpad session through home dir', async () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'scratch', sessionId: 'sess-1', now: 100 })
  workspace.resident.heldContextIds = ['project:scratchpad']
  workspace.continuity.activeThreadId = 'sess-1'
  workspace.continuity.localAnchorIds = ['surface-a', 'surface-b']

  const calls: string[] = []
  await activateWorkspaceSnapshot(workspace, {
    setActiveWorkspace: async (workspaceId) => { calls.push(`set:${workspaceId}`) },
    hydrateActiveProject: async (projectId) => { calls.push(`hydrate:${projectId}`) },
    resetChat: () => { calls.push('reset') },
    restoreSurfaceAnchors: (surfaceIds) => { calls.push(`anchors:${surfaceIds.join(',')}`) },
    foregroundFocusTarget: (target) => { calls.push(`focus:${target ? `${target.kind}:${target.id}` : 'none'}`) },
    loadSession: async (sessionId, cwd) => { calls.push(`load:${sessionId}:${cwd}`) },
    newSession: async (cwd) => { calls.push(`new:${cwd}`) },
    getHomeDir: async () => '/tmp/home',
    getProjectPath: () => null,
    getCurrentProjectPath: () => null,
  })

  assert.deepEqual(calls, [
    'set:scratch',
    'hydrate:scratchpad',
    'reset',
    'load:sess-1:/tmp/home',
    'anchors:surface-a,surface-b',
    'focus:none',
  ])
})

test('activateWorkspaceSnapshot starts a new project session when no remembered thread exists', async () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'forge', now: 100 })
  workspace.resident.heldContextIds = ['project:proj-1']
  workspace.continuity.localAnchorIds = ['surface-z']

  const calls: string[] = []
  await activateWorkspaceSnapshot(workspace, {
    setActiveWorkspace: async (workspaceId) => { calls.push(`set:${workspaceId}`) },
    hydrateActiveProject: async (projectId) => { calls.push(`hydrate:${projectId}`) },
    resetChat: () => { calls.push('reset') },
    restoreSurfaceAnchors: (surfaceIds) => { calls.push(`anchors:${surfaceIds.join(',')}`) },
    foregroundFocusTarget: (target) => { calls.push(`focus:${target ? `${target.kind}:${target.id}` : 'none'}`) },
    loadSession: async (sessionId, cwd) => { calls.push(`load:${sessionId}:${cwd}`) },
    newSession: async (cwd) => { calls.push(`new:${cwd}`) },
    getHomeDir: async () => '/tmp/home',
    getProjectPath: (projectId) => projectId === 'proj-1' ? '/work/proj-1' : null,
    getCurrentProjectPath: () => '/work/current',
  })

  assert.deepEqual(calls, [
    'set:forge',
    'hydrate:proj-1',
    'reset',
    'new:/work/proj-1',
    'anchors:surface-z',
    'focus:none',
  ])
})

test('activateWorkspaceSnapshot falls back to current project path when no project is remembered', async () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'floating', now: 100 })

  const calls: string[] = []
  await activateWorkspaceSnapshot(workspace, {
    setActiveWorkspace: async (workspaceId) => { calls.push(`set:${workspaceId}`) },
    hydrateActiveProject: async (projectId) => { calls.push(`hydrate:${projectId}`) },
    resetChat: () => { calls.push('reset') },
    restoreSurfaceAnchors: (surfaceIds) => { calls.push(`anchors:${surfaceIds.join(',')}`) },
    foregroundFocusTarget: (target) => { calls.push(`focus:${target ? `${target.kind}:${target.id}` : 'none'}`) },
    loadSession: async (sessionId, cwd) => { calls.push(`load:${sessionId}:${cwd}`) },
    newSession: async (cwd) => { calls.push(`new:${cwd}`) },
    getHomeDir: async () => '/tmp/home',
    getProjectPath: () => null,
    getCurrentProjectPath: () => '/work/current',
  })

  assert.deepEqual(calls, [
    'set:floating',
    'reset',
    'new:/work/current',
    'anchors:',
    'focus:none',
  ])
})

test('activateWorkspaceSnapshot foregrounds a remembered pinned surface after restoring anchors', async () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'forge', sessionId: 'sess-5', now: 100 })
  workspace.resident.heldContextIds = ['project:proj-1']
  workspace.continuity.activeThreadId = 'sess-5'
  workspace.continuity.localAnchorIds = ['surface-z']
  workspace.attention.primaryFocus = { kind: 'surface', id: 'surface-z' }

  const calls: string[] = []
  await activateWorkspaceSnapshot(workspace, {
    setActiveWorkspace: async (workspaceId) => { calls.push(`set:${workspaceId}`) },
    hydrateActiveProject: async (projectId) => { calls.push(`hydrate:${projectId}`) },
    resetChat: () => { calls.push('reset') },
    restoreSurfaceAnchors: (surfaceIds) => { calls.push(`anchors:${surfaceIds.join(',')}`) },
    foregroundFocusTarget: (target) => { calls.push(`focus:${target ? `${target.kind}:${target.id}` : 'none'}`) },
    loadSession: async (sessionId, cwd) => { calls.push(`load:${sessionId}:${cwd}`) },
    newSession: async (cwd) => { calls.push(`new:${cwd}`) },
    getHomeDir: async () => '/tmp/home',
    getProjectPath: (projectId) => projectId === 'proj-1' ? '/work/proj-1' : null,
    getCurrentProjectPath: () => '/work/current',
  })

  assert.deepEqual(calls, [
    'set:forge',
    'hydrate:proj-1',
    'reset',
    'load:sess-5:/work/proj-1',
    'anchors:surface-z',
    'focus:surface:surface-z',
  ])
})

test('activateWorkspaceSnapshot foregrounds a remembered artifact after loading the thread', async () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'forge', sessionId: 'sess-6', now: 100 })
  workspace.resident.heldContextIds = ['project:proj-1']
  workspace.continuity.activeThreadId = 'sess-6'
  workspace.attention.primaryFocus = { kind: 'artifact', id: 'artifact-7' }

  const focusedTargets: Array<FocusTarget | null> = []
  await activateWorkspaceSnapshot(workspace, {
    setActiveWorkspace: async () => {},
    hydrateActiveProject: async () => {},
    resetChat: () => {},
    restoreSurfaceAnchors: () => {},
    foregroundFocusTarget: (target) => { focusedTargets.push(target) },
    loadSession: async () => {},
    newSession: async () => {},
    getHomeDir: async () => '/tmp/home',
    getProjectPath: () => '/work/proj-1',
    getCurrentProjectPath: () => '/work/current',
  })

  assert.deepEqual(focusedTargets, [{ kind: 'artifact', id: 'artifact-7' }])
})

test('activateWorkspaceSnapshot still reports thread focus explicitly even when no extra foreground step is needed', async () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'forge', sessionId: 'sess-9', now: 100 })
  workspace.resident.heldContextIds = ['project:proj-1']
  workspace.continuity.activeThreadId = 'sess-9'
  workspace.attention.primaryFocus = { kind: 'thread', id: 'sess-9' }

  const focusedTargets: Array<FocusTarget | null> = []
  await activateWorkspaceSnapshot(workspace, {
    setActiveWorkspace: async () => {},
    hydrateActiveProject: async () => {},
    resetChat: () => {},
    restoreSurfaceAnchors: () => {},
    foregroundFocusTarget: (target) => { focusedTargets.push(target) },
    loadSession: async () => {},
    newSession: async () => {},
    getHomeDir: async () => '/tmp/home',
    getProjectPath: () => '/work/proj-1',
    getCurrentProjectPath: () => '/work/current',
  })

  assert.deepEqual(focusedTargets, [{ kind: 'thread', id: 'sess-9' }])
})
