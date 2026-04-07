/**
 * Aurora Chat data-viz extensions: Chart, Map, Mermaid, Table, Logs, Markdown.
 *
 * Each component here is a thin adapter that maps A2UI component props to the
 * data shape the existing renderer (ChartRenderer, MermaidRenderer, MapRenderer,
 * etc.) expects. This is the whole point of Phase 2 — we're reusing 100% of the
 * Phase 1 (old) renderer work as the implementations of the new catalog.
 *
 * Each adapter resolves any JSON Pointer bindings against the surface's data
 * model before handing off to the concrete renderer.
 */

import { lazy, Suspense } from 'react'
import type { RenderProps } from '../RenderNode'
import type {
  ChartComponent,
  MapComponent,
  MermaidComponent,
  TableComponent,
  LogsComponent,
  MarkdownComponent,
} from '../../types'
import { resolveAnyField, resolveDynamicString } from '../resolve'

// Reuse existing renderers lazily — keeps the main bundle small and lets each
// renderer's heavy deps (recharts, mermaid, leaflet) ship as separate chunks.
const ChartRenderer = lazy(() => import('../../../components/artifacts/ChartRenderer'))
const MapRenderer = lazy(() => import('../../../components/artifacts/MapRenderer'))
const MermaidRenderer = lazy(() => import('../../../components/artifacts/MermaidRenderer'))

function RendererFallback() {
  return (
    <div
      className="animate-aurora-pulse"
      style={{
        padding: 16,
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--color-muted)',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      loading renderer...
    </div>
  )
}

const ChartRender = ({ component, surface }: RenderProps) => {
  const c = component as ChartComponent
  const data = resolveAnyField(c.data, surface.dataModel)
  const title = c.title ? resolveDynamicString(c.title, surface.dataModel) : undefined
  return (
    <div style={{ height: 320, width: '100%' }}>
      <Suspense fallback={<RendererFallback />}>
        <ChartRenderer
          data={{
            kind: c.kind,
            data,
            xKey: c.xKey,
            series: c.series,
            title,
            yLabel: c.yLabel,
            stacked: c.stacked,
          }}
        />
      </Suspense>
    </div>
  )
}

const MapRender = ({ component, surface }: RenderProps) => {
  const c = component as MapComponent
  const center = resolveAnyField(c.center, surface.dataModel)
  const markers = resolveAnyField(c.markers, surface.dataModel)
  const geojson = resolveAnyField(c.geojson, surface.dataModel)
  return (
    <div style={{ height: 400, width: '100%' }}>
      <Suspense fallback={<RendererFallback />}>
        <MapRenderer
          data={{
            center,
            zoom: c.zoom,
            markers,
            geojson,
            tiles: c.tiles,
          }}
        />
      </Suspense>
    </div>
  )
}

const MermaidRender = ({ component, surface }: RenderProps) => {
  const c = component as MermaidComponent
  const diagram = resolveDynamicString(c.diagram, surface.dataModel)
  return (
    <div style={{ height: 400, width: '100%' }}>
      <Suspense fallback={<RendererFallback />}>
        <MermaidRenderer data={{ diagram }} id={c.id} />
      </Suspense>
    </div>
  )
}

const TableRender = ({ component, surface }: RenderProps) => {
  const c = component as TableComponent
  const columns = (resolveAnyField(c.columns, surface.dataModel) as unknown[]) || []
  const rows = (resolveAnyField(c.rows, surface.dataModel) as unknown[][]) || []

  return (
    <div style={{ overflow: 'auto', maxWidth: '100%' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {columns.length > 0 && (
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  style={{
                    padding: '8px 12px',
                    borderBottom: '2px solid var(--color-border)',
                    textAlign: 'left',
                    color: 'var(--color-accent)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {String(col)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {(Array.isArray(row) ? row : [row]).map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: '4px 12px',
                    borderBottom: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                >
                  {String(cell ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const LogsRender = ({ component, surface }: RenderProps) => {
  const c = component as LogsComponent
  const lines = (resolveAnyField(c.lines, surface.dataModel) as unknown[]) || []

  const levelColor = (level?: string): string => {
    const l = (level || '').toLowerCase()
    if (l === 'error' || l === 'fatal') return 'var(--color-danger)'
    if (l === 'warn' || l === 'warning') return '#f0ad4e'
    if (l === 'info') return 'var(--color-accent)'
    if (l === 'debug') return 'var(--color-muted)'
    return 'var(--color-text)'
  }

  return (
    <div
      style={{
        padding: 12,
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 12,
        lineHeight: 1.7,
        overflow: 'auto',
        maxHeight: 400,
        background: 'var(--color-elevated)',
        borderRadius: 8,
      }}
    >
      {lines.map((line, i) => {
        const entry = typeof line === 'string' ? { msg: line } : (line as Record<string, unknown>)
        const ts = String(entry.ts || entry.timestamp || '')
        const level = String(entry.level || '')
        const msg = String(entry.msg || entry.text || entry.message || line)
        const source = String(entry.source || '')
        return (
          <div key={i} style={{ display: 'flex', gap: 8, color: levelColor(level) }}>
            {ts && <span style={{ color: 'var(--color-muted)', flexShrink: 0 }}>{ts}</span>}
            {level && (
              <span style={{ flexShrink: 0, width: 40, textTransform: 'uppercase', fontWeight: 600 }}>
                {level}
              </span>
            )}
            {source && <span style={{ color: 'var(--color-muted)', flexShrink: 0 }}>[{source}]</span>}
            <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg}</span>
          </div>
        )
      })}
    </div>
  )
}

const MarkdownRender = ({ component, surface }: RenderProps) => {
  const c = component as MarkdownComponent
  const content = resolveDynamicString(c.content, surface.dataModel)
  // Basic markdown → HTML. Kept simple on purpose — we can switch to a
  // proper library (marked, remark) later if complex docs appear.
  const html = content
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:var(--color-elevated);padding:12px;border-radius:8px;overflow-x:auto;margin:8px 0;font-size:12px"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--color-elevated);padding:2px 4px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:12px;color:var(--color-text-bright);margin:12px 0 4px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:16px;color:var(--color-text-bright);margin:16px 0 8px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:20px;color:var(--color-accent);margin:0 0 8px">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--color-text-bright)">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<div style="padding-left:16px">&bull; $1</div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div style="padding-left:16px">$1. $2</div>')
    .replace(/\n\n/g, '<br/><br/>')

  return (
    <div
      style={{
        padding: 16,
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        fontSize: 13,
        lineHeight: 1.5,
        color: 'var(--color-text)',
        background: 'var(--color-surface)',
        borderRadius: 8,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export const DataVizComponents = {
  Chart: ChartRender,
  Map: MapRender,
  Mermaid: MermaidRender,
  Table: TableRender,
  Logs: LogsRender,
  Markdown: MarkdownRender,
}
