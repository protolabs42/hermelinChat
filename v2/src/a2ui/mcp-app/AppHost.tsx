/**
 * AppHost — sandboxed iframe + MCP Apps bridge for a single McpApp component.
 *
 * Lifecycle:
 *  1. On mount: check server status in hermesMcpServers store (config-based).
 *     If `server === 'aurora-bundled'`, no server needed.
 *  2. Resolve resourceUri → HTML via resolveUiResource(uri, resolver).
 *     resolver is a closure over tauriReadResource(server, uri).
 *  3. Inject CSP meta tag into <head> based on the component's csp prop.
 *  4. Render iframe with sandbox="allow-scripts" + srcDoc.
 *  5. On iframe load: instantiate AppBridge with null client, wire manual
 *     handlers (oncalltool, onreadresource, onlistresources) that proxy
 *     through Tauri commands. Pass PostMessageTransport + theme as hostContext.
 *  6. Hook bridge.oninitialized → bridge.sendToolInput(toolInput).
 *  7. Hook bridge.onsizechange → resize iframe.
 *  8. On unmount: teardownResource, clear refs.
 */

import { useEffect, useRef, useState } from 'react'
import {
  AppBridge,
  PostMessageTransport,
} from '@modelcontextprotocol/ext-apps/app-bridge'
import type {
  CallToolResult,
  ReadResourceResult,
  ListResourcesResult,
} from '@modelcontextprotocol/sdk/types.js'
import { resolveUiResource } from './resolver'
import { buildCsp, type DeclaredCsp } from './csp'
import { getThemeContext } from './theme-bridge'
import { useHermesMcpServers } from '../../stores/hermesMcpServers'
import { useA2UI } from '../renderer/context'
import { useChatStore } from '../../stores/chat'
import {
  useCoeditStore,
  type CoeditSurfaceInstance,
} from '../../stores/coedit'
import {
  deriveCoeditSurfaceInstanceId,
  parseCoeditMessageContent,
  registerCoeditBridge,
  unregisterCoeditBridge,
} from './coedit-bridge'
import {
  tauriReadResource,
  tauriCallTool,
  tauriListResources,
  tauriSubmitCoeditPatch,
  tauriUpsertCoeditSurfaceInstance,
} from './tauri-proxy'

interface AppHostProps {
  componentId: string
  surfaceId: string
  resourceUri: string
  server: string
  height?: number
  toolInput?: Record<string, unknown>
  /** If set, AppHost calls this tool via Tauri proxy after initialization
   *  and pushes the result to the iframe via bridge.sendToolResult(). This
   *  completes the MCP Apps tool→UI flow for passive-display apps (like
   *  qr-server) that only render on tool result, not on user interaction. */
  toolName?: string
  csp?: DeclaredCsp
}

const BUNDLED_SERVER_NAME = 'aurora-bundled'
const COEDIT_PROOF_URI = 'ui://aurora-bundled/coedit-proof.html'

function toFrontendInstance(raw: Record<string, unknown>): CoeditSurfaceInstance {
  return {
    surfaceInstanceId: String(raw.surface_instance_id ?? ''),
    sessionId: String(raw.session_id ?? ''),
    surfaceId: String(raw.surface_id ?? ''),
    server: String(raw.server ?? ''),
    resourceUri: String(raw.resource_uri ?? ''),
    state: (raw.state_json ?? {}) as Record<string, unknown>,
    revision: Number(raw.revision ?? 0),
    updatedAt: Number(raw.updated_at ?? Date.now()),
    selection: null,
    pendingOutboundPatch: null,
    presence: {},
  }
}

