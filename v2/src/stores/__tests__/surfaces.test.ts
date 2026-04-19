import assert from 'node:assert/strict'

import {
  hydrateSurfaceState,
  snapshotSurfaceRuntime,
} from '../surfaces'
import type { SurfaceState } from '../../a2ui/types'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

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

console.log('surface runtime persistence')

test('snapshotSurfaceRuntime captures render-critical surface state', () => {
  const runtime = snapshotSurfaceRuntime(surfaceState({
    surfaceId: 'surface-a',
    revision: 5,
    dataModel: { value: 1 },
    components: {
      root: { id: 'root', component: 'Text', text: 'hello' },
    },
  }))

  assert.deepEqual(runtime, {
    revision: 5,
    currentState: {
      catalogId: 'catalog-1',
      theme: {},
      sendDataModel: true,
      dataModel: { value: 1 },
      components: {
        root: { id: 'root', component: 'Text', text: 'hello' },
      },
    },
    pendingOutbound: null,
    pendingInbound: null,
    localAttention: null,
  })
})

test('hydrateSurfaceState rebuilds a renderable surface from runtime state', () => {
  const hydrated = hydrateSurfaceState('surface-a', {
    revision: 5,
    currentState: {
      catalogId: 'catalog-1',
      theme: {},
      sendDataModel: true,
      dataModel: { value: 1 },
      components: {
        root: { id: 'root', component: 'Text', text: 'hello' },
      },
    },
    pendingOutbound: null,
    pendingInbound: null,
    localAttention: null,
  })

  assert.deepEqual(hydrated, {
    surfaceId: 'surface-a',
    catalogId: 'catalog-1',
    theme: {},
    sendDataModel: true,
    dataModel: { value: 1 },
    components: {
      root: { id: 'root', component: 'Text', text: 'hello' },
    },
    revision: 5,
  })
})
