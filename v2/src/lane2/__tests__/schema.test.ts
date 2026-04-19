import assert from 'node:assert/strict'
import {
  createEmptyWorkspaceState,
  type InvocationEnvelope,
  type WorkspaceState,
} from '../schema'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('lane2 schema')

test('createEmptyWorkspaceState seeds Aurora as resident', () => {
  const state = createEmptyWorkspaceState({ workspaceId: 'ws-1', sessionId: 'sess-1' })
  assert.equal(state.workspaceId, 'ws-1')
  assert.equal(state.resident.residentId, 'aurora')
  assert.equal(state.resident.sessionId, 'sess-1')
  assert.equal(state.attention.primaryFocus, null)
  assert.equal(state.chrome.sidebarOpen, false)
  assert.equal(state.chrome.sidebarWidth, 280)
  assert.equal(state.chrome.artifactPanelOpen, false)
  assert.equal(state.chrome.artifactPanelWidth, 420)
  assert.equal(state.chrome.activeArtifactId, null)
  assert.equal(state.chrome.pinnedSurfaceId, null)
})

test('workspace state can hold typed invocation envelopes', () => {
  const state: WorkspaceState = createEmptyWorkspaceState({ workspaceId: 'ws-1' })
  const invocation: InvocationEnvelope = {
    invocationId: 'inv-1',
    kind: 'subagent',
    target: 'delegate_task',
    summary: null,
    recoveryActionLabel: null,
    initiatedBy: 'aurora',
    workspaceId: 'ws-1',
    sessionId: null,
    surfaceId: null,
    threadId: null,
    contextRefs: [],
    status: 'pending',
    createdAt: 1,
    updatedAt: 1,
  }
  state.invocations[invocation.invocationId] = invocation
  assert.equal(state.invocations['inv-1']?.kind, 'subagent')
})
