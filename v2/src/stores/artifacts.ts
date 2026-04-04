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

  setActiveId: (id: string) => void
  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void

  handleEvent: (event: ArtifactEvent) => void
}

type ArtifactEvent =
  | { kind: 'Update'; artifact: Artifact }
  | { kind: 'Remove'; id: string }
  | { kind: 'List'; artifacts: Artifact[] }

export const useArtifactStore = create<ArtifactStore>((set) => ({
  artifacts: [],
  activeId: null,
  panelOpen: false,

  setActiveId: (id) => set({ activeId: id }),
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  handleEvent: (event) => {
    switch (event.kind) {
      case 'Update': {
        set((s) => {
          const filtered = s.artifacts.filter((a) => a.id !== event.artifact.id)
          const next = [event.artifact, ...filtered]
          const activeId = s.activeId || event.artifact.id
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
        set((s) => {
          const activeId = s.activeId || event.artifacts[0]?.id || null
          return { artifacts: event.artifacts, activeId }
        })
        break
      }
    }
  },
}))
