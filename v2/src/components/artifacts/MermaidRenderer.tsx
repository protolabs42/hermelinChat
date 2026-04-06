/**
 * MermaidRenderer — renders Mermaid.js diagrams for artifact type "mermaid"
 * (or detects diagram content inside other types).
 *
 * Data schema (artifact.data):
 * {
 *   diagram?: string,       // the mermaid source code
 *   code?: string,          // alias for diagram
 *   text?: string,          // alias for diagram
 * }
 *
 * Also accepts a bare string as the diagram source.
 *
 * Themes are wired to Aurora Chat's theme via `themeVariables` so the graph
 * colors match the user's active palette.
 */

import { useEffect, useRef, useState, useMemo } from 'react'
import mermaid from 'mermaid'
import { useTheme } from '../../theme'

interface MermaidData {
  diagram?: string
  code?: string
  text?: string
}

function extractSource(data: unknown): string {
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const d = data as MermaidData
    return d.diagram || d.code || d.text || ''
  }
  return ''
}

export default function MermaidRenderer({ data, id }: { data: unknown; id: string }) {
  const { theme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const source = extractSource(data).trim()

  // Stable diagram ID for mermaid.render() — needs to be a valid CSS id
  const diagramId = useMemo(() => `mermaid-${id.replace(/[^a-z0-9]/gi, '-')}`, [id])

  // Initialize mermaid once per theme change
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'strict',
      fontFamily: 'var(--font-mono, monospace)',
      themeVariables: {
        // Map Aurora Chat theme to mermaid variables
        primaryColor: theme.colors.elevated,
        primaryTextColor: theme.colors.textBright,
        primaryBorderColor: theme.colors.accent,
        lineColor: theme.colors.border,
        secondaryColor: theme.colors.surface,
        tertiaryColor: theme.colors.bg,
        background: theme.colors.bg,
        mainBkg: theme.colors.elevated,
        secondBkg: theme.colors.surface,
        tertiaryBkg: theme.colors.bg,
        textColor: theme.colors.text,
        fontFamily: 'var(--font-mono, monospace)',
        nodeBorder: theme.colors.border,
        clusterBkg: theme.colors.surface,
        clusterBorder: theme.colors.border,
        edgeLabelBackground: theme.colors.bg,
        // Sequence diagram
        actorBkg: theme.colors.elevated,
        actorBorder: theme.colors.accent,
        actorTextColor: theme.colors.textBright,
        actorLineColor: theme.colors.border,
        signalColor: theme.colors.text,
        signalTextColor: theme.colors.textBright,
        labelBoxBkgColor: theme.colors.surface,
        labelBoxBorderColor: theme.colors.border,
        labelTextColor: theme.colors.text,
        loopTextColor: theme.colors.text,
        // Gantt
        sectionBkgColor: theme.colors.surface,
        altSectionBkgColor: theme.colors.elevated,
        gridColor: theme.colors.border,
        doneTaskBkgColor: theme.colors.success,
        activeTaskBkgColor: theme.colors.accent,
        activeTaskBorderColor: theme.colors.accent,
        taskBkgColor: theme.colors.elevated,
        taskTextColor: theme.colors.textBright,
        taskTextOutsideColor: theme.colors.text,
      },
    })
  }, [theme])

  // Render whenever the source or theme changes
  useEffect(() => {
    if (!source || !ref.current) return
    let cancelled = false
    setError(null)

    ;(async () => {
      try {
        const { svg } = await mermaid.render(diagramId, source)
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg
          // Make the SVG fill the container nicely
          const svgEl = ref.current.querySelector('svg')
          if (svgEl) {
            svgEl.style.maxWidth = '100%'
            svgEl.style.height = 'auto'
            svgEl.style.display = 'block'
          }
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e)
          setError(msg)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [source, theme, diagramId])

  if (!source) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 12, color: 'var(--color-text-bright)' }}>Mermaid diagram</div>
        <div style={{ fontSize: 12, opacity: 0.7, color: 'var(--color-muted)' }}>No diagram source provided</div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: 16,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 11,
          color: 'var(--color-danger)',
          overflow: 'auto',
          height: '100%',
          background: 'var(--color-bg)',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Mermaid render error</div>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 12 }}>{error}</pre>
        <div style={{ color: 'var(--color-muted)', marginBottom: 4 }}>Source:</div>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            padding: 8,
            background: 'var(--color-elevated)',
            borderRadius: 4,
            color: 'var(--color-text)',
          }}
        >
          {source}
        </pre>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: 16,
        height: '100%',
        overflow: 'auto',
        background: 'var(--color-bg)',
      }}
    >
      <div ref={ref} style={{ display: 'flex', justifyContent: 'center' }} />
    </div>
  )
}

const emptyStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: 32,
  textAlign: 'center',
  color: 'var(--color-muted)',
}
