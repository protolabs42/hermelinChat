import type { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge'
import { useCoeditStore, type PatchOp, type TextSelectionRange } from '../../stores/coedit'
import { tauriApplyHostPatch } from './tauri-proxy'

export interface ParsedCoeditMessage {
  type: 'submit_patch'
  surfaceInstanceId: string
  localRevision: number
  patch: PatchOp[]
  selection?: TextSelectionRange | null
}

export interface HostPatchNotification {
  patch: PatchOp[]
  newRevision: number
  authoredBy: string
}

export interface HostPatchEnvelope extends HostPatchNotification {
  surfaceInstanceId: string
  baseRevision: number
}

export interface ParsedCoeditPatchMarker {
  raw: string
  envelope: HostPatchEnvelope
}

const COEDIT_PATCH_RE = /\[\[COEDIT_PATCH\]\]\s*(\{[^\n]+\})/g
const coeditBridges = new Map<string, AppBridge>()

function isHostPatchEnvelope(value: unknown): value is HostPatchEnvelope {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.surfaceInstanceId === 'string' &&
    typeof candidate.baseRevision === 'number' &&
    Array.isArray(candidate.patch) &&
    typeof candidate.authoredBy === 'string'
  )
}

function toFrontendInstance(raw: Record<string, unknown>) {
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

export function deriveCoeditSurfaceInstanceId(
  sessionId: string,
  surfaceId: string,
  componentId: string
): string {
  return `${sessionId}:${surfaceId}:${componentId}`
}

export function parseCoeditMessageContent(content: unknown): ParsedCoeditMessage | null {
  if (!Array.isArray(content)) return null
  const textBlock = content.find(
    (block) => block && typeof block === 'object' && 'type' in block && (block as { type?: string }).type === 'text'
  ) as { text?: string } | undefined
  if (!textBlock?.text) return null
  try {
    const parsed = JSON.parse(textBlock.text) as ParsedCoeditMessage
    if (
      parsed?.type === 'submit_patch' &&
      typeof parsed.surfaceInstanceId === 'string' &&
      typeof parsed.localRevision === 'number' &&
      Array.isArray(parsed.patch)
    ) {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

export function parseCoeditPatchMarkers(text: string): ParsedCoeditPatchMarker[] {
  const matches: ParsedCoeditPatchMarker[] = []
  const regex = new RegExp(COEDIT_PATCH_RE)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const raw = match[0]
    const jsonText = match[1]
    try {
      const parsed = JSON.parse(jsonText) as unknown
      if (isHostPatchEnvelope(parsed)) {
        matches.push({ raw, envelope: parsed })
      }
    } catch {
      // partial stream or malformed marker — ignore
    }
  }
  return matches
}

export function registerCoeditBridge(surfaceInstanceId: string, bridge: AppBridge): void {
  coeditBridges.set(surfaceInstanceId, bridge)
}

export function unregisterCoeditBridge(surfaceInstanceId: string): void {
  coeditBridges.delete(surfaceInstanceId)
}

export async function sendHostPatchNotification(
  surfaceInstanceId: string,
  params: HostPatchNotification
): Promise<void> {
  const bridge = coeditBridges.get(surfaceInstanceId)
  if (!bridge) throw new Error(`unknown coedit bridge: ${surfaceInstanceId}`)
  await (bridge as unknown as {
    notification: (message: { method: string; params: unknown }) => Promise<void>
  }).notification({
    method: 'ui/notifications/host-patch',
    params,
  })
}

export async function applyHostPatchEnvelope(envelope: HostPatchEnvelope): Promise<void> {
  try {
    const raw = await tauriApplyHostPatch({
      surfaceInstanceId: envelope.surfaceInstanceId,
      baseRevision: envelope.baseRevision,
      patch: envelope.patch,
      authoredBy: envelope.authoredBy,
    })
    const updated = toFrontendInstance(raw as Record<string, unknown>)
    useCoeditStore.getState().registerInstance(updated)
    await sendHostPatchNotification(envelope.surfaceInstanceId, {
      patch: envelope.patch,
      newRevision: updated.revision,
      authoredBy: envelope.authoredBy,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('revision conflict')) {
      console.warn('[coedit] stale host patch ignored:', envelope)
      return
    }
    console.error('[coedit] failed to apply host patch envelope:', error)
  }
}
