import type { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge'
import type { PatchOp, TextSelectionRange } from '../../stores/coedit'

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

const coeditBridges = new Map<string, AppBridge>()

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
