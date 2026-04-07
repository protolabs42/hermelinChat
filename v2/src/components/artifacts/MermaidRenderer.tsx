/**
 * MermaidRenderer — renders Mermaid.js diagrams for artifact type "mermaid"
 * (or detects diagram content inside other types).
 *
 * Data schema (artifact.data):
 * {
 *   diagram?: string,       // the mermaid source code
 *   code?: string,          // alias
 *   text?: string,          // alias
 * }
 *
 * Also accepts a bare string as the diagram source.
 *
 * The diagram is rendered inside a ZoomPanFrame so users can pan/zoom around
 * large flowcharts. Theming is wired to the active Aurora Chat theme via
 * `themeVariables` plus a custom `themeCSS` block for the visual polish that
 * variables alone can't reach (font weights, drop shadows, edge contrast).
 */

import { useEffect, useRef, useState, useMemo } from 'react'
import mermaid from 'mermaid'
import { useTheme } from '../../theme'
import ZoomPanFrame from './ZoomPanFrame'

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

/** Return a CSS color expression that mixes two theme colors. Used for
 *  generating subtler variants without hardcoding hex values. */
function mix(a: string, b: string, pct: number): string {
  return `color-mix(in srgb, ${a} ${pct}%, ${b})`
}

export default function MermaidRenderer({ data, id }: { data: unknown; id: string }) {
  const { theme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const source = extractSource(data).trim()

  // Stable diagram ID for mermaid.render() — needs to be a valid CSS id
  const diagramId = useMemo(() => `mermaid-${id.replace(/[^a-z0-9]/gi, '-')}`, [id])

  // Initialize mermaid once per theme change. We use the 'base' theme so all
  // colors come from themeVariables (no fighting against built-in defaults),
  // then layer themeCSS on top for typography and effects that variables
  // can't express.
  useEffect(() => {
    const c = theme.colors
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'strict',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      themeVariables: {
        // Core
        background: c.bg,
        primaryColor: c.elevated,
        primaryTextColor: c.textBright,
        primaryBorderColor: c.accent,
        secondaryColor: c.surface,
        secondaryTextColor: c.text,
        secondaryBorderColor: c.border,
        tertiaryColor: c.bg,
        tertiaryTextColor: c.text,
        tertiaryBorderColor: c.border,

        lineColor: c.accent,
        textColor: c.text,
        mainBkg: c.elevated,
        secondBkg: c.surface,
        tertiaryBkg: c.bg,
        nodeBorder: c.accent,
        clusterBkg: c.surface,
        clusterBorder: c.border,
        defaultLinkColor: c.muted,
        titleColor: c.textBright,
        edgeLabelBackground: c.bg,
        nodeTextColor: c.textBright,

        // Sequence diagram
        actorBkg: c.elevated,
        actorBorder: c.accent,
        actorTextColor: c.textBright,
        actorLineColor: c.accent,
        signalColor: c.text,
        signalTextColor: c.textBright,
        labelBoxBkgColor: c.surface,
        labelBoxBorderColor: c.border,
        labelTextColor: c.text,
        loopTextColor: c.textBright,
        activationBkgColor: mix(c.accent, c.bg, 30),
        activationBorderColor: c.accent,
        sequenceNumberColor: c.bg,
        noteBkgColor: mix(c.accent, c.bg, 15),
        noteTextColor: c.textBright,
        noteBorderColor: c.accent,

        // Gantt
        sectionBkgColor: c.surface,
        altSectionBkgColor: c.elevated,
        sectionBkgColor2: c.elevated,
        gridColor: c.border,
        doneTaskBkgColor: mix(c.success, c.bg, 60),
        doneTaskBorderColor: c.success,
        activeTaskBkgColor: c.accent,
        activeTaskBorderColor: c.accent,
        taskBkgColor: mix(c.elevated, c.surface, 50),
        taskBorderColor: c.accent,
        taskTextColor: c.textBright,
        taskTextOutsideColor: c.text,
        taskTextLightColor: c.textBright,
        taskTextDarkColor: c.bg,
        taskTextClickableColor: c.accent,

        // State / class / ER
        stateBkg: c.elevated,
        stateBorder: c.accent,
        compositeBackground: c.surface,
        compositeBorder: c.border,
        compositeTitleBackground: c.surface,
        altBackground: c.bg,

        classText: c.textBright,

        relationColor: c.accent,
        relationLabelBackground: c.bg,
        relationLabelColor: c.text,

        // Pie / quadrant — for completeness
        pie1: c.accent,
        pie2: c.info,
        pie3: c.success,
        pie4: c.purple,
        pie5: c.cyan,
        pie6: c.danger,
        pieTitleTextSize: '14px',
        pieTitleTextColor: c.textBright,
        pieSectionTextColor: c.textBright,
        pieSectionTextSize: '12px',
      },
      themeCSS: `
        /* Typography */
        .nodeLabel, .edgeLabel, .label, .messageText, .actor, .actor-line, .activation0, .activation1, .activation2,
        .titleText, .taskText, .sectionTitle, .stateLabel, .classLabel, .erLabel, text {
          font-family: var(--font-sans, system-ui, sans-serif) !important;
          font-size: 13px !important;
          font-weight: 500 !important;
        }
        .titleText { font-size: 16px !important; font-weight: 600 !important; }
        .label foreignObject div { line-height: 1.4 !important; }

        /* Nodes — give them subtle elevation */
        .node rect, .node polygon, .node circle, .node ellipse, .node path {
          stroke-width: 1.5px !important;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25));
        }
        .cluster rect {
          stroke-width: 1px !important;
          rx: 8px !important;
          ry: 8px !important;
        }

        /* Edges — slightly bolder, accent-colored arrowheads */
        .edgePath .path, .flowchart-link {
          stroke-width: 1.5px !important;
        }
        .arrowheadPath, marker path {
          fill: ${theme.colors.accent} !important;
          stroke: ${theme.colors.accent} !important;
        }

        /* Edge labels — solid bg so they don't blend into lines */
        .edgeLabel {
          background-color: ${theme.colors.bg} !important;
          padding: 2px 6px !important;
          border-radius: 4px !important;
        }
        .edgeLabel rect {
          fill: ${theme.colors.bg} !important;
        }

        /* Sequence diagrams */
        .actor {
          stroke-width: 1.5px !important;
          filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3));
        }
        .messageLine0, .messageLine1 {
          stroke-width: 1.5px !important;
        }
        .note {
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }

        /* Gantt — subtle row separation */
        .grid .tick line {
          stroke: ${theme.colors.border} !important;
          stroke-dasharray: 2 4 !important;
        }
        .section0, .section2 { fill: ${theme.colors.surface} !important; }
        .section1, .section3 { fill: ${theme.colors.elevated} !important; }
      `,
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true,
        curve: 'basis',
        padding: 16,
        nodeSpacing: 50,
        rankSpacing: 60,
      },
      sequence: {
        useMaxWidth: false,
        diagramMarginX: 32,
        diagramMarginY: 16,
        boxMargin: 8,
        actorMargin: 60,
        messageMargin: 36,
      },
      gantt: {
        useMaxWidth: false,
      },
      class: { useMaxWidth: false },
      state: { useMaxWidth: false },
      er: { useMaxWidth: false },
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
        if (cancelled || !ref.current) return
        ref.current.innerHTML = svg
        const svgEl = ref.current.querySelector('svg')
        if (svgEl) {
          // Let the SVG be its natural size — ZoomPanFrame handles scaling
          svgEl.removeAttribute('width')
          svgEl.removeAttribute('height')
          svgEl.style.maxWidth = 'none'
          svgEl.style.height = 'auto'
          svgEl.style.display = 'block'
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
        <div style={{ fontSize: 12, opacity: 0.7, color: 'var(--color-muted)' }}>
          No diagram source provided
        </div>
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
    <ZoomPanFrame initialScale={1} minScale={0.2} maxScale={6}>
      <div ref={ref} style={{ display: 'inline-block', padding: 24 }} />
    </ZoomPanFrame>
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
