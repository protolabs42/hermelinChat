import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  ArtifactPaneView,
  PlanPaneView,
  RightPaneStackView,
  SurfacePaneView,
  TasksPaneView,
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

function render(
  layout: ReturnType<typeof usePaneStore.getState>['layout'],
  options?: {
    headerModel?: {
      cwdLabel: string | null
      cwdTitle: string | null
      branchLabel: string | null
      branchDirty: boolean
      tokenBudgetLabel: string | null
      activityLabel: string | null
      activityTitle: string | null
    }
  }
) {
  return renderToStaticMarkup(
    createElement(RightPaneStackView, {
      closePane: () => {},
      layout,
      panelWidth: 420,
      setPanelWidth: () => {},
      headerModel: options?.headerModel,
    })
  )
}

console.log('RightPaneStack')

test('returns no markup while the right rail is hidden', () => {
  const html = render({ mode: 'hidden' })
  assert.equal(html, '')
})

test('renders a single Plan pane with orientation copy', () => {
  const html = render(
    { mode: 'single', primaryPane: 'plan' },
    {
      headerModel: {
        cwdLabel: '/…/hermelinChat/v2',
        cwdTitle: '/home/inu/hermelinChat/v2',
        branchLabel: 'feat/live-pane-headers',
        branchDirty: true,
        tokenBudgetLabel: '29k left',
        activityLabel: 'Aurora · just now',
        activityTitle: 'Aurora activity at 4/19/2026, 3:58:00 PM',
      },
    }
  )
  assert.match(html, />Plan</)
  assert.match(html, /No project context|Loading plan/)
  assert.match(html, /Hide plan pane/)
  assert.match(html, /\/…\/hermelinChat\/v2/)
  assert.match(html, /feat\/live-pane-headers/)
  assert.match(html, /29k left/)
  assert.match(html, /Aurora · just now/)
})

test('renders stacked Plan and Tasks panes with both headers visible', () => {
  const html = render({ mode: 'stacked', primaryPane: 'tasks', secondaryPane: 'plan' })
  assert.match(html, />Tasks</)
  assert.match(html, />Plan</)
  assert.match(html, /No project context|Loading tasks/)
})

test('PlanPaneView renders dark factory notes and active bead context when available', () => {
  const html = renderToStaticMarkup(createElement(PlanPaneView, {
    loading: false,
    context: {
      repo_path: '/home/inu/hermelinChat',
      has_bd: true,
      in_progress_issues: [{ id: 'hermelinChat-1di', title: 'Workspace switch restoration choreography', status: 'in_progress', priority: 1, issue_type: 'feature' }],
      ready_issues: [],
      dark_factory_notes: '## Tonight\n- tighten pane choreography',
      dark_factory_path: '/home/inu/hermelinChat-dark-factory/.dark-factory/notes.md',
      error: null,
    },
  }))

  assert.match(html, /Active bead/)
  assert.match(html, /Workspace switch restoration choreography/)
  assert.match(html, /Dark factory notes/)
  assert.match(html, /tighten pane choreography/)
})

test('TasksPaneView renders in-progress and ready issue groups from bd context', () => {
  const html = renderToStaticMarkup(createElement(TasksPaneView, {
    loading: false,
    context: {
      repo_path: '/home/inu/hermelinChat',
      has_bd: true,
      in_progress_issues: [{ id: 'hermelinChat-1di', title: 'Workspace switch restoration choreography', status: 'in_progress', priority: 1, issue_type: 'feature' }],
      ready_issues: [{ id: 'hermelinChat-0k4', title: 'Live pane/window headers', status: 'open', priority: 3, issue_type: 'feature' }],
      dark_factory_notes: null,
      dark_factory_path: null,
      error: null,
    },
  }))

  assert.match(html, /In progress/)
  assert.match(html, /Ready next/)
  assert.match(html, /Workspace switch restoration choreography/)
  assert.match(html, /Live pane\/window headers/)
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

test('SurfacePaneView shows a restoring state instead of contradicting itself when a pinned surface has not reconnected yet', () => {
  const html = renderToStaticMarkup(createElement(SurfacePaneView, {
    pinnedSurfaceId: 'surface-2',
    pinnedSurfaceTitle: 'coedit proof',
    surfaceIds: [],
  }))

  assert.match(html, /Restoring pinned surface/)
  assert.match(html, /coedit proof is pinned for this workspace\. Waiting for the live surface runtime to reconnect\./)
  assert.doesNotMatch(html, /No live surfaces/)
})
