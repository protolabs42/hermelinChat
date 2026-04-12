/**
 * AppHost — sandboxed iframe + MCP Apps bridge for a single McpApp component.
 *
 * Lifecycle:
 *  1. On mount: look up MCP Client for the component's `server` field from
 *     the mcpClients store. If `server === 'aurora-bundled'`, no client needed.
 *  2. Resolve resourceUri → HTML via resolveUiResource(uri, client).
 *  3. Inject CSP meta tag into <head> based on the component's csp prop (or
 *     the resource's _meta.ui.csp if we ever plumb it through — Phase 5.1).
 *  4. Render iframe with sandbox="allow-scripts" + srcDoc.
 *  5. On iframe load: instantiate AppBridge with the real Client (auto-proxies
 *     tools/call + resources/read), PostMessageTransport, and current theme as
 *     hostContext. When client is null (bundled-only), pass null to AppBridge
 *     and the bundled demo's postMessage handlers will no-op for backchannel.
 *  6. Hook bridge.oninitialized → bridge.sendToolInput(toolInput).
 *  7. Hook bridge.onsizechange → resize iframe.
 *  8. On unmount: teardownResource, clear refs.
 */

import { useEffect, useRef, useState } from 'react'
import {
  AppBridge,
  PostMessageTransport,
} from '@modelcontextprotocol/ext-apps/app-bridge'
import { resolveUiResource } from './resolver'
import { buildCsp, type DeclaredCsp } from './csp'
import { getThemeContext } from './theme-bridge'
import { useMcpClientStore } from '../../stores/mcpClients'
import { useA2UI } from '../renderer/context'

interface AppHostProps {
  componentId: string
  surfaceId: string
  resourceUri: string
  server: string
  height?: number
  toolInput?: Record<string, unknown>
  csp?: DeclaredCsp
}

const BUNDLED_SERVER_NAME = 'aurora-bundled'

