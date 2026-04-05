import { create } from 'zustand'

const MIN_SIZE = 10
const MAX_SIZE = 22
const DEFAULT_SIZE = 13
const STEP = 1
const STORAGE_KEY = 'aurora-chat-font-size'

function loadSize(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const n = parseInt(stored, 10)
      if (n >= MIN_SIZE && n <= MAX_SIZE) return n
    }
  } catch {}
  return DEFAULT_SIZE
}

function applySize(size: number) {
  document.documentElement.style.setProperty('--font-size-base', `${size}px`)
  localStorage.setItem(STORAGE_KEY, String(size))
}

interface FontSizeStore {
  size: number
  increase: () => void
  decrease: () => void
  reset: () => void
}

export const useFontSizeStore = create<FontSizeStore>((set) => {
  // Apply saved size on load
  const initial = loadSize()
  applySize(initial)

  return {
    size: initial,
    increase: () => set((s) => {
      const next = Math.min(s.size + STEP, MAX_SIZE)
      applySize(next)
      return { size: next }
    }),
    decrease: () => set((s) => {
      const next = Math.max(s.size - STEP, MIN_SIZE)
      applySize(next)
      return { size: next }
    }),
    reset: () => {
      applySize(DEFAULT_SIZE)
      set({ size: DEFAULT_SIZE })
    },
  }
})
