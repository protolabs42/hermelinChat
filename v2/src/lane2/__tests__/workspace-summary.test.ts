import assert from 'node:assert/strict'
import test from 'node:test'

import { createEmptyWorkspaceState } from '../schema'
import { buildWorkspaceContinuityCard, buildWorkspaceRowSummary } from '../workspace-summary'

test('buildWorkspaceRowSummary marks remembered active work without pretending resumability', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'forge', sessionId: 'sess-1', now: 1700 })
  workspace.resident.stance = 'building'
  workspace.resident.activeInvocationId = 'live:sess-1'
  workspace.attention.primaryFocus = { kind: 'surface', id: 'surface-a' }
  workspace.attention.unresolvedTargets = [{ kind: 'surface', id: 'surface-a' }]
  workspace.resident.activeSurfaceIds = ['surface-a', 'surface-b']
  workspace.invocations['live:sess-1'] = {
    invocationId: 'live:sess-1',
    kind: 'background',
    target: 'live-session',
    summary: 'Working in surface surface-a',
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
    createdAt: 1700,
    updatedAt: 1700,
  }

  assert.deepEqual(buildWorkspaceRowSummary(workspace), {
    status: 'remembered-active',
    headline: 'Remembered active work',
    detail: 'Working in surface surface-a • 1 unresolved • 2 surfaces',
    actionLabel: 'Resume thread sess-1',
  })
})

test('buildWorkspaceRowSummary falls back to a generic resume label when remembered work has no thread id', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'forge', now: 1750 })
  workspace.resident.stance = 'building'
  workspace.resident.activeInvocationId = 'live:unknown'

  assert.deepEqual(buildWorkspaceRowSummary(workspace), {
    status: 'remembered-active',
    headline: 'Remembered active work',
    detail: 'Workspace remembers in-progress work',
    actionLabel: 'Resume remembered work',
  })
})

test('buildWorkspaceRowSummary falls back to focus-driven summary for idle workspace state', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'lab', sessionId: 'sess-9', now: 1800 })
  workspace.resident.stance = 'attending'
  workspace.attention.primaryFocus = { kind: 'thread', id: 'sess-9' }

  assert.deepEqual(buildWorkspaceRowSummary(workspace), {
    status: 'ready',
    headline: 'Ready in thread sess-9',
    detail: 'No unresolved work remembered',
    actionLabel: 'Open thread sess-9',
  })
})

test('buildWorkspaceRowSummary shows a quiet waiting workspace honestly', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'archive', now: 1900 })
  workspace.resident.stance = 'waiting'

  assert.deepEqual(buildWorkspaceRowSummary(workspace), {
    status: 'idle',
    headline: 'Waiting',
    detail: 'No active thread or surface remembered',
    actionLabel: 'Open workspace',
  })
})

test('buildWorkspaceContinuityCard surfaces remembered active work for the current workspace', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'forge', sessionId: 'sess-3', now: 2000 })
  workspace.resident.activeInvocationId = 'live:sess-3'
  workspace.attention.primaryFocus = { kind: 'surface', id: 'surface-b' }
  workspace.attention.unresolvedTargets = [{ kind: 'surface', id: 'surface-b' }]
  workspace.invocations['live:sess-3'] = {
    invocationId: 'live:sess-3',
    kind: 'background',
    target: 'live-session',
    summary: 'Working in surface surface-b',
    recoveryActionLabel: 'Resume thread sess-3',
    initiatedBy: 'aurora',
    workspaceId: 'forge',
    sessionId: 'sess-3',
    surfaceId: 'surface-b',
    threadId: 'sess-3',
    contextRefs: [
      { kind: 'workspace', id: 'forge' },
      { kind: 'thread', id: 'sess-3' },
      { kind: 'surface', id: 'surface-b' },
    ],
    status: 'active',
    createdAt: 2000,
    updatedAt: 2000,
  }

  assert.deepEqual(buildWorkspaceContinuityCard(workspace), {
    tone: 'active',
    label: 'Remembered active work',
    detail: 'Working in surface surface-b',
    actionLabel: 'Resume thread sess-3',
  })
})

test('buildWorkspaceContinuityCard shows unresolved remembered work when focus is ready but not active', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'lab', sessionId: 'sess-4', now: 2100 })
  workspace.attention.primaryFocus = { kind: 'thread', id: 'sess-4' }
  workspace.attention.unresolvedTargets = [
    { kind: 'thread', id: 'sess-4' },
    { kind: 'surface', id: 'surface-z' },
  ]

  assert.deepEqual(buildWorkspaceContinuityCard(workspace), {
    tone: 'ready',
    label: '2 unresolved remembered',
    detail: 'Ready in thread sess-4',
    actionLabel: 'Open thread sess-4',
  })
})

test('buildWorkspaceRowSummary surfaces waiting-for-tool semantics with a user-meaningful label', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'forge', sessionId: 'sess-6', now: 2_150 })
  workspace.attention.primaryFocus = { kind: 'thread', id: 'sess-6' }
  workspace.attention.unresolvedTargets = [
    {
      kind: 'invocation',
      id: 'tool-1',
      reason: 'waiting-for-tool',
      label: 'Waiting on tool result',
    },
  ]

  assert.deepEqual(buildWorkspaceRowSummary(workspace), {
    status: 'ready',
    headline: 'Waiting on tool result',
    detail: 'Ready in thread sess-6',
    actionLabel: 'Open thread sess-6',
  })
})

test('buildWorkspaceContinuityCard prefers semantic unresolved labels over generic unresolved counts', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'proof', sessionId: 'sess-7', now: 2_200 })
  workspace.attention.primaryFocus = { kind: 'surface', id: 'surface-coedit' }
  workspace.attention.unresolvedTargets = [
    {
      kind: 'surface',
      id: 'surface-coedit',
      reason: 'coedit-open',
      label: 'Coedit proof open',
    },
  ]

  assert.deepEqual(buildWorkspaceContinuityCard(workspace), {
    tone: 'ready',
    label: 'Coedit proof open',
    detail: 'Ready in surface surface-coedit',
    actionLabel: 'Open surface surface-coedit',
  })
})

test('buildWorkspaceContinuityCard returns null for a quiet waiting workspace', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'archive', now: 2200 })
  workspace.resident.stance = 'waiting'

  assert.equal(buildWorkspaceContinuityCard(workspace), null)
})
