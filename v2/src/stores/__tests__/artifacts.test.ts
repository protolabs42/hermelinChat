import assert from 'node:assert/strict'
import {
  clampArtifactPanelWidth,
  filterArtifactsForSession,
  useArtifactStore,
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

test('clampArtifactPanelWidth keeps persisted widths inside workspace bounds', () => {
  assert.equal(clampArtifactPanelWidth(120), 280)
  assert.equal(clampArtifactPanelWidth(420), 420)
  assert.equal(clampArtifactPanelWidth(1200, 1000), 600)
})

test('selecting an artifact clears pinned surface mode', () => {
  useArtifactStore.setState({
    artifacts: [],
    activeId: null,
    panelOpen: false,
    panelWidth: 420,
    pinnedSurfaceId: 'surface-1',
  })

  useArtifactStore.getState().setActiveId('artifact-2')

  const state = useArtifactStore.getState()
  assert.equal(state.activeId, 'artifact-2')
  assert.equal(state.pinnedSurfaceId, null)
})

test('pinning a surface opens the panel and keeps surface mode explicit', () => {
  useArtifactStore.setState({
    artifacts: [],
    activeId: 'artifact-3',
    panelOpen: false,
    panelWidth: 420,
    pinnedSurfaceId: null,
  })

  useArtifactStore.getState().pinSurface('surface-9')

  const state = useArtifactStore.getState()
  assert.equal(state.panelOpen, true)
  assert.equal(state.pinnedSurfaceId, 'surface-9')
})
