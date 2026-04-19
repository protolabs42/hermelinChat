import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  ArtifactPaneView,
  RightPaneStackView,
  SurfacePaneView,
} from '../RightPaneStack'
import { usePaneStore } from '../../stores/panes'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

function render(layout: ReturnType<typeof usePaneStore.getState>['layout']) {
  return renderToStaticMarkup(
    createElement(RightPaneStackView, {
      closePane: () => {},
      layout,
      panelWidth: 420,
      setPanelWidth: () => {},
    })
  )
}

console.log('RightPaneStack')

test('returns no markup while the right rail is hidden', () => {
  const html = render({ mode: 'hidden' })
  assert.equal(html, '')
})

test('renders a single Plan pane with orientation copy', () => {
  const html = render({ mode: 'single', primaryPane: 'plan' })
  assert.match(html, />Plan</)
  assert.match(html, /Capture the next slice before you type yourself into a corner/)
  assert.match(html, /Hide plan pane/)
})

test('renders stacked Plan and Tasks panes with both headers visible', () => {
  const html = render({ mode: 'stacked', primaryPane: 'tasks', secondaryPane: 'plan' })
  assert.match(html, />Tasks</)
  assert.match(html, />Plan</)
  assert.match(html, /Track the current slice instead of juggling it in your head/)
})

test('ArtifactPaneView shows an honest empty state when no artifact is selected', () => {
  const html = renderToStaticMarkup(createElement(ArtifactPaneView, {
    activeArtifact: null,
    artifactCount: 0,
  }))

  assert.match(html, /No artifacts/)
  assert.match(html, /Ask the agent to create one/)
})

test('SurfacePaneView surfaces the pinned surface before the list', () => {
  const html = renderToStaticMarkup(createElement(SurfacePaneView, {
    pinnedSurfaceId: 'surface-2',
    pinnedSurfaceTitle: 'coedit-proof',
    surfaceIds: ['surface-1', 'surface-2'],
  }))

  assert.match(html, /Pinned Surface/)
  assert.match(html, /coedit-proof/)
  assert.match(html, /surface-1/)
})
