import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { AcpEvent } from '../types/acp'
import { useChatStore } from '../stores/chat'
import { useArtifactStore } from '../stores/artifacts'
import { useSurfaceStore, type A2UIEvent, type A2UIBatch } from '../stores/surfaces'

export function useAcpEvents() {
  useEffect(() => {
    const unlistenAcp = listen<AcpEvent>('acp:event', (event) => {
      useChatStore.getState().handleAcpEvent(event.payload)
    })

    const unlistenArtifact = listen('artifact:event', (event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useArtifactStore.getState().handleEvent(event.payload as any)
    })

    const unlistenA2ui = listen<A2UIEvent>('a2ui:event', (event) => {
      const payload = event.payload
      useSurfaceStore.getState().handleEvent(payload)
      // On createSurface messages, inject a chat-stream anchor so the
      // surface renders inline with the assistant turn that produced it.
      if (payload.kind === 'Batch') {
        for (const msg of payload.batch.messages) {
          if (msg && typeof msg === 'object' && 'createSurface' in msg) {
            const cs = (msg as { createSurface: { surfaceId: string } }).createSurface
            useChatStore.getState().addSurfaceAnchor(cs.surfaceId)
          }
        }
      }
    })

    // Query current status on mount (events may have fired before listeners registered)
    invoke<string>('acp_status').then((status) => {
      useChatStore.setState({ connectionStatus: status })
    }).catch(() => {})

    // Load existing artifacts on mount
    invoke<Array<Record<string, unknown>>>('list_artifacts').then((artifacts) => {
      if (artifacts.length > 0) {
        useArtifactStore.getState().handleEvent({
          kind: 'List',
          artifacts: artifacts as never[],
        })
      }
    }).catch(() => {})

    // Load existing A2UI batches on mount
    invoke<A2UIBatch[]>('list_a2ui_batches').then((batches) => {
      if (batches.length > 0) {
        useSurfaceStore.getState().handleEvent({ kind: 'List', batches })
        // Inject chat anchors for any surfaces that exist
        const ordered = useSurfaceStore.getState().orderedIds
        for (const id of ordered) {
          useChatStore.getState().addSurfaceAnchor(id)
        }
      }
    }).catch(() => {})

    return () => {
      unlistenAcp.then((fn) => fn())
      unlistenArtifact.then((fn) => fn())
      unlistenA2ui.then((fn) => fn())
    }
  }, [])
}
