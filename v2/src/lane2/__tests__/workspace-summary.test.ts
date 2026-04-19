import assert from 'node:assert/strict'
import test from 'node:test'

import { createEmptyWorkspaceState } from '../schema'
import { buildWorkspaceRowSummary } from '../workspace-summary'

test('buildWorkspaceRowSummary marks remembered active work without pretending resumability', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'forge', sessionId: 'sess-1', now: 1700 })
  workspace.resident.stance = 'building'
  workspace.resident.activeInvocationId = 'live:sess-1'
  workspace.attention.primaryFocus = { kind: 'surface', id: 'surface-a' }
  workspace.attention.unresolvedTargets = [{ kind: 'surface', id: 'surface-a' }]
  workspace.resident.activeSurfaceIds = ['surface-a', 'surface-b']

  assert.deepEqual(buildWorkspaceRowSummary(workspace), {
    status: 'remembered-active',
    headline: 'Remembered active work',
    detail: 'surface surface-a • 1 unresolved • 2 surfaces',
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
  })
})

test('buildWorkspaceRowSummary shows a quiet waiting workspace honestly', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'archive', now: 1900 })
  workspace.resident.stance = 'waiting'

  assert.deepEqual(buildWorkspaceRowSummary(workspace), {
    status: 'idle',
    headline: 'Waiting',
    detail: 'No active thread or surface remembered',
  })
})
