import { useEffect, useRef, useState } from 'react'
import { useArtifactStore, type Artifact } from '../stores/artifacts'

/* ------------------------------------------------------------------ */
/*  Type-specific icon SVGs                                           */
/* ------------------------------------------------------------------ */

function ArtifactIcon({ type }: { type: string }) {
  const kind = (type || '').toLowerCase()

  if (kind === 'table') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  )

  if (kind === 'chart') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 5-6" />
    </svg>
  )

  if (kind === 'logs') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  )

  if (kind === 'markdown') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  )

  if (kind === 'html') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )

  if (kind === 'iframe') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M14 3h7v7" />
      <path d="M21 3l-9 9" />
    </svg>
  )

  if (kind === 'map') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 6-9 13-9 13S3 16 3 10a9 9 0 1 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )

  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <div className="overflow-auto p-3">
      <table className="w-full border-collapse text-[11px] font-mono">
        {columns.length > 0 && (
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} className="px-2.5 py-1.5 border-b-2 border-(--color-border) text-left text-(--color-accent) font-semibold whitespace-nowrap">
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
                <td key={ci} className="px-2.5 py-[5px] border-b border-(--color-border) text-(--color-text)">
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
    <div className="p-3 font-mono text-[11px] leading-relaxed overflow-auto">
      {(lines as Array<Record<string, unknown> | string>).map((line, i) => {
        const entry = typeof line === 'string' ? { msg: line } : line
        const ts = String(entry.ts || entry.timestamp || '')
        const level = String(entry.level || '')
        const msg = String(entry.msg || entry.text || entry.message || line)
        const source = String(entry.source || '')
        return (
          <div key={i} className="flex gap-2" style={{ color: levelColor(level) }}>
            {ts && (
              <span className="text-(--color-muted) shrink-0">{ts}</span>
            )}
            {level && (
              <span className="shrink-0 w-10 uppercase font-semibold">
                {level}
              </span>
            )}
            {source && (
              <span className="text-(--color-muted) shrink-0">[{source}]</span>
            )}
            <span className="flex-1 whitespace-pre-wrap break-words">
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

  // Simple markdown -> HTML: headings, bold, italic, code blocks, lists, links
  const html = text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:var(--color-elevated);padding:10px 12px;border-radius:6px;overflow-x:auto;margin:8px 0;font-size:11px"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--color-elevated);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:13px;color:var(--color-text-bright);margin:12px 0 4px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:14px;color:var(--color-text-bright);margin:16px 0 6px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:16px;color:var(--color-accent);margin:0 0 8px">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--color-text-bright)">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<div style="padding-left:16px">&bull; $1</div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div style="padding-left:16px">$1. $2</div>')
    .replace(/\n\n/g, '<br/><br/>')

  return (
    <div
      className="p-4 font-mono text-xs leading-[1.7] text-(--color-text) overflow-auto"
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

function ChartRenderer({ data }: { data: unknown }) {
  return (
    <div className="p-4 overflow-auto">
      <div className="text-[10px] text-(--color-muted) mb-2 uppercase tracking-[0.05em]">
        Chart data
      </div>
      <pre className="font-mono text-[11px] leading-normal text-(--color-text) whitespace-pre-wrap break-words m-0">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

function MapRenderer({ data }: { data: unknown }) {
  return (
    <div className="p-4 overflow-auto">
      <div className="text-[10px] text-(--color-muted) mb-2 uppercase tracking-[0.05em]">
        Map data
      </div>
      <pre className="font-mono text-[11px] leading-normal text-(--color-text) whitespace-pre-wrap break-words m-0">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

function EmptyRenderer({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 p-7 text-center text-(--color-muted) font-mono">
      <div className="text-xs text-(--color-text-bright) opacity-90">{title}</div>
      <div className="text-[11px] opacity-70">{detail}</div>
    </div>
  )
}

function ArtifactBody({ artifact }: { artifact: Artifact }) {
  const kind = (artifact.artifact_type || '').toLowerCase()

  switch (kind) {
    case 'table': return <TableRenderer data={artifact.data} />
    case 'logs': return <LogsRenderer data={artifact.data} />
    case 'markdown': return <MarkdownRenderer data={artifact.data} />
    case 'html': return <HtmlRenderer data={artifact.data} id={artifact.id} />
    case 'iframe': return <IframeRenderer data={artifact.data} id={artifact.id} />
    case 'chart': return <ChartRenderer data={artifact.data} />
    case 'map': return <MapRenderer data={artifact.data} />
    default: return (
      <div className="p-4 overflow-auto">
        <pre className="font-mono text-[11px] leading-normal text-(--color-text) whitespace-pre-wrap break-words m-0">
          {JSON.stringify(artifact.data, null, 2)}
        </pre>
      </div>
    )
  }
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

export default function ArtifactPanel() {
  const artifacts = useArtifactStore((s) => s.artifacts)
  const activeId = useArtifactStore((s) => s.activeId)
  const setActiveId = useArtifactStore((s) => s.setActiveId)
  const closePanel = useArtifactStore((s) => s.closePanel)

  const activeArtifact = artifacts.find((a) => a.id === activeId) || artifacts[0] || null

  const [width, setWidth] = useState(420)
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
    const startWidth = width

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
      const next = Math.max(280, Math.min(startWidth + dx, window.innerWidth * 0.6))
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => { raf = null; setWidth(next) })
    }

    resizeCleanupRef.current = cleanup
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
  }

  return (
    <div
      className="shrink-0 border-l border-(--color-border) bg-(--color-surface) relative z-20 flex flex-col overflow-hidden min-w-0 animate-slide-right"
      style={{ width }}
    >
      {/* Resize handle (left edge) */}
      <div
        onPointerDown={handleResizePointerDown}
        title="Drag to resize"
        className="artifact-resize absolute left-0 top-0 bottom-0 w-3 cursor-col-resize z-[60] touch-none flex items-center justify-center"
      >
        <div className="w-[3px] h-[42px] rounded-full bg-(--color-border) opacity-60" />
      </div>

      {/* Header */}
      <div className="px-3 py-2.5 border-b border-(--color-border) flex items-center gap-2.5 bg-(--color-surface) relative z-40">
        {artifacts.length > 0 ? (
          <button
            ref={triggerRef}
            onClick={() => setDropdownOpen((o) => !o)}
            className="artifact-trigger flex-1 min-w-0 flex items-center gap-2 border-0 bg-transparent cursor-pointer px-2 py-1.5 -mx-2 -my-1.5 rounded-lg font-mono text-left text-(--color-text)"
            title={activeArtifact?.title || activeArtifact?.id || ''}
          >
            <span className="text-(--color-accent) flex items-center shrink-0">
              <ArtifactIcon type={activeArtifact?.artifact_type || ''} />
            </span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-(--color-text-bright) font-[650] text-xs min-w-0">
              {activeArtifact?.title || activeArtifact?.id || 'Artifacts'}
            </span>
            <div className="flex-1" />

            {activeArtifact?.live && (
              <span className="inline-flex items-center gap-1.5 text-(--color-success) text-[10px] shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-(--color-success) animate-live-pulse" />
                live
              </span>
            )}

            {activeArtifact?.persistent && (
              <span className="shrink-0 text-[9px] text-(--color-accent) border border-(--color-accent) opacity-70 px-[7px] py-px rounded-full uppercase tracking-[0.06em]">
                saved
              </span>
            )}

            {artifacts.length > 1 && (
              <span className="shrink-0 text-[9px] text-(--color-muted) border border-(--color-border) px-[7px] py-px rounded-full">
                {artifacts.length}
              </span>
            )}

            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              className="text-(--color-muted) shrink-0 transition-transform duration-[120ms]"
              style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        ) : (
          <div className="flex-1 text-xs text-(--color-text-bright) font-[650] font-mono">
            Artifacts
          </div>
        )}

        {/* Close button */}
        <button
          onClick={(e) => { e.stopPropagation(); closePanel() }}
          title="Close panel"
          className="cursor-pointer flex items-center justify-center p-1 border-0 bg-transparent text-(--color-muted) shrink-0 hover:text-(--color-text)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {dropdownOpen && artifacts.length > 0 && (
          <div
            ref={menuRef}
            className="absolute top-[calc(100%+6px)] left-2.5 right-2.5 border border-(--color-border) bg-(--color-elevated) rounded-[10px] shadow-[0_12px_28px_rgba(0,0,0,0.45)] p-1.5 z-[70] max-h-80 overflow-y-auto animate-dropdown"
          >
            {artifacts.map((artifact) => {
              const active = activeArtifact?.id === artifact.id
              return (
                <button
                  key={artifact.id}
                  onClick={() => { setActiveId(artifact.id); setDropdownOpen(false) }}
                  className="artifact-row w-full flex items-center gap-2 px-2.5 py-2 border-0 rounded-lg cursor-pointer font-mono text-left"
                  style={{
                    background: active ? 'var(--color-accent-alpha, rgba(128,128,128,0.12))' : 'transparent',
                    color: active ? 'var(--color-accent)' : 'var(--color-text)',
                    borderLeft: active ? '2px solid var(--color-accent)' : '2px solid transparent',
                  }}
                >
                  <span className="flex items-center" style={{ color: active ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                    <ArtifactIcon type={artifact.artifact_type} />
                  </span>
                  <span className={`flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] ${active ? 'text-(--color-accent)' : 'text-(--color-text-bright)'}`}>
                    {artifact.title || artifact.id}
                  </span>
                  {artifact.live && (
                    <span className="w-1.5 h-1.5 rounded-full bg-(--color-success) animate-live-pulse shrink-0" />
                  )}
                  {artifact.persistent && (
                    <span className="shrink-0 text-[9px] text-(--color-accent) opacity-70 border border-(--color-accent) px-1.5 py-px rounded-full uppercase tracking-[0.06em]">
                      saved
                    </span>
                  )}
                  <span className="shrink-0 text-[9px] text-(--color-muted) border border-(--color-border) px-1.5 py-px rounded-full uppercase tracking-[0.06em]">
                    {artifact.artifact_type}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto min-h-0">
        {activeArtifact ? (
          <ArtifactBody artifact={activeArtifact} />
        ) : (
          <EmptyRenderer title="No artifacts" detail="Ask the agent to create one" />
        )}
      </div>

      {/* Footer */}
      {activeArtifact && (
        <div className="px-3 py-1 border-t border-(--color-border) text-[9px] text-(--color-muted) opacity-50 flex justify-between gap-3 font-mono">
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
