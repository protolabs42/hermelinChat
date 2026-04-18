import assert from 'node:assert/strict'
import {
  filterArtifactsForSession,
  shouldAcceptArtifactEvent,
  type Artifact,
} from '../artifacts'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

function artifact(overrides: Partial<Artifact> & { id: string }): Artifact {
  return {
    id: overrides.id,
    artifact_type: overrides.artifact_type ?? 'table',
    title: overrides.title ?? null,
    data: overrides.data ?? null,
    live: overrides.live ?? null,
    refresh_seconds: overrides.refresh_seconds ?? null,
    timestamp: overrides.timestamp ?? null,
    persistent: overrides.persistent ?? null,
    session_id: overrides.session_id ?? null,
  }
}

console.log('artifact session filtering')

test('filterArtifactsForSession keeps current-session and legacy artifacts only', () => {
  const artifacts = [
    artifact({ id: 'current', session_id: 'sess-1' }),
    artifact({ id: 'other', session_id: 'sess-2' }),
    artifact({ id: 'legacy', session_id: null }),
  ]

  const visible = filterArtifactsForSession(artifacts, 'sess-1')
  assert.deepEqual(visible.map((a) => a.id), ['current', 'legacy'])
})

test('filterArtifactsForSession hides session-bound artifacts until a session exists', () => {
  const artifacts = [
    artifact({ id: 'current', session_id: 'sess-1' }),
    artifact({ id: 'legacy', session_id: null }),
  ]

  const visible = filterArtifactsForSession(artifacts, null)
  assert.deepEqual(visible.map((a) => a.id), ['legacy'])
})

test('shouldAcceptArtifactEvent ignores mismatched session updates but keeps legacy', () => {
  assert.equal(shouldAcceptArtifactEvent(artifact({ id: 'current', session_id: 'sess-1' }), 'sess-1'), true)
  assert.equal(shouldAcceptArtifactEvent(artifact({ id: 'other', session_id: 'sess-2' }), 'sess-1'), false)
  assert.equal(shouldAcceptArtifactEvent(artifact({ id: 'legacy', session_id: null }), 'sess-1'), true)
})
