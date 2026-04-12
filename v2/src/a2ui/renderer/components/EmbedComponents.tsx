/**
 * Embed components: HtmlEmbed, IframeEmbed, McpApp.
 *
 * HtmlEmbed renders an inline HTML snippet inside a sandboxed iframe via srcDoc.
 * IframeEmbed points at an external URL.
 * McpApp dispatches to the full MCP Apps host (v2/src/a2ui/mcp-app/AppHost.tsx)
 *   which wires a sandboxed iframe + @modelcontextprotocol/ext-apps AppBridge
 *   against the McpApp component's named MCP server (landed in Phase 5).
 */

import type { RenderProps } from '../RenderNode'
import type {
  HtmlEmbedComponent,
  IframeEmbedComponent,
  McpAppComponent,
} from '../../types'
import { resolveDynamicString } from '../resolve'
import AppHost from '../../mcp-app/AppHost'

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

const McpAppRender = ({ component, surface }: RenderProps) => {
  const c = component as McpAppComponent
  return (
    <AppHost
      componentId={c.id}
      surfaceId={surface.surfaceId}
      resourceUri={c.resourceUri}
      server={c.server}
      height={c.height}
      toolInput={c.toolInput}
      toolName={c.toolName}
    />
  )
}

export const EmbedComponents = {
  HtmlEmbed: HtmlEmbedRender,
  IframeEmbed: IframeEmbedRender,
  McpApp: McpAppRender,
}
