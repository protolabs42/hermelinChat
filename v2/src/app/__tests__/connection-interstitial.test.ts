import assert from 'node:assert/strict'

import { buildConnectionInterstitialModel } from '../connection-interstitial'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('connection interstitial')

test('connecting state stays on the Hermes step without recovery affordances', () => {
  const model = buildConnectionInterstitialModel({
    connectionStatus: 'connecting',
    elapsedMs: 4_000,
    rememberedSessionId: null,
    sessionId: null,
    workspaceHydrated: false,
    workspaceId: null,
  })

  assert.equal(model?.title, 'Connecting to Hermes')
  assert.equal(model?.steps[0]?.status, 'active')
  assert.equal(model?.showRecovery, false)
})

test('connected startup moves to workspace restore before a session exists', () => {
  const model = buildConnectionInterstitialModel({
    connectionStatus: 'connected',
    elapsedMs: 2_000,
    rememberedSessionId: null,
    sessionId: null,
    workspaceHydrated: false,
    workspaceId: 'default',
  })

  assert.equal(model?.title, 'Restoring workspace')
  assert.equal(model?.steps[1]?.status, 'active')
})

test('remembered thread startup becomes legible once workspace state is hydrated', () => {
  const model = buildConnectionInterstitialModel({
    connectionStatus: 'connected',
    elapsedMs: 3_000,
    rememberedSessionId: 'sess-42',
    sessionId: null,
    workspaceHydrated: true,
    workspaceId: 'forge',
  })

  assert.equal(model?.title, 'Loading remembered thread')
  assert.match(model?.detail ?? '', /sess-42/)
  assert.equal(model?.steps[2]?.status, 'active')
})

test('fresh-session startup stays honest when there is no remembered thread to resume', () => {
  const model = buildConnectionInterstitialModel({
    connectionStatus: 'connected',
    elapsedMs: 3_000,
    rememberedSessionId: null,
    sessionId: null,
    workspaceHydrated: true,
    workspaceId: 'forge',
  })

  assert.equal(model?.title, 'Starting a fresh session')
  assert.match(model?.detail ?? '', /forge/)
  assert.equal(model?.steps[2]?.label, 'Start session')
  assert.equal(model?.steps[2]?.status, 'active')
})

test('fresh-session preference suppresses stale remembered-thread copy during recovery', () => {
  const model = buildConnectionInterstitialModel({
    connectionStatus: 'connected',
    elapsedMs: 3_000,
    rememberedSessionId: 'sess-stale',
    preferFreshSession: true,
    sessionId: null,
    workspaceHydrated: true,
    workspaceId: 'forge',
  })

  assert.equal(model?.title, 'Starting a fresh session')
  assert.doesNotMatch(model?.detail ?? '', /sess-stale/)
})

test('recovery affordances appear once startup feels stalled', () => {
  const model = buildConnectionInterstitialModel({
    connectionStatus: 'connected',
    elapsedMs: 12_000,
    rememberedSessionId: null,
    sessionId: null,
    workspaceHydrated: true,
    workspaceId: 'forge',
  })

  assert.equal(model?.showRecovery, true)
})

test('interstitial disappears once a live session exists', () => {
  const model = buildConnectionInterstitialModel({
    connectionStatus: 'connected',
    elapsedMs: 1_000,
    rememberedSessionId: 'sess-42',
    sessionId: 'sess-live',
    workspaceHydrated: true,
    workspaceId: 'forge',
  })

  assert.equal(model, null)
})
