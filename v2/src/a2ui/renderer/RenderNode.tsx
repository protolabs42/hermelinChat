/**
 * RenderNode — recursive dispatcher that walks the A2UI adjacency-list
 * component tree and renders each node using a per-type React component.
 *
 * The adjacency-list model means components arrive as a flat map keyed by
 * id. We start at `root` and follow `child`/`children` references through
 * the map. Missing references render a small placeholder so a partial
 * surface degrades gracefully during streaming.
 *
 * Render-only for Phase 2 — action handlers, two-way binding writes, and
 * validation are wired in Phase 3.
 */

import type { Component, ComponentId, SurfaceState } from '../types'
import { BasicComponents } from './components/BasicComponents'
import { LayoutComponents } from './components/LayoutComponents'
import { InputComponents } from './components/InputComponents'
import { DataVizComponents } from './components/DataVizComponents'
import { EmbedComponents } from './components/EmbedComponents'

/** Shared props every component renderer receives. */
export interface RenderProps {
  component: Component
  surface: SurfaceState
  /** Called by RenderNode to render a referenced child by id. */
  renderChild: (id: ComponentId) => React.ReactNode
}

/** Registry of component type → React renderer. */
const REGISTRY: Record<string, (p: RenderProps) => React.ReactNode> = {
  // Basic display
  Text: BasicComponents.Text,
  Icon: BasicComponents.Icon,
  Divider: BasicComponents.Divider,
  Image: BasicComponents.Image,
  // Layout containers
  Column: LayoutComponents.Column,
  Row: LayoutComponents.Row,
  Card: LayoutComponents.Card,
  List: LayoutComponents.List,
  // Inputs + actions
  Button: InputComponents.Button,
  TextField: InputComponents.TextField,
  TextArea: InputComponents.TextArea,
  CheckBox: InputComponents.CheckBox,
  ChoicePicker: InputComponents.ChoicePicker,
  // Aurora Chat data viz
  Chart: DataVizComponents.Chart,
  Map: DataVizComponents.Map,
  Mermaid: DataVizComponents.Mermaid,
  Table: DataVizComponents.Table,
  Logs: DataVizComponents.Logs,
  Markdown: DataVizComponents.Markdown,
  // Embeds
  HtmlEmbed: EmbedComponents.HtmlEmbed,
  IframeEmbed: EmbedComponents.IframeEmbed,
  McpApp: EmbedComponents.McpApp,
}

export function RenderNode({
  id,
  surface,
}: {
  id: ComponentId
  surface: SurfaceState
}): React.ReactNode {
  const component = surface.components[id]
  if (!component) {
    return <MissingNode id={id} />
  }

  const Render = REGISTRY[component.component]
  if (!Render) {
    return <UnknownComponentNode component={component} />
  }

  const renderChild = (childId: ComponentId) => (
    <RenderNode key={childId} id={childId} surface={surface} />
  )

  return Render({ component, surface, renderChild })
}

function MissingNode({ id }: { id: ComponentId }) {
  return (
    <div
      style={{
        padding: 8,
        fontSize: 11,
        fontFamily: 'var(--font-mono, monospace)',
        color: 'var(--color-muted)',
        border: '1px dashed var(--color-border)',
        borderRadius: 4,
        opacity: 0.6,
      }}
    >
      Missing component: <code>{id}</code>
    </div>
  )
}

function UnknownComponentNode({ component }: { component: Component }) {
  return (
    <div
      style={{
        padding: 8,
        fontSize: 11,
        fontFamily: 'var(--font-mono, monospace)',
        color: 'var(--color-danger)',
        border: '1px dashed var(--color-danger)',
        borderRadius: 4,
      }}
    >
      Unknown component type: <code>{component.component}</code> (id: <code>{component.id}</code>)
    </div>
  )
}