export default function AppHost({
  componentId,
  surfaceId,
  resourceUri,
  server,
  height = 500,
  toolInput,
  csp,
}: AppHostProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const bridgeRef = useRef<AppBridge | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [iframeHeight, setIframeHeight] = useState<number>(height)

  const a2uiCtx = useA2UI()
  const getClient = useMcpClientStore((s) => s.getClient)
  // Subscribe to this server's connection state so we re-render when it
  // transitions from 'connecting' → 'connected'. Without this, the useEffect
  // below fires once on mount (while still connecting) and locks into the
  // "not connected" error permanently.
  const serverState: string = useMcpClientStore(
    (s) => server === BUNDLED_SERVER_NAME ? 'connected' : (s.servers[server]?.state ?? 'missing')
  )

  // 1 + 2 + 3: resolve HTML and inject CSP
  // Re-runs when serverState changes (e.g. connecting → connected).
  useEffect(() => {
    // Don't try to resolve while still connecting — show loading state instead
    if (server !== BUNDLED_SERVER_NAME && serverState !== 'connected') return

    let cancelled = false
    const client = server === BUNDLED_SERVER_NAME ? null : getClient(server)
    if (server !== BUNDLED_SERVER_NAME && !client) {
      setError(`MCP server "${server}" is not connected. Add it in Settings → MCP Servers.`)
      return
    }
    // Clear any previous error from a failed attempt
    setError(null)
    resolveUiResource(resourceUri, client)
      .then((raw) => {
        if (cancelled) return
        // Only inject CSP meta tag if the component explicitly declares CSP
        // requirements via the `csp` prop. Apps that don't declare CSP run
        // unrestricted within the sandbox (sandbox="allow-scripts" is the
        // strong security wall; CSP meta tag is optional defense-in-depth).
        // This matches basic-host behavior and avoids breaking apps that
        // need 'unsafe-eval' (Three.js shaders), inline workers, etc.
        // Phase 5.2 will plumb _meta.ui.csp from the resource's metadata
        // so apps can declare their needs without the component prop.
        let injected = raw
        if (csp && Object.keys(csp).length > 0) {
          const cspText = buildCsp(csp)
          const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${cspText.replace(/"/g, '&quot;')}">`
          injected = raw.replace(/<head[^>]*>/i, (m) => m + cspMeta)
        }
        setHtml(injected)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [resourceUri, server, csp, getClient, serverState])

  // 5–7: wire AppBridge on iframe load
  const onIframeLoad = () => {
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentWindow) return

    const client = server === BUNDLED_SERVER_NAME ? null : getClient(server)

    // theme-bridge now emits BOTH Aurora's original var names AND the SDK's
    // canonical McpUiStyleVariableKey set (mapped via SPEC_KEY_MAPPING). Return
    // type is McpUiHostContext — no cast needed.
    const hostContext = getThemeContext({ maxHeight: height })

    const bridge = new AppBridge(
      client,
      { name: 'aurora-chat', version: '0.1.0' },
      client
        ? { openLinks: {}, serverTools: {}, serverResources: {}, logging: {} }
        : { openLinks: {}, logging: {} },
      { hostContext }
    )

    bridge.oninitialized = () => {
      if (toolInput) {
        bridge.sendToolInput({ arguments: toolInput })
      }
    }

    bridge.onsizechange = ({ height: h }) => {
      if (h && h > 0) setIframeHeight(h)
    }

    bridge.onopenlink = async ({ url }) => {
      if (!/^https?:\/\//.test(url)) return { isError: true }
      window.open(url, '_blank', 'noopener,noreferrer')
      return {}
    }

    bridge.onloggingmessage = ({ level, logger, data }) => {
      // eslint-disable-next-line no-console
      console[level === 'error' ? 'error' : 'log'](`[mcp-app:${server}:${logger ?? 'view'}]`, data)
    }

    // onmessage is for chat-bot style messages from the app. Relay to Aurora
    // via the A2UI action channel for any agent-side handling.
    bridge.onmessage = async ({ role, content }) => {
      a2uiCtx.emitAction({
        action: {
          name: 'mcpAppMessage',
          surfaceId,
          sourceComponentId: componentId,
          timestamp: new Date().toISOString(),
          context: { server, resourceUri, role, content },
        },
      })
      return {}
    }

    const transport = new PostMessageTransport(iframe.contentWindow, iframe.contentWindow)
    bridge.connect(transport).catch((e: Error) => {
      // eslint-disable-next-line no-console
      console.error('[mcp-app] bridge.connect failed:', e)
    })
    bridgeRef.current = bridge
  }

  // 8: teardown
  useEffect(() => {
    return () => {
      const bridge = bridgeRef.current
      if (bridge) {
        bridge.teardownResource({}).catch(() => {})
        bridgeRef.current = null
      }
    }
  }, [])

  // Show connecting state while the MCP client is still initializing
  if (server !== BUNDLED_SERVER_NAME && (serverState === 'connecting' || serverState === 'missing')) {
    return (
      <div
        style={{
          padding: 16,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 12,
          color: 'var(--color-muted)',
          background: 'var(--color-elevated)',
          border: '1px dashed var(--color-border)',
          borderRadius: 8,
        }}
      >
        {serverState === 'connecting'
          ? <>Connecting to MCP server <code style={{ color: 'var(--color-accent)' }}>{server}</code>…</>
          : <>MCP server <code style={{ color: 'var(--color-accent)' }}>{server}</code> not configured. Add it in Settings → MCP Servers.</>}
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: 16,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 12,
          color: 'var(--color-danger)',
          background: 'var(--color-elevated)',
          border: '1px dashed var(--color-danger)',
          borderRadius: 8,
        }}
      >
        MCP App error: {error}
        <br />
        <code style={{ color: 'var(--color-muted)' }}>{resourceUri}</code>
      </div>
    )
  }

  if (!html) {
    return (
      <div
        style={{
          padding: 16,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 12,
          color: 'var(--color-muted)',
          background: 'var(--color-elevated)',
          border: '1px dashed var(--color-border)',
          borderRadius: 8,
        }}
      >
        Loading MCP App from <code>{server}</code>…
      </div>
    )
  }

  return (
    <iframe
      ref={iframeRef}
      title={`mcp-app-${componentId}`}
      srcDoc={html}
      onLoad={onIframeLoad}
      sandbox="allow-scripts"
      style={{
        width: '100%',
        height: iframeHeight,
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        background: 'var(--color-bg)',
      }}
    />
  )
}
