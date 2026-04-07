/**
 * Embed components: HtmlEmbed, IframeEmbed, McpApp.
 *
 * HtmlEmbed renders an inline HTML snippet inside a sandboxed iframe via srcDoc.
 * IframeEmbed points at an external URL.
 * McpApp is a placeholder for Phase 2 — the full postMessage bridge lands in
 *   Phase 5 along with the A2UI action channel in Phase 3. For now it renders
 *   a branded "Phase 5" placeholder so the example surface still validates
 *   and lays out correctly.
 */

import type { RenderProps } from '../RenderNode'
import type {
  HtmlEmbedComponent,
  IframeEmbedComponent,
  McpAppComponent,
} from '../../types'
import { resolveDynamicString } from '../resolve'

const HtmlEmbedRender = ({ component, surface }: RenderProps) => {
  const c = component as HtmlEmbedComponent
  const html = resolveDynamicString(c.html, surface.dataModel)
  return (
    <iframe
      title={`a2ui-html-${c.id}`}
      srcDoc={html}
      sandbox="allow-scripts"
      style={{
        width: '100%',
        height: c.height ?? 300,
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        background: '#fff',
      }}
    />
  )
}

const IframeEmbedRender = ({ component, surface }: RenderProps) => {
  const c = component as IframeEmbedComponent
  const url = resolveDynamicString(c.url, surface.dataModel)
  return (
    <iframe
      title={`a2ui-iframe-${c.id}`}
      src={url}
      sandbox="allow-scripts allow-same-origin"
      style={{
        width: '100%',
        height: c.height ?? 400,
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        background: '#fff',
      }}
    />
  )
}

const McpAppRender = ({ component }: RenderProps) => {
  const c = component as McpAppComponent
  // Placeholder body — Phase 5 replaces this with a real postMessage bridge
  // to an MCP Apps server. For now we render a clearly-labeled stub so
  // example surfaces validate and lay out.
  return (
    <div
      style={{
        width: '100%',
        height: c.height ?? 500,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        background: 'var(--color-elevated)',
        border: '2px dashed var(--color-accent)',
        borderRadius: 8,
        color: 'var(--color-muted)',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 12,
      }}
    >
      <div style={{ color: 'var(--color-text-bright)', fontWeight: 600 }}>
        MCP App (placeholder)
      </div>
      <div>Phase 5 will wire this up to a real postMessage bridge.</div>
      <div style={{ marginTop: 8, fontSize: 12, textAlign: 'center' }}>
        server: <code style={{ color: 'var(--color-accent)' }}>{c.server}</code>
        <br />
        resource: <code style={{ color: 'var(--color-accent)' }}>{c.resourceUri}</code>
      </div>
    </div>
  )
}

export const EmbedComponents = {
  HtmlEmbed: HtmlEmbedRender,
  IframeEmbed: IframeEmbedRender,
  McpApp: McpAppRender,
}
