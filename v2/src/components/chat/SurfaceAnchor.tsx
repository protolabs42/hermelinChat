/**
 * SurfaceAnchor — renders an inline A2UI surface as a chat stream entry.
 *
 * Pulls the live surface from the surface store by id, feeds it to
 * A2UISurface, and wires the onAction callback to the hermes transport
 * (marker-prefixed JSON envelope sent as a user turn via acp_send_prompt).
 *
 * Phase 4: this is the bridge between Aurora's inline UI and her brain.
 * When a button fires, the envelope rides back as a synthetic user message
 * that Aurora's system prompt teaches her to recognize and respond to.
 */

import { invoke } from '@tauri-apps/api/core'
import A2UISurface from '../../a2ui/renderer/A2UISurface'
import { useSurfaceStore } from '../../stores/surfaces'
import { useChatStore } from '../../stores/chat'
import { useArtifactStore } from '../../stores/artifacts'
import type { ActionMessage, ErrorMessage } from '../../a2ui/types'

interface Props {
  surfaceId: string
}

/**
 * Reserved marker prefix + JSON envelope. The prefix makes detection
 * trivial (substring check, no JSON.parse on every user message) while
 * the JSON payload keeps the action data unambiguous and escape-safe.
 * Aurora's system prompt teaches her to match on this exact prefix.
 */
const ACTION_MARKER = '[[A2UI_ACTION]] '

let _actionSeq = 0

function sendActionEnvelope(
  kind: 'action' | 'error',
  payload: ActionMessage | ErrorMessage
) {
  const sessionId = useChatStore.getState().sessionId
  if (!sessionId) {
    // eslint-disable-next-line no-console
    console.warn('[A2UI] no session; dropping', kind, payload)
    return
  }
  _actionSeq += 1
  const envelope = {
    kind: `a2ui_${kind}`,
    version: 'v0.9',
    seq: _actionSeq,
    ...(kind === 'action' ? (payload as ActionMessage) : (payload as ErrorMessage)),
  }
  const text = ACTION_MARKER + JSON.stringify(envelope)

  invoke('acp_send_prompt', { sessionId, text }).catch((e: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[A2UI] failed to send action envelope:', e)
  })
}

export default function SurfaceAnchor({ surfaceId }: Props) {
  const surface = useSurfaceStore((s) => s.surfaces[surfaceId])
  const pinSurface = useArtifactStore((s) => s.pinSurface)
  const isPinned = useArtifactStore((s) => s.pinnedSurfaceId === surfaceId)

  if (!surface) {
    return (
      <div
        style={{
          marginBottom: 16,
          padding: 16,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 12,
          color: 'var(--color-muted)',
          background: 'var(--color-elevated)',
          border: '1px dashed var(--color-border)',
          borderRadius: 8,
        }}
      >
        A2UI surface "{surfaceId}" is loading…
      </div>
    )
  }

  return (
    <div
      style={{
        marginBottom: 32,
        maxWidth: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
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
          Aurora · Surface
        </div>
        <button
          onClick={() => pinSurface(surfaceId)}
          title={isPinned ? 'Pinned to side panel' : 'Pin to side panel'}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: 11,
            fontFamily: 'var(--font-mono, monospace)',
            color: isPinned ? 'var(--color-accent)' : 'var(--color-muted)',
            cursor: 'pointer',
          }}
        >
          {isPinned ? 'pinned' : 'pin'}
        </button>
      </div>
      <A2UISurface
        surface={surface}
        onAction={(msg) => sendActionEnvelope('action', msg)}
        onError={(msg) => sendActionEnvelope('error', msg)}
      />
    </div>
  )
}