export default function AppHost({
  componentId,
  surfaceId,
  resourceUri,
  server,
  height = 500,
  toolInput,
  toolName,
  csp,
}: AppHostProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const bridgeRef = useRef<AppBridge | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [iframeHeight, setIframeHeight] = useState<number>(height)

  const a2uiCtx = useA2UI()
  const sessionId = useChatStore((s) => s.sessionId)
  const registerInstance = useCoeditStore((s) => s.registerInstance)
  const setPresence = useCoeditStore((s) => s.setPresence)

  const isCoeditProof = resourceUri === COEDIT_PROOF_URI && !!sessionId
  const surfaceInstanceId = isCoeditProof
    ? deriveCoeditSurfaceInstanceId(sessionId, surfaceId, componentId)
    : null

  // Derive server "state" from hermesMcpServers store.
  // The new store is config-based — Rust handles connections lazily.
  // - 'ready'    → server exists and is enabled (connection happens on demand in Rust)
  // - 'disabled' → server exists but is disabled
  // - 'missing'  → server not in config
  const serverState: 'ready' | 'disabled' | 'missing' = useHermesMcpServers((s) => {
    if (server === BUNDLED_SERVER_NAME) return 'ready'
    const entry = s.servers[server]
    if (!entry) return 'missing'
    return entry.enabled ? 'ready' : 'disabled'
  })

  // 1 + 2 + 3: resolve HTML and inject CSP
  useEffect(() => {
    // Don't try to resolve until the server is known-ready
    if (server !== BUNDLED_SERVER_NAME && serverState !== 'ready') return

    let cancelled = false

    // Bundled path: no resolver needed
    // Remote path: resolver is a closure over tauriReadResource
    const resolver = server === BUNDLED_SERVER_NAME
      ? null
      : (uri: string) => tauriReadResource(server, uri)

    setError(null)
    resolveUiResource(resourceUri, resolver)
      .then((raw) => {
        if (cancelled) return
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
  }, [resourceUri, server, csp, serverState])

  // 5–7: wire AppBridge on iframe load
  const onIframeLoad = () => {
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentWindow) return

    const hostContext = getThemeContext({ maxHeight: height })

    // Always use null-client pattern — all MCP calls proxy through Tauri.
    // Capabilities always include serverTools + serverResources so the bridge
    // advertises those to the view.
    const bridge = new AppBridge(
      null,
      { name: 'aurora-chat', version: '0.1.0' },
      { openLinks: {}, serverTools: {}, serverResources: {}, logging: {} },
      { hostContext }
    )

    // Wire manual handlers for server-side MCP calls via Tauri proxy
    if (server !== BUNDLED_SERVER_NAME) {
      bridge.oncalltool = async (params, _extra): Promise<CallToolResult> => {
        const raw = await tauriCallTool(
          server,
          params.name,
          (params.arguments ?? {}) as Record<string, unknown>
        )
        // Tauri returns raw JSON. Shape it as CallToolResult.
        const typed = raw as Record<string, unknown>
        return {
          content: (typed.content ?? []) as CallToolResult['content'],
          isError: typed.isError as boolean | undefined,
        }
      }

      bridge.onreadresource = async (params, _extra): Promise<ReadResourceResult> => {
        const text = await tauriReadResource(server, params.uri)
        // Wrap the raw text string into a proper ReadResourceResult
        return {
          contents: [{ uri: params.uri, text, mimeType: 'text/html' }],
        }
      }

      bridge.onlistresources = async (_params, _extra): Promise<ListResourcesResult> => {
        const raw = await tauriListResources(server)
        const typed = raw as Record<string, unknown>
        return {
          resources: (typed.resources ?? []) as ListResourcesResult['resources'],
          nextCursor: typed.nextCursor as string | undefined,
        }
      }
    }

    bridge.oninitialized = async () => {
      if (toolInput) {
        bridge.sendToolInput({ arguments: toolInput })
      }

      if (isCoeditProof && surfaceInstanceId && sessionId) {
        try {
          const initialText = typeof toolInput?.text === 'string' ? toolInput.text : 'draft one'
          const raw = await tauriUpsertCoeditSurfaceInstance({
            surfaceInstanceId,
            sessionId,
            surfaceId,
            server,
            resourceUri,
            stateJson: { text: initialText },
            revision: 1,
          })
          const instance = toFrontendInstance(raw as Record<string, unknown>)
          registerInstance(instance)
          registerCoeditBridge(surfaceInstanceId, bridge)
          await bridge.sendToolInput({
            arguments: {
              ...(toolInput ?? {}),
              surfaceInstanceId,
              revision: instance.revision,
              text: String(instance.state.text ?? initialText),
            },
          })
        } catch (e) {
          console.error('[mcp-app] coedit bootstrap failed:', e)
        }
      }

      // If a toolName is specified, call the tool via Tauri proxy and push the
      // result to the iframe. This completes the full MCP Apps tool→UI flow for
      // passive-display apps (like qr-server) that only render on tool result.
      if (toolName && server !== BUNDLED_SERVER_NAME) {
        try {
          const raw = await tauriCallTool(server, toolName, toolInput ?? {})
          const typed = raw as Record<string, unknown>
          const result: CallToolResult = {
            content: (typed.content ?? []) as CallToolResult['content'],
            isError: typed.isError as boolean | undefined,
          }
          bridge.sendToolResult(result)
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`[mcp-app:${server}] tool call '${toolName}' failed:`, e)
        }
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
      const parsed = parseCoeditMessageContent(content)
      if (parsed && parsed.type === 'submit_patch') {
        try {
          const raw = await tauriSubmitCoeditPatch({
            surfaceInstanceId: parsed.surfaceInstanceId,
            baseRevision: parsed.localRevision,
            patch: parsed.patch,
            selection: parsed.selection ?? null,
          })
          const updated = toFrontendInstance(raw as Record<string, unknown>)
          registerInstance(updated)
          setPresence(parsed.surfaceInstanceId, 'user', 'submitted')
          a2uiCtx.emitAction({
            action: {
              name: 'mcpAppMessage',
              surfaceId,
              sourceComponentId: componentId,
              timestamp: new Date().toISOString(),
              context: {
                server,
                resourceUri,
                role,
                content,
                coedit: {
                  surfaceInstanceId: parsed.surfaceInstanceId,
                  localRevision: parsed.localRevision,
                  patch: parsed.patch,
                  selection: parsed.selection ?? null,
                  persistedRevision: updated.revision,
                },
              },
            },
          })
          return {}
        } catch (e) {
          console.error('[mcp-app] coedit submit failed:', e)
          return { isError: true }
        }
      }

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
      if (surfaceInstanceId) {
        unregisterCoeditBridge(surfaceInstanceId)
      }
    }
  }, [surfaceInstanceId])

  // Show waiting state while the server config is loading / not ready
  if (server !== BUNDLED_SERVER_NAME && serverState !== 'ready') {
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
        {serverState === 'disabled'
          ? <>MCP server <code style={{ color: 'var(--color-accent)' }}>{server}</code> is disabled. Enable it in Settings → MCP Servers.</>
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
