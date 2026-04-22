import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmptyWorkspaceState, type WorkspaceState } from '../schema'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
  const workspace = createEmptyWorkspaceState({ workspaceId: 'forge', sessionId: 'sess-1', now: 100 })
  assert.equal(workspace.workspaceId, 'forge')
  assert.equal(workspace.resident.residentId, 'aurora')
  assert.equal(workspace.resident.sessionId, 'sess-1')
  assert.deepEqual(workspace.chrome.rightRail, { mode: 'hidden' })
})

test('workspace state can hold typed invocation envelopes', () => {
  const workspace = createEmptyWorkspaceState({ workspaceId: 'forge', now: 100 })
  workspace.invocations['inv-1'] = {
    invocationId: 'inv-1',
    kind: 'subagent',
    target: 'delegate_task',
    summary: 'Working in surface surface-a',
    recoveryActionLabel: 'Resume thread sess-1',
    initiatedBy: 'aurora',
    workspaceId: 'forge',
    sessionId: null,
    surfaceId: null,
    threadId: null,
    contextRefs: [],
    status: 'pending',
    createdAt: 100,
    updatedAt: 100,
  }

  assert.equal(workspace.invocations['inv-1'].workspaceId, 'forge')
  assert.equal(workspace.invocations['inv-1'].initiatedBy, 'aurora')
})

test('fixture workspace stays in TS lane2 parity shape', () => {
  const fixturePath = path.resolve(__dirname, '../__fixtures__/workspace-state.json')
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as WorkspaceState

  assert.equal(fixture.attention.unresolvedTargets[0]?.reason, 'draft-in-progress')
  assert.equal(fixture.attention.unresolvedTargets[0]?.label, 'Draft in progress')
  assert.deepEqual(fixture.chrome.rightRail, { mode: 'single', primaryPane: 'surfaces' })
})
