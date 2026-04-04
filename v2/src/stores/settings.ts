import { create } from 'zustand'

interface SettingsStore {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}))
