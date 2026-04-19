import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  clampArtifactPanelWidth,
  useArtifactStore,
  type Artifact,
} from '../stores/artifacts'
import { useSurfaceStore } from '../stores/surfaces'
import { useChatStore } from '../stores/chat'
import { invoke } from '@tauri-apps/api/core'
import A2UISurface from '../a2ui/renderer/A2UISurface'
import type { ActionMessage, ErrorMessage } from '../a2ui/types'
import ErrorBoundary from './ErrorBoundary'

// Lazy-loaded renderers — each pulls in its own library chunks only on first use
// so the idle bundle stays small.
const ChartRenderer = lazy(() => import('./artifacts/ChartRenderer'))
const MapRenderer = lazy(() => import('./artifacts/MapRenderer'))
const ImageRenderer = lazy(() => import('./artifacts/ImageRenderer'))
const MermaidRenderer = lazy(() => import('./artifacts/MermaidRenderer'))

function RendererFallback() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        color: 'var(--color-muted)',
        fontFamily: 'var(--font-mono, monospace)',
      }}
      className="animate-aurora-pulse"
    >
      loading renderer...
    </div>
  )
}

/**
 * Detect renderer by artifact data shape — fallback when the type field
 * doesn't match a first-class hermes type. Lets Aurora send e.g. an image
 * inside a `html` or `markdown` wrapper as long as the payload looks right.
 */
function detectShape(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (typeof d.diagram === 'string' || typeof d.mermaid === 'string') return 'mermaid'
  if (typeof d.src === 'string' && /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(String(d.src))) return 'image'
  if (typeof d.base64 === 'string') return 'image'
  if (Array.isArray(d.markers) || d.geojson) return 'map'
  return null
}

/* ------------------------------------------------------------------ */
/*  Type-specific icon SVGs                                           */
/* ------------------------------------------------------------------ */

function ArtifactIcon({ type }: { type: string }) {
  const kind = (type || '').toLowerCase()

  if (kind === 'table') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  )

  if (kind === 'chart') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 5-6" />
    </svg>
  )

  if (kind === 'logs') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  )

  if (kind === 'markdown') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  )

  if (kind === 'html') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )

  if (kind === 'iframe') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M14 3h7v7" />
      <path d="M21 3l-9 9" />
    </svg>
  )

  if (kind === 'map') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 6-9 13-9 13S3 16 3 10a9 9 0 1 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )

  if (kind === 'image') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )

  if (kind === 'mermaid') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="8" y="14" width="7" height="7" rx="1" />
      <path d="M6.5 10v2.5a1.5 1.5 0 0 0 1.5 1.5h3.5" />
      <path d="M17.5 10v2.5a1.5 1.5 0 0 1-1.5 1.5h-4.5" />
    </svg>
  )

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Artifact type renderers                                           */
/* ------------------------------------------------------------------ */

