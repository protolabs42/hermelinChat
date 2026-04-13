import { create } from 'zustand'

export interface Artifact {
  id: string
  artifact_type: string
  title: string | null
  data: unknown
  live: boolean | null
  refresh_seconds: number | null
  timestamp: number | null
  persistent: boolean | null
}

interface ArtifactStore {
  artifacts: Artifact[]
  activeId: string | null
  panelOpen: boolean
  /** When set, the side panel shows this A2UI surface instead of an artifact. */
  pinnedSurfaceId: string | null

  setActiveId: (id: string) => void
  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
  /** Pin a surface to the side panel (opens it if closed). */
  pinSurface: (surfaceId: string) => void
  /** Unpin — return the panel to artifact mode. */
  unpinSurface: () => void

  handleEvent: (event: ArtifactEvent) => void
}

type ArtifactEvent =
  | { kind: 'Update'; artifact: Artifact }
  | { kind: 'Remove'; id: string }
  | { kind: 'List'; artifacts: Artifact[] }

// Rust serde sends "type" (JSON key) but we use "artifact_type" in TS.
// Normalize incoming artifacts to map "type" → "artifact_type".
function normalizeArtifact(raw: Record<string, unknown>): Artifact {
  return {
    ...raw,
    artifact_type: String(raw.artifact_type || raw.type || 'unknown'),
  } as Artifact
}

export const useArtifactStore = create<ArtifactStore>((set) => ({
  artifacts: [],
  activeId: null,
  panelOpen: false,
  pinnedSurfaceId: null,

  setActiveId: (id) => set({ activeId: id }),
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  pinSurface: (surfaceId) => set({ pinnedSurfaceId: surfaceId, panelOpen: true }),
  unpinSurface: () => set({ pinnedSurfaceId: null }),

  handleEvent: (event) => {
    switch (event.kind) {
      case 'Update': {
        const artifact = normalizeArtifact(event.artifact as unknown as Record<string, unknown>)
        set((s) => {
          const filtered = s.artifacts.filter((a) => a.id !== artifact.id)
          const next = [artifact, ...filtered]
          const activeId = s.activeId || artifact.id
          return { artifacts: next, activeId, panelOpen: true }
        })
        break
      }
      case 'Remove': {
        set((s) => {
          const next = s.artifacts.filter((a) => a.id !== event.id)
          const activeId = s.activeId === event.id ? (next[0]?.id || null) : s.activeId
          return { artifacts: next, activeId }
        })
        break
      }
      case 'List': {
        const artifacts = event.artifacts.map((a) => normalizeArtifact(a as unknown as Record<string, unknown>))
        set((s) => {
          const activeId = s.activeId || artifacts[0]?.id || null
          return { artifacts, activeId }
        })
        break
      }
    }
  },
}))
