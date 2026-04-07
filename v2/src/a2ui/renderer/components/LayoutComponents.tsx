/**
 * Layout container components: Column, Row, Card, List.
 *
 * All use flexbox with 4px-grid gap values. Containers resolve their
 * children via the shared RenderNode dispatcher, which handles both
 * static `ComponentId[]` and template-iteration `{path, componentId}`
 * child lists.
 *
 * For Phase 2, template iteration (List over a `{path, componentId}`)
 * is implemented but collection-scope relative paths aren't — the
 * template resolves bindings from the root data model. Full collection
 * scope lands in Phase 3 alongside the action channel.
 */

import type { RenderProps } from '../RenderNode'
import type {
  CardComponent,
  ColumnComponent,
  ListComponent,
  RowComponent,
  ComponentId,
  ChildList,
} from '../../types'
import { resolveDynamicString, resolvePointer } from '../resolve'

/* Map justify/align enum → flexbox values. */
const justifyMap: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
}
const alignMap: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
}

/** Resolve a ChildList to a concrete array of ComponentIds. */
function resolveChildren(
  children: ChildList | undefined,
  dataModel: unknown
): ComponentId[] {
  if (!children) return []
  if (Array.isArray(children)) return children
  if (typeof children === 'object' && 'path' in children && 'componentId' in children) {
    // Template iteration: {path, componentId}. Resolve the path to an
    // array, then emit N copies of the template component id. Phase 2
    // renders them as identical clones since we don't have collection
    // scope yet; Phase 3 will parameterize per-row.
    const arr = resolvePointer(children.path, dataModel)
    if (Array.isArray(arr)) {
      return arr.map(() => children.componentId)
    }
  }
  return []
}

const ColumnRender = ({ component, surface, renderChild }: RenderProps) => {
  const c = component as ColumnComponent
  const ids = resolveChildren(c.children, surface.dataModel)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: c.gap ?? 8,
        justifyContent: justifyMap[c.justify ?? 'start'],
        alignItems: alignMap[c.align ?? 'stretch'],
        width: '100%',
      }}
    >
      {ids.map((id, i) => (
        <div key={`${id}-${i}`}>{renderChild(id)}</div>
      ))}
    </div>
  )
}

const RowRender = ({ component, surface, renderChild }: RenderProps) => {
  const c = component as RowComponent
  const ids = resolveChildren(c.children, surface.dataModel)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: c.gap ?? 8,
        justifyContent: justifyMap[c.justify ?? 'start'],
        alignItems: alignMap[c.align ?? 'center'],
        flexWrap: c.wrap ? 'wrap' : 'nowrap',
        width: '100%',
      }}
    >
      {ids.map((id, i) => (
        <div key={`${id}-${i}`}>{renderChild(id)}</div>
      ))}
    </div>
  )
}

const CardRender = ({ component, surface, renderChild }: RenderProps) => {
  const c = component as CardComponent
  const title = c.title ? resolveDynamicString(c.title, surface.dataModel) : undefined
  const subtitle = c.subtitle ? resolveDynamicString(c.subtitle, surface.dataModel) : undefined

  const variantStyle: React.CSSProperties =
    c.variant === 'outlined'
      ? {
          background: 'transparent',
          border: '1px solid var(--color-border)',
        }
      : c.variant === 'ghost'
      ? {
          background: 'transparent',
          border: 0,
        }
      : {
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
        }

  return (
    <div
      style={{
        ...variantStyle,
        borderRadius: 12,
        padding: 16,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {(title || subtitle) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {title && (
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--color-text-bright)',
                fontFamily: 'var(--font-sans, system-ui, sans-serif)',
              }}
            >
              {title}
            </div>
          )}
          {subtitle && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-muted)',
                fontFamily: 'var(--font-sans, system-ui, sans-serif)',
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      )}
      <div>{renderChild(c.child)}</div>
    </div>
  )
}

const ListRender = ({ component, surface, renderChild }: RenderProps) => {
  const c = component as ListComponent
  const ids = resolveChildren(c.children, surface.dataModel)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: c.gap ?? 8,
        overflowY: 'auto',
        maxHeight: c.maxHeight,
        width: '100%',
      }}
    >
      {ids.map((id, i) => (
        <div key={`${id}-${i}`}>{renderChild(id)}</div>
      ))}
    </div>
  )
}

export const LayoutComponents = {
  Column: ColumnRender,
  Row: RowRender,
  Card: CardRender,
  List: ListRender,
}