function TableRenderer({ data }: { data: unknown }) {
  if (!data || typeof data !== 'object') return <EmptyRenderer title="Table" detail="No data" />
  const d = data as { columns?: string[]; rows?: unknown[][] }
  const columns = d.columns || []
  const rows = d.rows || []

  return (
    <div style={{ overflow: 'auto', padding: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: "'Fira Code', monospace" }}>
        {columns.length > 0 && (
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} style={{
                  padding: '8px 12px',
                  borderBottom: '2px solid var(--color-border)',
                  textAlign: 'left',
                  color: 'var(--color-accent)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}>
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
                <td key={ci} style={{
                  padding: '4px 12px',
                  borderBottom: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}>
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

function LogsRenderer({ data }: { data: unknown }) {
  if (!data) return <EmptyRenderer title="Logs" detail="No log data" />
  const d = data as { lines?: Array<Record<string, unknown>> }
  const lines = d.lines || (Array.isArray(data) ? data : [])

  const levelColor = (level?: string): string => {
    const l = (level || '').toLowerCase()
    if (l === 'error' || l === 'fatal') return 'var(--color-danger)'
    if (l === 'warn' || l === 'warning') return '#f0ad4e'
    if (l === 'info') return 'var(--color-accent)'
    if (l === 'debug') return 'var(--color-muted)'
    return 'var(--color-text)'
  }

  return (
    <div style={{ padding: 12, fontFamily: "'Fira Code', monospace", fontSize: 12, lineHeight: 1.7, overflow: 'auto' }}>
      {(lines as Array<Record<string, unknown> | string>).map((line, i) => {
        const entry = typeof line === 'string' ? { msg: line } : line
        const ts = String(entry.ts || entry.timestamp || '')
        const level = String(entry.level || '')
        const msg = String(entry.msg || entry.text || entry.message || line)
        const source = String(entry.source || '')
        return (
          <div key={i} style={{ display: 'flex', gap: 8, color: levelColor(level) }}>
            {ts && (
              <span style={{ color: 'var(--color-muted)', flexShrink: 0 }}>{ts}</span>
            )}
            {level && (
              <span style={{ flexShrink: 0, width: 40, textTransform: 'uppercase', fontWeight: 600 }}>
                {level}
              </span>
            )}
            {source && (
              <span style={{ color: 'var(--color-muted)', flexShrink: 0 }}>[{source}]</span>
            )}
            <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {msg}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function MarkdownRenderer({ data }: { data: unknown }) {
  const d = data as Record<string, unknown> | null
  const text = typeof data === 'string' ? data
    : d?.content ? String(d.content)
    : d?.text ? String(d.text)
    : JSON.stringify(data, null, 2)

  // Simple markdown -> HTML
  const html = text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:var(--color-elevated);padding:12px;border-radius:8px;overflow-x:auto;margin:8px 0;font-size:12px"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--color-elevated);padding:2px 4px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:12px;color:var(--color-text-bright);margin:12px 0 4px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1em;color:var(--color-text-bright);margin:16px 0 8px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:16px;color:var(--color-accent);margin:0 0 8px">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--color-text-bright)">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<div style="padding-left:16px">&bull; $1</div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div style="padding-left:16px">$1. $2</div>')
    .replace(/\n\n/g, '<br/><br/>')

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "'Fira Code', monospace",
        fontSize: 12,
        lineHeight: 1.7,
        color: 'var(--color-text)',
        overflow: 'auto',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function HtmlRenderer({ data, id }: { data: unknown; id: string }) {
  const srcDoc = typeof data === 'string' ? data
    : (data && typeof data === 'object' && 'html' in (data as Record<string, unknown>))
      ? String((data as Record<string, unknown>).html)
      : `<pre>${JSON.stringify(data, null, 2)}</pre>`

  return (
    <iframe
      title={`artifact-${id}`}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: '#fff',
      }}
    />
  )
}

function IframeRenderer({ data, id }: { data: unknown; id: string }) {
  const src = typeof data === 'string' ? data
    : (data && typeof data === 'object' && 'url' in (data as Record<string, unknown>))
      ? String((data as Record<string, unknown>).url)
      : ''

  if (!src) return <EmptyRenderer title="Iframe" detail="No URL provided" />

  return (
    <iframe
      title={`artifact-${id}`}
      src={src}
      sandbox="allow-scripts allow-same-origin"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: '#fff',
      }}
    />
  )
}

export function EmptyRenderer({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 32,
      textAlign: 'center',
      color: 'var(--color-muted)',
    }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-bright)', opacity: 0.9 }}>{title}</div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{detail}</div>
    </div>
  )
}

function pickRenderer(artifact: Artifact) {
  // Prefer first-class type, fall back to shape detection on the payload
  const kind = (artifact.artifact_type || '').toLowerCase()
  const effective = kind || detectShape(artifact.data) || ''

  switch (effective) {
    case 'table':
      return <TableRenderer data={artifact.data} />
    case 'logs':
      return <LogsRenderer data={artifact.data} />
    case 'markdown':
      return <MarkdownRenderer data={artifact.data} />
    case 'html':
      return <HtmlRenderer data={artifact.data} id={artifact.id} />
    case 'iframe':
      return <IframeRenderer data={artifact.data} id={artifact.id} />
    case 'chart':
      return (
        <Suspense fallback={<RendererFallback />}>
          <ChartRenderer data={artifact.data} />
        </Suspense>
      )
    case 'map':
      return (
        <Suspense fallback={<RendererFallback />}>
          <MapRenderer data={artifact.data} />
        </Suspense>
      )
    case 'image':
      return (
        <Suspense fallback={<RendererFallback />}>
          <ImageRenderer data={artifact.data} />
        </Suspense>
      )
    case 'mermaid':
      return (
        <Suspense fallback={<RendererFallback />}>
          <MermaidRenderer data={artifact.data} id={artifact.id} />
        </Suspense>
      )
    default:
      return (
        <div style={{ padding: 16, overflow: 'auto' }}>
          <pre
            style={{
              fontFamily: "'Fira Code', monospace",
              fontSize: 12,
              lineHeight: 1.6,
              color: 'var(--color-text)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}
          >
            {JSON.stringify(artifact.data, null, 2)}
          </pre>
        </div>
      )
  }
}

export function ArtifactBody({ artifact }: { artifact: Artifact }) {
  const label = `${artifact.artifact_type || 'artifact'}: ${artifact.title || artifact.id}`
  // Keying the boundary by artifact id auto-resets state when the user picks
  // a different artifact, so a previously crashed renderer doesn't poison the
  // panel forever.
  return (
    <ErrorBoundary key={artifact.id} label={label} resetKeys={[artifact.id]}>
      {pickRenderer(artifact)}
    </ErrorBoundary>
  )
}

/* ------------------------------------------------------------------ */
/*  Time formatting                                                   */
/* ------------------------------------------------------------------ */

function formatTimeAgo(ts: number | null): string {
  if (!ts) return ''
  const now = Date.now() / 1000
  const diff = Math.max(0, now - ts)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/* ------------------------------------------------------------------ */
/*  Main panel                                                        */
/* ------------------------------------------------------------------ */

const ACTION_MARKER = '[[A2UI_ACTION]] '
let _panelActionSeq = 0

function sendPanelActionEnvelope(
  kind: 'action' | 'error',
  payload: ActionMessage | ErrorMessage
) {
  const sessionId = useChatStore.getState().sessionId
  if (!sessionId) return
  _panelActionSeq += 1
  const envelope = {
    kind: `a2ui_${kind}`,
    version: 'v0.9',
    seq: _panelActionSeq,
    ...(kind === 'action' ? (payload as ActionMessage) : (payload as ErrorMessage)),
  }
  invoke('acp_send_prompt', {
    sessionId,
    text: ACTION_MARKER + JSON.stringify(envelope),
  }).catch(() => {})
}

export default function ArtifactPanel() {
  const artifacts = useArtifactStore((s) => s.artifacts)
  const activeId = useArtifactStore((s) => s.activeId)
  const setActiveId = useArtifactStore((s) => s.setActiveId)
  const panelWidth = useArtifactStore((s) => s.panelWidth)
  const setPanelWidth = useArtifactStore((s) => s.setPanelWidth)
  const closePanel = useArtifactStore((s) => s.closePanel)
  const pinnedSurfaceId = useArtifactStore((s) => s.pinnedSurfaceId)
  const unpinSurface = useArtifactStore((s) => s.unpinSurface)
  const pinnedSurface = useSurfaceStore((s) =>
    pinnedSurfaceId ? s.surfaces[pinnedSurfaceId] : null
  )

  // Memoize so dropdown toggles don't generate a fresh activeArtifact reference
  // every parent render — that was forcing ArtifactBody to re-mount unnecessarily.
  const activeArtifact = useMemo(
    () => artifacts.find((a) => a.id === activeId) || artifacts[0] || null,
    [artifacts, activeId]
  )

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handleDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setDropdownOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false)
    }
    window.addEventListener('mousedown', handleDown)
    window.addEventListener('touchstart', handleDown)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleDown)
      window.removeEventListener('touchstart', handleDown)
      window.removeEventListener('keydown', handleKey)
    }
  }, [dropdownOpen])

  // Cleanup resize on unmount
  useEffect(() => {
    return () => { resizeCleanupRef.current?.() }
  }, [])

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    resizeCleanupRef.current?.()

    const handle = e.currentTarget
    const pointerId = e.pointerId
    try { handle.setPointerCapture(pointerId) } catch { /* ignore */ }

    const startX = e.clientX
    const startWidth = panelWidth

    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.body.classList.add('artifact-panel--resizing')

    let raf: number | null = null

    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
      if (raf) cancelAnimationFrame(raf)
      try { handle.releasePointerCapture(pointerId) } catch { /* ignore */ }
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
      document.body.classList.remove('artifact-panel--resizing')
      resizeCleanupRef.current = null
    }

    const handleMove = (ev: PointerEvent) => {
      if (typeof ev.buttons === 'number' && ev.buttons === 0) { cleanup(); return }
      const dx = startX - ev.clientX
      const next = clampArtifactPanelWidth(startWidth + dx, window.innerWidth)
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => { raf = null; setPanelWidth(next) })
    }

    resizeCleanupRef.current = cleanup
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
  }

  return (
    <div
      className="animate-slide-right"
      style={{
        flexShrink: 0,
        borderLeft: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        position: 'relative',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
        width: panelWidth,
      }}
    >
      {/* Resize handle (left edge) */}
      <div
        onPointerDown={handleResizePointerDown}
        title="Drag to resize"
        className="artifact-resize"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 12,
          cursor: 'col-resize',
          zIndex: 60,
          touchAction: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{
          width: 4,
          height: 40,
          borderRadius: 99,
          background: 'var(--color-border)',
          opacity: 0.6,
        }} />
      </div>

      {/* Header */}
      <div style={{
        padding: 12,
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--color-surface)',
        position: 'relative',
        zIndex: 40,
      }}>
        {artifacts.length > 0 ? (
          <button
            ref={triggerRef}
            onClick={() => setDropdownOpen((o) => !o)}
            className="artifact-trigger"
            title={activeArtifact?.title || activeArtifact?.id || ''}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
              padding: '8px 8px',
              margin: '-8px -8px',
              borderRadius: 8,
              fontFamily: "'Fira Code', monospace",
              textAlign: 'left',
              color: 'var(--color-text)',
            }}
          >
            <span style={{ color: 'var(--color-accent)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <ArtifactIcon type={activeArtifact?.artifact_type || ''} />
            </span>
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--color-text-bright)',
              fontWeight: 650,
              fontSize: 12,
              minWidth: 0,
            }}>
              {activeArtifact?.title || activeArtifact?.id || 'Artifacts'}
            </span>
            <div style={{ flex: 1 }} />

            {activeArtifact?.live && (
              <span className="animate-live-pulse" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--color-success)',
                fontSize: 10,
                flexShrink: 0,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)' }} />
                live
              </span>
            )}

            {activeArtifact?.persistent && (
              <span style={{
                flexShrink: 0,
                fontSize: 10,
                color: 'var(--color-accent)',
                border: '1px solid var(--color-accent)',
                opacity: 0.7,
                padding: '2px 8px',
                borderRadius: 99,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                saved
              </span>
            )}

            {artifacts.length > 1 && (
              <span style={{
                flexShrink: 0,
                fontSize: 10,
                color: 'var(--color-muted)',
                border: '1px solid var(--color-border)',
                padding: '2px 8px',
                borderRadius: 99,
              }}>
                {artifacts.length}
              </span>
            )}

            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              style={{
                color: 'var(--color-muted)',
                flexShrink: 0,
                transition: 'transform 120ms',
                transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        ) : (
          <div style={{
            flex: 1,
            fontSize: 12,
            color: 'var(--color-text-bright)',
            fontWeight: 650,
            fontFamily: "'Fira Code', monospace",
          }}>
            Artifacts
          </div>
        )}

        {/* Close button */}
        <button
          onClick={(e) => { e.stopPropagation(); closePanel() }}
          title="Close panel"
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            border: 0,
            background: 'transparent',
            color: 'var(--color-muted)',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {dropdownOpen && artifacts.length > 0 && (
          <div
            ref={menuRef}
            className="animate-dropdown"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 8,
              right: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-elevated)',
              borderRadius: 12,
              boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
              padding: 8,
              zIndex: 70,
              maxHeight: 320,
              overflowY: 'auto',
            }}
          >
            {artifacts.map((artifact) => {
              const active = activeArtifact?.id === artifact.id
              return (
                <button
                  key={artifact.id}
                  onClick={() => { setActiveId(artifact.id); setDropdownOpen(false) }}
                  className="artifact-row"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    border: 0,
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontFamily: "'Fira Code', monospace",
                    textAlign: 'left',
                    background: active ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent',
                    color: active ? 'var(--color-accent)' : 'var(--color-text)',
                    borderLeft: active ? '2px solid var(--color-accent)' : '2px solid transparent',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', color: active ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                    <ArtifactIcon type={artifact.artifact_type} />
                  </span>
                  <span style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 12,
                    color: active ? 'var(--color-accent)' : 'var(--color-text-bright)',
                  }}>
                    {artifact.title || artifact.id}
                  </span>
                  {artifact.live && (
                    <span className="animate-live-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} />
                  )}
                  {artifact.persistent && (
                    <span style={{
                      flexShrink: 0,
                      fontSize: 10,
                      color: 'var(--color-accent)',
                      opacity: 0.7,
                      border: '1px solid var(--color-accent)',
                      padding: '2px 8px',
                      borderRadius: 99,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}>
                      saved
                    </span>
                  )}
                  <span style={{
                    flexShrink: 0,
                    fontSize: 10,
                    color: 'var(--color-muted)',
                    border: '1px solid var(--color-border)',
                    padding: '2px 8px',
                    borderRadius: 99,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}>
                    {artifact.artifact_type}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {pinnedSurface ? (
          <div style={{ padding: 12 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-accent)',
                }}
              >
                Pinned Surface
              </div>
              <button
                onClick={unpinSurface}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--color-muted)',
                  cursor: 'pointer',
                }}
              >
                unpin
              </button>
            </div>
            <A2UISurface
              surface={pinnedSurface}
              onAction={(msg) => sendPanelActionEnvelope('action', msg)}
              onError={(msg) => sendPanelActionEnvelope('error', msg)}
            />
          </div>
        ) : activeArtifact ? (
          <ArtifactBody artifact={activeArtifact} />
        ) : (
          <EmptyRenderer title="No artifacts" detail="Ask the agent to create one" />
        )}
      </div>

      {/* Footer — hidden when showing a pinned surface */}
      {!pinnedSurface && activeArtifact && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--color-border)',
          fontSize: 10,
          color: 'var(--color-muted)',
          opacity: 0.5,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          fontFamily: "'Fira Code', monospace",
        }}>
          <span>
            {activeArtifact.timestamp ? `updated ${formatTimeAgo(activeArtifact.timestamp)}` : ''}
          </span>
          <span>
            {activeArtifact.live
              ? `auto-refresh: ${Math.max(0, Number(activeArtifact.refresh_seconds || 0))}s`
              : 'manual'}
          </span>
        </div>
      )}
    </div>
  )
}
