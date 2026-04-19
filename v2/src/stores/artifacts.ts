import { create } from 'zustand'
import { useChatStore } from './chat'

export interface Artifact {
  id: string
  artifact_type: string
  title: string | null
  data: unknown
  live: boolean | null
  refresh_seconds: number | null
  timestamp: number | null
  persistent: boolean | null
  session_id: string | null
}

export const DEFAULT_ARTIFACT_PANEL_WIDTH = 420
export const MIN_ARTIFACT_PANEL_WIDTH = 280

export function clampArtifactPanelWidth(
  width: number,
  viewportWidth: number = Number.POSITIVE_INFINITY
): number {
  const maxWidth = Number.isFinite(viewportWidth)
    ? Math.max(MIN_ARTIFACT_PANEL_WIDTH, viewportWidth * 0.6)
    : Number.POSITIVE_INFINITY
  return Math.max(MIN_ARTIFACT_PANEL_WIDTH, Math.min(width, maxWidth))
}

interface ArtifactStore {
  artifacts: Artifact[]
  activeId: string | null
  panelOpen: boolean
  panelWidth: number
  /** When set, the side panel shows this A2UI surface instead of an artifact. */
  pinnedSurfaceId: string | null

  setActiveId: (id: string) => void
  setPanelWidth: (width: number) => void
  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
  /** Pin a surface to the side panel (opens it if closed). */
  pinSurface: (surfaceId: string) => void
  /** Unpin — return the panel to artifact mode. */
  unpinSurface: () => void
  replaceArtifacts: (artifacts: Artifact[]) => void

  handleEvent: (event: ArtifactEvent) => void
}

type ArtifactEvent =
  | { kind: 'Update'; artifact: Artifact }
  | { kind: 'Remove'; id: string; session_id?: string | null }
  | { kind: 'List'; artifacts: Artifact[] }

// Rust serde sends "type" (JSON key) but we use "artifact_type" in TS.
// Normalize incoming artifacts to map "type" → "artifact_type".
function normalizeArtifact(raw: Record<string, unknown>): Artifact {
  return {
    ...raw,
    artifact_type: String(raw.artifact_type || raw.type || 'unknown'),
    session_id: typeof raw.session_id === 'string' ? raw.session_id : null,
  } as Artifact
}

export function shouldAcceptArtifactEvent(
  artifact: Pick<Artifact, 'session_id'>,
  sessionId: string | null
): boolean {
  return artifact.session_id == null || artifact.session_id === sessionId
}

export function filterArtifactsForSession(
  artifacts: Artifact[],
  sessionId: string | null
): Artifact[] {
  return artifacts.filter((artifact) => shouldAcceptArtifactEvent(artifact, sessionId))
}

function nextVisibleState(
  prev: Pick<ArtifactStore, 'activeId' | 'panelOpen'>,
  artifacts: Artifact[]
): Pick<ArtifactStore, 'artifacts' | 'activeId' | 'panelOpen'> {
  const activeId = artifacts.some((artifact) => artifact.id === prev.activeId)
    ? prev.activeId
    : (artifacts[0]?.id ?? null)
  return {
    artifacts,
    activeId,
    panelOpen: artifacts.length > 0 ? prev.panelOpen : false,
  }
}

export const useArtifactStore = create<ArtifactStore>((set) => ({
  artifacts: [],
  activeId: null,
  panelOpen: false,
  panelWidth: DEFAULT_ARTIFACT_PANEL_WIDTH,
  pinnedSurfaceId: null,

  setActiveId: (id) => set({ activeId: id }),
  setPanelWidth: (width) => set({ panelWidth: clampArtifactPanelWidth(width) }),
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  pinSurface: (surfaceId) => set({ pinnedSurfaceId: surfaceId, panelOpen: true }),
  unpinSurface: () => set({ pinnedSurfaceId: null }),
  replaceArtifacts: (artifacts) => set((s) => nextVisibleState(s, artifacts)),

  handleEvent: (event) => {
    const currentSessionId = useChatStore.getState().sessionId
    switch (event.kind) {
      case 'Update': {
        const artifact = normalizeArtifact(event.artifact as unknown as Record<string, unknown>)
        if (!shouldAcceptArtifactEvent(artifact, currentSessionId)) return
        set((s) => {
          const filtered = s.artifacts.filter((a) => a.id !== artifact.id)
          const next = [artifact, ...filtered]
          const activeId = s.activeId || artifact.id
          return { artifacts: next, activeId, panelOpen: true }
        })
        break
      }
      case 'Remove': {
        if (event.session_id != null && event.session_id !== currentSessionId) return
        set((s) => {
          const next = s.artifacts.filter((a) => a.id !== event.id)
          const activeId = s.activeId === event.id ? (next[0]?.id || null) : s.activeId
          return { artifacts: next, activeId, panelOpen: next.length > 0 ? s.panelOpen : false }
        })
        break
      }
      case 'List': {
        const artifacts = filterArtifactsForSession(
          event.artifacts.map((a) => normalizeArtifact(a as unknown as Record<string, unknown>)),
          currentSessionId
        )
        set((s) => nextVisibleState(s, artifacts))
        break
      }
    }
  },
}))
