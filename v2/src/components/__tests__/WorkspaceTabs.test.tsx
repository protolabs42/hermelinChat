import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import WorkspaceTabs from '../WorkspaceTabs'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('WorkspaceTabs')

test('renders visible tabs, + workspace, and overflow affordance', () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceTabs, {
      tabs: [
        { workspaceId: 'forge', label: 'forge', hint: 'Working in surface-a', tone: 'active', isActive: true },
        { workspaceId: 'research', label: 'research', hint: '2 unresolved remembered', tone: 'ready', isActive: false },
      ],
      overflowCount: 3,
      onCreateWorkspace: () => {},
      onOpenOverflow: () => {},
      onSelectWorkspace: () => {},
    })
  )

  assert.match(html, />forge</)
  assert.match(html, />research</)
  assert.match(html, />\+ workspace</)
  assert.match(html, />\+3 more</)
  assert.match(html, /Working in surface-a/)
  assert.match(html, /2 unresolved remembered/)
  assert.match(html, /aria-label="Switch to workspace forge"/)
})

console.log('✓ all WorkspaceTabs tests passed')
