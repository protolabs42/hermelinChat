# App.jsx Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 6097-line `App.jsx` monolith into a zustand-based, TypeScript, domain-driven architecture with ~45 focused files.

**Architecture:** 8 zustand stores (auth, ui-prefs, video-fx, sessions, terminal, search, artifacts, toast) + typed API client + feature-folder components. No React context providers. Cross-store communication via direct `getState()` calls.

**Tech Stack:** React 19, TypeScript (strict), Zustand, Vite, xterm.js

**Spec:** `docs/superpowers/specs/2026-04-03-app-jsx-decomposition-design.md`

**Source file being decomposed:** `frontend/src/App.jsx` (6097 lines)

---

## Task 1: Infrastructure — TypeScript + Zustand + Branch

**Files:**
- Create: `frontend/tsconfig.json`
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.js` → `frontend/vite.config.ts`
- Modify: `frontend/src/main.jsx` → `frontend/src/main.tsx`

- [ ] **Step 1: Create feature branch**

```bash
cd /home/inu/hermelinChat
git checkout -b refactor/app-decomposition
```

- [ ] **Step 2: Install TypeScript + zustand**

```bash
cd frontend
npm install zustand
npm install -D typescript @types/dompurify
```

- [ ] **Step 3: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "allowJs": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Add typecheck script to `frontend/package.json`**

Add to `"scripts"`:
```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 5: Rename `vite.config.js` → `vite.config.ts`**

Rename the file. Vite auto-detects `.ts` config. Add type import:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

const pyproject = fs.readFileSync('../pyproject.toml', 'utf-8')
const versionMatch = pyproject.match(/^version\s*=\s*"([^"]+)"/m)
const appVersion = versionMatch ? versionMatch[1] : '0.0.0'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../hermelin/static',
    emptyOutDir: true,
  },
})
```

- [ ] **Step 6: Create `frontend/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

declare const __APP_VERSION__: string
```

- [ ] **Step 7: Rename `main.jsx` → `main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Note: keeps importing `App.jsx` for now — will switch to `App.tsx` in Task 17.

- [ ] **Step 8: Update `frontend/index.html`**

Change `src="/src/main.jsx"` to `src="/src/main.tsx"`.

- [ ] **Step 9: Verify dev server still starts**

```bash
cd /home/inu/hermelinChat/frontend
npm run dev
```

Visit http://localhost:5173 — app should work exactly as before.

- [ ] **Step 10: Commit**

```bash
git add -A frontend/tsconfig.json frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/src/main.tsx frontend/src/vite-env.d.ts frontend/index.html
git rm frontend/vite.config.js frontend/src/main.jsx
git commit -m "chore: add TypeScript + zustand, convert infrastructure to TS"
```

---

## Task 2: Shared Types + API Client

**Files:**
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/api/client.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p frontend/src/types frontend/src/api
```

- [ ] **Step 2: Create `frontend/src/types/index.ts`**

Extract type contracts from App.jsx. These are the shared shapes used across multiple stores/components:

```ts
// ─── Session ───────────────────────────────────────────────────────

export interface Session {
  id: string
  title: string
  title_source?: string
  model?: string | null
  started_at?: number
}

export interface GroupedSessions {
  Today: Session[]
  Yesterday: Session[]
  Earlier: Session[]
}

// ─── Search ────────────────────────────────────────────────────────

export interface SearchHit {
  id: string
  session_id: string
  session_title?: string
  session_model?: string | null
  role?: string
  text?: string
  timestamp?: number
}

export interface SearchGroup {
  session_id: string
  title: string
  model: string | null
  hits: SearchHit[]
}

// ─── Artifacts ─────────────────────────────────────────────────────

export interface ArtifactTab {
  id: string
  type: string
  title?: string
  timestamp?: number
  [key: string]: unknown
}

// ─── UI Prefs ──────────────────────────────────────────────────────

export interface ParticlePrefs {
  enabled: boolean
  intensity: number
}

export interface BackgroundPrefs {
  effect: string
}

export interface TimestampPrefs {
  enabled: boolean
}

export interface TerminalPrefs {
  cursorStyle: 'bar' | 'block' | 'underline'
  cursorBlink: boolean
}

export interface VideoFxPrefs {
  enabled: boolean
  intensity: number
  glitchPulses: boolean
}

export interface UiPrefs {
  theme: string
  appName: string
  particles: ParticlePrefs
  background: BackgroundPrefs
  timestamps: TimestampPrefs
  terminal: TerminalPrefs
  videoFx: VideoFxPrefs
}

// ─── Auth ──────────────────────────────────────────────────────────

export interface AuthState {
  loading: boolean
  enabled: boolean
  authenticated: boolean
}

// ─── Runtime ───────────────────────────────────────────────────────

export interface RuntimeInfo {
  loading: boolean
  defaultModel: string | null
  spawnCwd: string | null
}

// ─── Peek ──────────────────────────────────────────────────────────

export interface PeekContext {
  session_id?: string
  session_title?: string
  session_model?: string | null
  messages?: Array<{
    id: string
    role: string
    text: string
    timestamp?: number
  }>
}

export interface PeekState {
  open: boolean
  loading: boolean
  error: string
  context: PeekContext | null
  hit: SearchHit | null
}

// ─── Session Menu ──────────────────────────────────────────────────

export interface SessionMenu {
  session_id: string
  title: string
  left: number
  top: number
}

// ─── Terminal State Machine ────────────────────────────────────────

export type TerminalPhase = 'idle' | 'connecting' | 'connected' | 'detecting'

export type TerminalState =
  | { phase: 'idle' }
  | { phase: 'connecting'; resumeId: string | null }
  | { phase: 'connected'; resumeId: string | null }
  | { phase: 'detecting'; resumeId: null; startedAt: number; baselineIds: Set<string> }
```

- [ ] **Step 3: Create `frontend/src/api/client.ts`**

```ts
import { useAuthStore } from '../stores/auth'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail)
    this.name = 'ApiError'
  }
}

export async function apiCall<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, opts)

  if (res.status === 401) {
    useAuthStore.getState().setUnauthenticated()
    throw new ApiError(401, 'unauthorized')
  }

  const data = await res.json()

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || data?.detail || `http ${res.status}`)
  }

  return data as T
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiCall<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
```

Note: `useAuthStore` doesn't exist yet — will be created in Task 3. TypeScript will flag this temporarily since `allowJs: true` and we're building incrementally.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/client.ts
git commit -m "feat: add shared types and typed API client"
```

---

## Task 3: Stores — Toast + Auth

**Files:**
- Create: `frontend/src/stores/toast.ts`
- Create: `frontend/src/stores/auth.ts`

These two stores have zero dependencies on other stores, so they go first.

- [ ] **Step 1: Create stores directory**

```bash
mkdir -p frontend/src/stores
```

- [ ] **Step 2: Create `frontend/src/stores/toast.ts`**

Source: App.jsx lines 4021-4047 (`eggToast` state + `showEggToast` callback)

```ts
import { create } from 'zustand'

interface Toast {
  id: string
  text: string
}

interface ToastStore {
  toast: Toast | null
  show: (text: string, ms?: number) => void
}

let _timer: ReturnType<typeof setTimeout> | null = null

export const useToastStore = create<ToastStore>((set) => ({
  toast: null,

  show: (text, ms = 2600) => {
    const t = (text || '').toString().trim()
    if (!t) return

    const id =
      globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`

    set({ toast: { id, text: t } })

    if (_timer) clearTimeout(_timer)
    _timer = setTimeout(() => {
      set({ toast: null })
      _timer = null
    }, ms)
  },
}))
```

- [ ] **Step 3: Create `frontend/src/stores/auth.ts`**

Source: App.jsx lines 4060-4062 (state), 4107-4118 (`refreshAuth`), 4685-4723 (`doLogin`, `doLogout`)

```ts
import { create } from 'zustand'
import type { AuthState } from '../types'

interface AuthStore extends AuthState {
  loginError: string
  login: (password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  setUnauthenticated: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  loading: true,
  enabled: false,
  authenticated: false,
  loginError: '',

  refresh: async () => {
    try {
      const r = await fetch('/api/auth/me')
      const data = await r.json()
      set({
        loading: false,
        enabled: !!data.auth_enabled,
        authenticated: !!data.authenticated,
      })
    } catch {
      set({ loading: false, enabled: false, authenticated: false })
    }
  },

  login: async (password) => {
    set({ loginError: '' })
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!r.ok) {
        set({ loginError: 'invalid password' })
        return
      }
      await useAuthStore.getState().refresh()
    } catch {
      set({ loginError: 'login failed' })
    }
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      set({ authenticated: false })
      // Cross-store resets are called by the component that triggers logout
      // (AppShell), not here — avoids circular imports during store init.
    }
  },

  setUnauthenticated: () => {
    set({ authenticated: false })
  },
}))
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/toast.ts frontend/src/stores/auth.ts
git commit -m "feat: add toast and auth zustand stores"
```

---

## Task 4: Stores — UI Prefs + Utils

**Files:**
- Create: `frontend/src/utils/ui-prefs.ts`
- Create: `frontend/src/stores/ui-prefs.ts`

- [ ] **Step 1: Create utils directory**

```bash
mkdir -p frontend/src/utils
```

- [ ] **Step 2: Create `frontend/src/utils/ui-prefs.ts`**

Extract from App.jsx lines 13-175. Move all prefs constants, `normalizeUiPrefs`, `loadUiPrefs`, `saveUiPrefs`, `clampNum`, and artifact panel width helpers.

Source lines to extract:
- Lines 15-54: constants (`UI_PREFS_STORAGE_KEY`, `DEFAULT_UI_PREFS`, etc.)
- Lines 56-61: `clampNum`
- Lines 62-114: `normalizeUiPrefs`
- Lines 116-135: `loadUiPrefs`, `saveUiPrefs`
- Lines 136-175: `clampArtifactPanelWidth`, `loadArtifactPanelWidth`, `saveArtifactPanelWidth`

Add TypeScript types: import `UiPrefs` from `../types`. Type all function signatures. Export everything.

Key changes from source:
- Add `import type { UiPrefs } from '../types'`
- Type `clampNum(n: unknown, min: number, max: number): number`
- Type `normalizeUiPrefs(raw: unknown): UiPrefs`
- Type `loadUiPrefs(): UiPrefs`
- Type `saveUiPrefs(prefs: UiPrefs): void`
- Export `DEFAULT_UI_PREFS`, `CURSOR_STYLE_VALUES`, `BACKGROUND_EFFECT_VALUES`
- Export `clampArtifactPanelWidth`, `loadArtifactPanelWidth`, `saveArtifactPanelWidth`, `DEFAULT_ARTIFACT_PANEL_WIDTH`

- [ ] **Step 3: Create `frontend/src/stores/ui-prefs.ts`**

Source: App.jsx lines 3813-3912 (uiPrefs state, activeTheme, bgEffect, appNameLabel, updateUiPrefs, save effect, favicon effect, title effect)

```ts
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { UiPrefs } from '../types'
import {
  normalizeUiPrefs,
  loadUiPrefs,
  saveUiPrefs,
  BACKGROUND_EFFECT_VALUES,
} from '../utils/ui-prefs'
import {
  THEMES,
  DEFAULT_THEME_ID,
  normalizeThemeId,
  setActiveThemeId,
} from '../theme/index.js'

// Theme type — matches shape in theme/themes.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Theme = (typeof THEMES)[typeof DEFAULT_THEME_ID]

interface UiPrefsStore {
  prefs: UiPrefs
  activeTheme: Theme
  effectiveBgKind: string
  appNameLabel: string
  update: (updater: UiPrefs | ((prev: UiPrefs) => UiPrefs)) => void
}

const initialPrefs = loadUiPrefs()
setActiveThemeId(initialPrefs.theme)

export const useUiPrefsStore = create<UiPrefsStore>()(
  subscribeWithSelector((set, get) => ({
    prefs: initialPrefs,
    activeTheme: THEMES[normalizeThemeId(initialPrefs.theme)] || THEMES[DEFAULT_THEME_ID],
    effectiveBgKind: (() => {
      const pref = initialPrefs.background?.effect || 'auto'
      const theme = THEMES[normalizeThemeId(initialPrefs.theme)] || THEMES[DEFAULT_THEME_ID]
      const themeKind = (theme?.background?.kind || 'particles').toString()
      return pref === 'auto' ? themeKind : pref
    })(),
    appNameLabel: (initialPrefs.appName || '').toString().trim() || 'hermelinChat',

    update: (updater) => {
      const prev = get().prefs
      const base = normalizeUiPrefs(prev)
      const nextRaw = typeof updater === 'function' ? updater(base) : updater
      const next = normalizeUiPrefs(nextRaw)
      const themeId = normalizeThemeId(next.theme)
      setActiveThemeId(themeId)

      const activeTheme = THEMES[themeId] || THEMES[DEFAULT_THEME_ID]
      const bgPref = next.background?.effect || 'auto'
      const themeKind = (activeTheme?.background?.kind || 'particles').toString()
      const effectiveBgKind = bgPref === 'auto' ? themeKind : bgPref
      const appNameLabel = (next.appName || '').toString().trim() || 'hermelinChat'

      set({ prefs: next, activeTheme, effectiveBgKind, appNameLabel })
    },
  })),
)

// Auto-persist to localStorage
useUiPrefsStore.subscribe(
  (s) => s.prefs,
  (prefs) => saveUiPrefs(prefs),
)

// Auto-update document title
useUiPrefsStore.subscribe(
  (s) => s.appNameLabel,
  (label) => {
    if (typeof document !== 'undefined') {
      try { document.title = label } catch { /* ignore */ }
    }
  },
)

// Auto-update favicon on theme change
useUiPrefsStore.subscribe(
  (s) => s.activeTheme,
  (activeTheme) => {
    if (typeof document === 'undefined') return
    try {
      const icons = (activeTheme as Record<string, unknown>)?.icons as Record<string, unknown> | undefined
      // ... favicon logic from App.jsx lines 3846-3889
      // (moved into a subscription — exact same logic)
    } catch { /* ignore */ }
  },
)
```

The favicon subscription should contain the exact logic from App.jsx lines 3842-3889 (the `useEffect` that updates `<link>` elements). Copy it verbatim, adapting only `activeTheme` access.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/ui-prefs.ts frontend/src/stores/ui-prefs.ts
git commit -m "feat: add ui-prefs utils and zustand store"
```

---

## Task 5: Store — Video FX

**Files:**
- Create: `frontend/src/stores/video-fx.ts`

- [ ] **Step 1: Create `frontend/src/stores/video-fx.ts`**

Source: App.jsx lines 3828-3961 (videoFx state, glitch timer, filter/transform computations), plus lines 4925-4964 (videoFxFilter, videoFxTransform memos)

Extract the glitch pulse timer (lines 3914-3961) into `startGlitchLoop` / `stopGlitchLoop` methods. Compute `filter` and `transform` CSS strings inside the store instead of as `useMemo` in App.

The store reads intensity from `useUiPrefsStore.getState().prefs.videoFx`. Subscribe to prefs changes to recompute enabled/factor/filter/transform.

Key state:
- `enabled: boolean` — derived from prefs
- `factor: number` — `intensity / 100`
- `glitchNow: boolean` — toggled by timer
- `glitchSeed: number` — random seed for glitch transform
- `filter: string` — computed CSS filter string (from App.jsx lines 4925-4946)
- `transform: string` — computed CSS transform string (from App.jsx lines 4948-4964)

Actions:
- `startGlitchLoop()` — starts the recursive setTimeout pulse from lines 3925-3951
- `stopGlitchLoop()` — clears timers
- `recompute()` — internal, recalculates filter/transform from current state

Subscribe to `useUiPrefsStore` prefs changes to sync `enabled`/`factor` and start/stop the glitch loop.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/video-fx.ts
git commit -m "feat: add video-fx zustand store with glitch loop"
```

---

## Task 6: Store — Sessions

**Files:**
- Create: `frontend/src/stores/sessions.ts`

- [ ] **Step 1: Create `frontend/src/stores/sessions.ts`**

Source: App.jsx lines 3809, 3967-3972, 3994-4007, 4454-4600, 4645-4912 (session state, polling, rename, delete, grouping, runtime info, new session, resume session, active session tracking)

This is the largest store. Key sections to extract:

**State:**
- `sessions: Session[]` — from line 3809
- `activeSessionId: string | null` — from line 3972
- `runtimeInfo: RuntimeInfo` — from line 4105
- Derived: `activeSession`, `grouped` — from lines 4899-4917

**Polling (three modes):**
1. Regular 10s — from lines 4752-4782 (`load` + `setInterval(load, 10_000)`)
2. Fast-poll 1s — from lines 4804-4842 (when `activeSessionMissing`)
3. Fallback detection 1s — from lines 4846-4897 (when terminal is detecting)

**Actions:**
- `startPolling()` / `stopPolling()` — manage interval refs
- `startNewSession()` — from lines 4454-4469 (snapshots baseline, clears search, resets terminal)
- `resumeSession(id)` — sets `activeSessionId`, calls terminal store spawn
- `rename(id, title)` — from lines 4539-4599 (API call + optimistic update)
- `delete(id)` — from lines 4602-4643 (API call + remove from list)
- `setActiveSessionId(sid)` — called by terminal store on detection
- `fetchRuntimeInfo()` — from lines 4125-4157 (`/api/info` fetch)
- `reset()` — clear everything (called on logout)

**Version constant:**
```ts
export const HERMELINCHAT_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.13'
```

Use `apiCall` from `../api/client` for all fetches. Gate API calls with `useAuthStore.getState().authenticated`.

Cross-store calls:
- `startNewSession()` calls `useSearchStore.getState().reset()` and `useTerminalStore.getState().spawn(null)`
- `resumeSession(id)` calls `useTerminalStore.getState().spawn(id)`
- `rename` / `delete` update `useSearchStore.getState()` results if applicable

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/sessions.ts
git commit -m "feat: add sessions zustand store with polling modes"
```

---

## Task 7: Store — Terminal

**Files:**
- Create: `frontend/src/stores/terminal.ts`

- [ ] **Step 1: Create `frontend/src/stores/terminal.ts`**

Source: App.jsx lines 3964-4007 (ptyResumeId, ptySpawnNonce, connected, refs, handleConnectionChange, handleDetectedSessionId), plus lines 4784-4897 (polling effects — moved to sessions store)

```ts
import { create } from 'zustand'
import type { TerminalState } from '../types'
import { useSessionStore } from './sessions'

interface TerminalStore {
  state: TerminalState
  spawnNonce: number
  spawn: (resumeId: string | null) => void
  onConnectionChange: (isUp: boolean) => void
  onDetectedSessionId: (sid: string) => void
  reset: () => void
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  state: { phase: 'idle' } as TerminalState,
  spawnNonce: 0,

  spawn: (resumeId) => {
    set((s) => ({
      state: { phase: 'connecting', resumeId },
      spawnNonce: s.spawnNonce + 1,
    }))
    if (resumeId) {
      useSessionStore.getState().setActiveSessionId(resumeId)
    }
  },

  onConnectionChange: (isUp) => {
    const { state } = get()
    if (isUp) {
      if (state.phase === 'connecting') {
        if (state.resumeId !== null) {
          // Resuming — already have session ID
          set({ state: { phase: 'connected', resumeId: state.resumeId } })
        } else {
          // New session — enter detecting phase
          const sessions = useSessionStore.getState().sessions
          const baselineIds = new Set(sessions.map((s) => s.id))
          set({
            state: {
              phase: 'detecting',
              resumeId: null,
              startedAt: Date.now() / 1000,
              baselineIds,
            },
          })
        }
      }
    } else {
      set({ state: { phase: 'idle' } })
    }
  },

  onDetectedSessionId: (sid) => {
    if (!sid) return
    const { state } = get()
    if (state.phase !== 'detecting' && state.phase !== 'connected') return
    set({ state: { phase: 'connected', resumeId: null } })
    useSessionStore.getState().setActiveSessionId(sid)
  },

  reset: () => {
    set({ state: { phase: 'idle' }, spawnNonce: 0 })
  },
}))

// Derived selector for connected state
export const selectConnected = (s: TerminalStore) =>
  s.state.phase === 'connected' || s.state.phase === 'detecting'
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/terminal.ts
git commit -m "feat: add terminal state machine zustand store"
```

---

## Task 8: Store — Search

**Files:**
- Create: `frontend/src/stores/search.ts`

- [ ] **Step 1: Create `frontend/src/stores/search.ts`**

Source: App.jsx lines 4064-4263 (search state, debounced query, search groups, expanded sessions, peek state/handlers)

State:
- `query: string` — line 4064
- `results: SearchHit[]` — line 4065
- `searching: boolean` — line 4066
- `expandedSessions: Record<string, boolean>` — line 4067
- `groups: SearchGroup[]` — derived (lines 4225-4255)
- `peek: PeekState` — lines 4069-4073

Key behaviors:
- `setQuery(q)` — debounces 250ms (lines 4159-4206), cancels previous AbortController
- `groups` recomputed from `results` (lines 4225-4255: group by session_id, sort by timestamp)
- `expandedSessions` auto-populated when query/results change (lines 4208-4223)
- `openPeek(hit)` — fetches `/api/messages/context` (lines 4655-4683)
- `closePeek()` — resets peek state (lines 4257-4263)

Use `apiCall` for search and peek fetches. Gate with `useAuthStore.getState().authenticated`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/search.ts
git commit -m "feat: add search zustand store with debounce and peek"
```

---

## Task 9: Store — Artifacts + Bridge

**Files:**
- Create: `frontend/src/stores/artifacts.ts`
- Create: `frontend/src/components/artifacts/bridge.ts`

- [ ] **Step 1: Create `frontend/src/stores/artifacts.ts`**

Source: App.jsx lines 4075-4452 (artifact tabs state, panel state, applyArtifacts, mergeArtifactsStable, normalizeArtifacts, refreshArtifacts, deleteArtifactTab, closeArtifactPanel, artifact polling)

Critical behavioral contracts to preserve exactly:
1. `mergeArtifactsStable` (lines 4273-4293): preserves dropdown order for known IDs
2. `applyArtifacts` (lines 4295-4336): auto-open logic with dismiss/newIds gating, skip on empty
3. Polling: 1.5s interval (lines 4726-4750)

State:
- `tabs`, `activeId`, `panelOpen`, `panelPinned`, `panelDismissed`, `panelWidth`

Actions:
- `applyArtifacts(items, opts)` — merge + auto-open logic
- `openPanel()` — calls `useSearchStore.getState().closePeek()`
- `closePanel()` — sets `panelDismissed: true, panelOpen: false`
- `deleteTab(id)` — DELETE API call + refresh
- `startPolling()` / `stopPolling()` — 1.5s artifact refresh
- `setPanelWidth(w)` — clamps + debounced localStorage persist
- `reset()` — clear all state

Import `loadArtifactPanelWidth`, `saveArtifactPanelWidth`, `clampArtifactPanelWidth` from `../utils/ui-prefs`.

- [ ] **Step 2: Create `frontend/src/components/artifacts/bridge.ts`**

Source: App.jsx lines 4370-4447 (`handleArtifactControlMessage`)

```ts
import { useArtifactStore } from '../../stores/artifacts'
import type { ArtifactTab } from '../../types'

export function handleControlMessage(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const msg = payload as Record<string, unknown>
  const store = useArtifactStore.getState()

  if (msg.type === 'artifact') {
    const artifact = msg.payload as ArtifactTab | undefined
    if (!artifact || typeof artifact !== 'object' || !artifact.id) return true
    const current = store.tabs
    const next = [artifact, ...current.filter((item) => item.id !== artifact.id)]
    store.applyArtifacts(next, { openOnChange: true })
    return true
  }

  if (msg.type === 'artifact_list' && Array.isArray(msg.payload)) {
    store.applyArtifacts(msg.payload as ArtifactTab[], { openOnChange: true })
    return true
  }

  if (msg.type === 'artifact_focus') {
    const info = (msg.payload || {}) as Record<string, unknown>
    const id = (info.tab_id || info.id || info.artifact_id || null) as string | null
    if (!id) return true
    store.setActiveId(String(id))
    store.openPanel()
    return true
  }

  if (msg.type === 'artifact_close') {
    const info = (msg.payload || {}) as Record<string, unknown>
    if (info.action === 'close_all') {
      store.applyArtifacts([], { openOnChange: false })
      store.closePanel()
      return true
    }
    const id = (info.id || info.tab_id) as string | undefined
    if (id) {
      const next = store.tabs.filter((item) => item.id !== id)
      store.applyArtifacts(next, { openOnChange: false })
      return true
    }
  }

  if (msg.type === 'artifact_bridge_command') {
    const command = (msg.payload || {}) as Record<string, unknown>
    const artifactId = (command.artifact_id || command.artifactId || command.id || command.tab_id || null) as string | null

    if (artifactId) {
      store.setActiveId(String(artifactId))
      store.openPanel()
    }

    if (typeof window !== 'undefined') {
      const windowStore = ((window as Record<string, unknown>).__hermesArtifactBridgeCommands =
        (window as Record<string, unknown>).__hermesArtifactBridgeCommands || {}) as Record<string, unknown[]>
      const key = artifactId ? String(artifactId) : '__global__'
      const queue = Array.isArray(windowStore[key]) ? windowStore[key] : []
      windowStore[key] = [...queue, command]
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('hermes-artifact-command', { detail: command }))
      }, 30)
    }

    return true
  }

  return false
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/artifacts.ts frontend/src/components/artifacts/bridge.ts
git commit -m "feat: add artifacts zustand store and bridge module"
```

---

## Task 10: Utils — Formatting + SVG

**Files:**
- Create: `frontend/src/utils/formatting.ts`
- Create: `frontend/src/utils/svg.ts`

- [ ] **Step 1: Create `frontend/src/utils/formatting.ts`**

Extract from App.jsx:
- Lines 176-216: `formatModelLabel` — type as `(raw: unknown): string | null`
- Lines 1138-1194: `isoToLocalLabel`, `isoToTimeLabel`, `isoToRelativeLabel` — type params as `(iso: string | number | null | undefined): string`

- [ ] **Step 2: Create `frontend/src/utils/svg.ts`**

Extract from App.jsx:
- Lines 228-235: `normalizeInlineSvg(svgRaw: unknown): string`
- Lines 236-248: `svgViewBoxAspect(svgRaw: unknown): number`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/formatting.ts frontend/src/utils/svg.ts
git commit -m "feat: extract formatting and SVG utils"
```

---

## Task 11: Shared Components

**Files:**
- Create: `frontend/src/components/shared/icons.tsx`
- Create: `frontend/src/components/shared/CollapsiblePanel.tsx`
- Create: `frontend/src/components/shared/HighlightedSnippet.tsx`
- Create: `frontend/src/components/shared/SidebarItem.tsx`

- [ ] **Step 1: Create `frontend/src/components/shared/icons.tsx`**

Extract from App.jsx lines 217-334: `InvertelinSmall`, `InlineSvgIcon`, `SidebarDockIcon`, `SettingsIcon`, `PlusIcon`, `LogoutIcon`.

Add typed props interfaces for each. Import `AMBER`, `SLATE` from `../../theme/index.js`. Import `normalizeInlineSvg`, `svgViewBoxAspect` from `../../utils/svg`.

- [ ] **Step 2: Create `frontend/src/components/shared/CollapsiblePanel.tsx`**

Extract from App.jsx lines 1670-1730. Add props interface.

- [ ] **Step 3: Create `frontend/src/components/shared/HighlightedSnippet.tsx`**

Extract from App.jsx lines 1195-1235. Add props interface.

- [ ] **Step 4: Create `frontend/src/components/shared/SidebarItem.tsx`**

Extract from App.jsx lines 1111-1137. Add props interface.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shared/
git commit -m "feat: extract shared UI components"
```

---

## Task 12: Background Components

**Files:**
- Create: `frontend/src/components/backgrounds/BackgroundRenderer.tsx`
- Create: `frontend/src/components/backgrounds/ParticleField.tsx`
- Create: `frontend/src/components/backgrounds/MatrixRainField.tsx`
- Create: `frontend/src/components/backgrounds/NousCRTField.tsx`
- Create: `frontend/src/components/backgrounds/SamaritanField.tsx`
- Create: `frontend/src/components/backgrounds/GrainOverlay.tsx`
- Create: `frontend/src/components/backgrounds/ScanlinesOverlay.tsx`

- [ ] **Step 1: Extract each background component**

Each is a self-contained component from App.jsx. Add typed props interfaces.

Source line mapping:
- `ParticleField` — lines 336-430 (95 lines)
- `GrainOverlay` — lines 431-449 (19 lines)
- `MatrixRainField` — lines 450-647 (198 lines)
- `NousCRTField` — lines 648-809 (162 lines)
- `SamaritanField` — lines 810-1087 (278 lines)
- `ScanlinesOverlay` — lines 1088-1110 (23 lines)

All import `AMBER`, `SLATE` from `../../theme/index.js` and use `useEffect`, `useRef`, `useMemo` from React.

- [ ] **Step 2: Create `BackgroundRenderer.tsx`**

New component that reads `effectiveBgKind` and `prefs.particles.intensity` from `useUiPrefsStore` and renders the correct background + overlays. This replaces the inline background rendering in App.jsx's return JSX.

```tsx
import { useUiPrefsStore } from '../../stores/ui-prefs'
import { ParticleField } from './ParticleField'
import { MatrixRainField } from './MatrixRainField'
import { NousCRTField } from './NousCRTField'
import { SamaritanField } from './SamaritanField'
import { GrainOverlay } from './GrainOverlay'
import { ScanlinesOverlay } from './ScanlinesOverlay'

export function BackgroundRenderer() {
  const effectiveBgKind = useUiPrefsStore((s) => s.effectiveBgKind)
  const intensity = useUiPrefsStore((s) => s.prefs.particles.intensity)
  const activeTheme = useUiPrefsStore((s) => s.activeTheme)

  return (
    <>
      {effectiveBgKind === 'particles' && <ParticleField intensity={intensity} />}
      {effectiveBgKind === 'matrix-rain' && (
        <MatrixRainField intensity={intensity} config={activeTheme?.background} />
      )}
      {effectiveBgKind === 'nous-crt' && <NousCRTField intensity={intensity} />}
      {effectiveBgKind === 'samaritan' && <SamaritanField intensity={intensity} />}
      {effectiveBgKind !== 'samaritan' && <GrainOverlay />}
      {(effectiveBgKind === 'nous-crt' || effectiveBgKind === 'samaritan') && <ScanlinesOverlay />}
    </>
  )
}
```

Verify the grain/scanlines conditions by reading App.jsx's return JSX (lines ~5000+) to match exactly.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/backgrounds/
git commit -m "feat: extract background effect components"
```

---

## Task 13: Sidebar Components

**Files:**
- Create: `frontend/src/components/sidebar/Sidebar.tsx`
- Create: `frontend/src/components/sidebar/SidebarHeader.tsx`
- Create: `frontend/src/components/sidebar/SessionList.tsx`
- Create: `frontend/src/components/sidebar/SessionRow.tsx`
- Create: `frontend/src/components/sidebar/SearchPanel.tsx`
- Create: `frontend/src/components/sidebar/SearchHitRow.tsx`
- Create: `frontend/src/components/sidebar/PeekDrawer.tsx`

- [ ] **Step 1: Extract `SessionRow.tsx`**

Source: App.jsx lines 1236-1383. Add typed props interface. Component receives `title`, `preview`, `subtitle`, `subtitleTitle`, `right`, `active`, `onClick`, `onMenu`, `menuOpen`.

- [ ] **Step 2: Extract `SearchHitRow.tsx`**

Source: App.jsx lines 1384-1427.

- [ ] **Step 3: Extract `PeekDrawer.tsx`**

Source: App.jsx lines 1544-1669. Reads peek state from `useSearchStore`. Import `formatModelLabel` from `../../utils/formatting`.

- [ ] **Step 4: Create `SessionList.tsx`**

Renders the grouped sessions (Today/Yesterday/Earlier), new session button, and search results. Reads from `useSessionStore` and `useSearchStore`. Contains the session list + search results rendering logic currently inline in App.jsx's sidebar JSX.

- [ ] **Step 5: Create `SearchPanel.tsx`**

The search input + results display. Reads `useSearchStore` for query/results/groups. Renders `SearchHitRow` components grouped by session.

- [ ] **Step 6: Create `SidebarHeader.tsx`**

The top section with app name, settings button, collapse button. Reads `appNameLabel` from `useUiPrefsStore`. Shell-local `collapsed` state passed as prop from `Sidebar`.

- [ ] **Step 7: Create `Sidebar.tsx`**

Container that owns `collapsed` state locally. Renders `SidebarHeader`, `SessionList`, search, and the logout button. Source: App.jsx sidebar JSX (lines ~5012-5500).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/sidebar/
git commit -m "feat: extract sidebar components"
```

---

## Task 14: Terminal Component

**Files:**
- Create: `frontend/src/components/terminal/utils.ts`
- Create: `frontend/src/components/terminal/TerminalPane.tsx`

- [ ] **Step 1: Create `frontend/src/components/terminal/utils.ts`**

Source: App.jsx lines 3333-3361.

```ts
export function buildWsUrl(resumeId: string | null, opts: { cols?: number; rows?: number } = {}): string {
  // ... exact logic from lines 3333-3351
}

const ANSI_CSI_RE = new RegExp('\\u001b\\[[0-9;]*[a-zA-Z]', 'g')
const ANSI_OSC_RE = new RegExp('\\u001b\\][^\\u0007]*(?:\\u0007|\\u001b\\\\)', 'g')

export function stripAnsi(s: string): string {
  return s.replace(ANSI_CSI_RE, '').replace(ANSI_OSC_RE, '')
}
```

- [ ] **Step 2: Create `frontend/src/components/terminal/TerminalPane.tsx`**

Source: App.jsx lines 3362-3807. This is 446 lines and stays mostly intact as one component.

Key changes:
- Import `useTerminalStore` + `useUiPrefsStore` instead of receiving callbacks as props
- Get `onConnectionChange` and `onDetectedSessionId` from terminal store
- Get theme colors from ui-prefs store
- Import `handleControlMessage` from `../artifacts/bridge` for WS control messages
- Props become minimal: just `spawnNonce` (or read from terminal store)

The component manages its own xterm Terminal instance, FitAddon, WebSocket lifecycle. This logic should not be decomposed further — it's a cohesive unit.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/terminal/
git commit -m "feat: extract TerminalPane component"
```

---

## Task 15: Modal Components

**Files:**
- Create: `frontend/src/components/modals/LoginScreen.tsx`
- Create: `frontend/src/components/modals/SessionContextMenu.tsx`
- Create: `frontend/src/components/modals/RenameSessionModal.tsx`
- Create: `frontend/src/components/modals/DeleteSessionModal.tsx`

- [ ] **Step 1: Create `LoginScreen.tsx`**

Extract the login form from App.jsx's return JSX (the `{locked && ...}` block). Reads from `useAuthStore`.

- [ ] **Step 2: Create `SessionContextMenu.tsx`**

Source: the `{sessionMenu && ...}` block in App.jsx. Receives `menu: SessionMenu`, `onRename`, `onDelete`, `onClose` as props.

- [ ] **Step 3: Create `RenameSessionModal.tsx`**

Source: App.jsx lines ~5850-5958 (the `{renameSession && ...}` block). Manages its own `draft`, `busy`, `error` state locally. Receives `session: { id, title }`, `onSave`, `onClose` as props.

- [ ] **Step 4: Create `DeleteSessionModal.tsx`**

Source: App.jsx lines ~5961-6063 (the `{deleteSession && ...}` block). Similar pattern to rename — local `busy`/`error` state, receives `session`, `onDelete`, `onClose` props.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/modals/
git commit -m "feat: extract modal components"
```

---

## Task 16: Settings Panel

**Files:**
- Create: `frontend/src/components/settings/SettingsPanel.tsx`
- Create: `frontend/src/components/settings/ModelSettings.tsx`
- Create: `frontend/src/components/settings/AgentSettings.tsx`
- Create: `frontend/src/components/settings/KeySettings.tsx`
- Create: `frontend/src/components/settings/ArtifactSettings.tsx`
- Create: `frontend/src/components/settings/AppearanceSettings.tsx`
- Create: `frontend/src/components/settings/BackgroundSettings.tsx`
- Create: `frontend/src/components/settings/TerminalCursorSettings.tsx`
- Create: `frontend/src/components/settings/VideoFxSettings.tsx`

- [ ] **Step 1: Map SettingsPanel sections**

Read App.jsx lines 1739-3332 and identify the CollapsiblePanel boundaries. Each collapsible section maps to a sub-panel component.

The current SettingsPanel has these sections (identified by `togglePanel` calls):
1. Model selection
2. API keys
3. Agent config
4. Default artifacts
5. Appearance (theme, app name, timestamps)
6. Background effects
7. Terminal cursor
8. Video FX

- [ ] **Step 2: Create orchestrator `SettingsPanel.tsx`**

~120 lines. Owns:
- `openPanel` state (which section is expanded)
- Dirty tracking: each backend sub-panel exposes `isDirty` and `save()` via refs
- `attemptClose` logic (existing from lines 1952-1959)
- Renders sub-panels inside `CollapsiblePanel` wrappers

Props: `onClose: () => void`

**New behavior:** unified "save all" button that calls each dirty sub-panel's `save()`. Existing code has independent saves — this is a deliberate UX improvement.

- [ ] **Step 3: Create backend sub-panels**

Each manages its own draft/saved state and exposes `isDirty`/`save()` via `useImperativeHandle`:

- `ModelSettings.tsx` — lines ~1750-1770 (model state) + lines ~2190-2360 (model JSX)
- `AgentSettings.tsx` — lines ~1771-1780 (agent state) + lines ~2480-2880 (agent JSX)
- `KeySettings.tsx` — lines ~1762-1770 (key state) + lines ~2360-2475 (keys JSX)
- `ArtifactSettings.tsx` — lines ~1776-1780 (default artifacts state) + lines ~2880-2960 (artifacts JSX)

Each imports `apiCall`/`apiPost` from `../../api/client`.

- [ ] **Step 4: Create UI prefs sub-panels**

These write directly to `useUiPrefsStore` — changes are live, no save button needed:

- `AppearanceSettings.tsx` — theme dropdown, app name input, timestamps toggle (lines ~2960-3030)
- `BackgroundSettings.tsx` — effect dropdown, particle intensity slider (lines ~3030-3100)
- `TerminalCursorSettings.tsx` — cursor style, blink toggle (lines ~3100-3170)
- `VideoFxSettings.tsx` — VFX enabled, intensity, glitch toggle (lines ~3170-3330)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/
git commit -m "feat: extract SettingsPanel with sub-panel architecture"
```

---

## Task 17: AppShell + App.tsx + AlignmentEasterEgg

**Files:**
- Create: `frontend/src/components/AppShell.tsx`
- Create: `frontend/src/components/AlignmentEasterEgg.tsx`
- Create: `frontend/src/App.tsx`
- Delete: `frontend/src/App.jsx`

- [ ] **Step 1: Create `AlignmentEasterEgg.tsx`**

Extract from App.jsx lines 1428-1543. Reads toast from `useToastStore`. Props: `svgRaw`, `title`, `whisperText`, `fetchFromApi`.

- [ ] **Step 2: Create `AppShell.tsx`**

This is the main layout component (~200-300 lines). It:
- Reads stores via selectors (not all state — only what it needs)
- Owns shell-local state: `sidebarCollapsed`, `settingsOpen`, `sessionMenu`, `renameSession`, `deleteSession`
- Initializes stores on mount: calls `useAuthStore.getState().refresh()`, starts session/artifact polling
- Cleans up polling on unmount
- Handles logout cross-store reset sequence
- Renders layout: `<Sidebar>`, `<TerminalPane>`, `<ArtifactPanel>`, `<BackgroundRenderer>`, `<VideoFxOverlay>`, `<SettingsPanel>`, modals, login screen, topbar

Layout structure (from App.jsx lines 4966-6096):
```tsx
<div style={{ width: '100vw', height: '100vh', ... }}>
  <style>{globalStyles}</style>
  <div style={{ display: 'flex', filter, transform }}>
    <Sidebar ... />
    {/* main area: topbar + terminal + artifact panel */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* topbar */}
      <div style={{ display: 'flex', ... }}>
        {/* session title, model, cwd, PTY status */}
      </div>
      {/* terminal + artifact split */}
      <div style={{ flex: 1, display: 'flex' }}>
        <TerminalPane />
        {artifactPanelOpen && <ArtifactPanel ... />}
        {peekOpen && <PeekDrawer ... />}
      </div>
    </div>
  </div>
  <BackgroundRenderer />
  <AlignmentEasterEgg ... />
  {/* modals */}
  {sessionMenu && <SessionContextMenu ... />}
  {renameSession && <RenameSessionModal ... />}
  {deleteSession && <DeleteSessionModal ... />}
  {settingsOpen && <SettingsPanel ... />}
  <VideoFxOverlay ... />
</div>
```

- [ ] **Step 3: Create `App.tsx`**

```tsx
import { AppShell } from './components/AppShell'

export default function App() {
  return <AppShell />
}
```

- [ ] **Step 4: Update `main.tsx` import**

Change `import App from './App.jsx'` to `import App from './App.tsx'` (or just `'./App'` — Vite resolves `.tsx`).

- [ ] **Step 5: Delete `App.jsx`**

```bash
git rm frontend/src/App.jsx
```

- [ ] **Step 6: Verify dev server**

```bash
cd frontend && npm run dev
```

The app should render and function identically.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/AppShell.tsx frontend/src/components/AlignmentEasterEgg.tsx frontend/src/App.tsx frontend/src/main.tsx
git commit -m "feat: wire AppShell as composition root, delete App.jsx"
```

---

## Task 18: Convert Existing Components to TypeScript

**Files:**
- Convert: `frontend/src/components/ArtifactPanel.jsx` → `.tsx`
- Convert: `frontend/src/components/VideoFxOverlay.jsx` → `.tsx`
- Convert: `frontend/src/components/artifacts/ArtifactRenderer.jsx` → `.tsx`

- [ ] **Step 1: Convert `ArtifactPanel.jsx` → `ArtifactPanel.tsx`**

- Add props interface
- Add type annotations to state variables
- Fix any `any` types
- Import artifact types from `../../types`
- Where it receives artifact data as props, switch to reading from `useArtifactStore` if appropriate (or keep props — check how AppShell passes data)

- [ ] **Step 2: Convert `VideoFxOverlay.jsx` → `VideoFxOverlay.tsx`**

- Add props interface: `{ enabled: boolean; intensity: number; glitchNow: boolean; glitchSeed: number }`
- Or: read directly from `useVideoFxStore` and take zero props

- [ ] **Step 3: Convert `ArtifactRenderer.jsx` → `ArtifactRenderer.tsx`**

- Add props interface
- Type the bridge command handling
- Type the postMessage payloads

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/
git commit -m "refactor: convert existing components to TypeScript"
```

---

## Task 19: Convert Theme Module to TypeScript

**Files:**
- Convert: `frontend/src/theme/index.js` → `index.ts`
- Convert: `frontend/src/theme/store.js` → `store.ts`
- Convert: `frontend/src/theme/themes.js` → `themes.ts`
- Convert: `frontend/src/theme/utils.js` → `utils.ts`

- [ ] **Step 1: Convert `utils.js` → `utils.ts`**

Type `hexToRgb(hex: unknown): { r: number; g: number; b: number } | null`.

- [ ] **Step 2: Convert `themes.js` → `themes.ts`**

- Export a `Theme` interface from the shape of `THEMES.hermelin`
- Type `THEMES` as `Record<string, Theme>`
- Type `normalizeThemeId(raw: unknown): string`
- Fix SVG imports — add declarations for `*.svg?raw` and `*.svg` in `vite-env.d.ts`

- [ ] **Step 3: Convert `store.js` → `store.ts`**

- Type `AMBER` and `SLATE` Proxy objects (these have dynamic keys — use `Record<string, string>` or a specific palette type)
- Type `getActiveTheme()`, `setActiveThemeId()`

- [ ] **Step 4: Convert `index.js` → `index.ts`**

- Re-export with types
- Type `levelColor`, `semanticColor`, `formatTimeAgo`

- [ ] **Step 5: Update all imports**

Search for `from '../theme/index.js'` and `from './theme/index.js'` across all new `.ts`/`.tsx` files. Remove `.js` extensions (TypeScript resolves without them via `moduleResolution: bundler`).

- [ ] **Step 6: Add SVG declarations to `vite-env.d.ts`**

```ts
declare module '*.svg?raw' {
  const content: string
  export default content
}

declare module '*.svg' {
  const url: string
  export default url
}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/theme/ frontend/src/vite-env.d.ts
git commit -m "refactor: convert theme module to TypeScript"
```

---

## Task 20: Final Verification + Cleanup

**Files:**
- Modify: various (fix typecheck errors)
- Delete: `frontend/src/App.css` (if unused after refactor)

- [ ] **Step 1: Run typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Fix any errors. Common issues:
- Missing type annotations on event handlers
- Theme proxy types needing `as` casts
- SVG import types
- `window` augmentations for `__hermesArtifactBridgeCommands`

- [ ] **Step 2: Run build**

```bash
cd frontend && npm run build
```

Verify clean build with no errors.

- [ ] **Step 3: Run dev server and manually verify**

```bash
cd frontend && npm run dev
```

Verification checklist:
- [ ] App loads, background effect renders
- [ ] Login screen works (if auth enabled)
- [ ] Session list populates in sidebar
- [ ] New session button spawns terminal
- [ ] Terminal connects and accepts input
- [ ] Session auto-highlights in sidebar after spawn
- [ ] Click session in sidebar resumes it
- [ ] Search works with debounce
- [ ] Peek drawer opens on search hit click
- [ ] Settings panel opens/closes
- [ ] Theme changes apply live
- [ ] Background effect changes apply
- [ ] Cursor style changes apply
- [ ] Video FX toggle works
- [ ] Artifact panel opens when artifact arrives
- [ ] Artifact tabs work (switch, close)
- [ ] Artifact bridge commands work (strudel)
- [ ] Session rename works
- [ ] Session delete works
- [ ] Sidebar collapse/expand works
- [ ] Logout clears all state
- [ ] Window resize doesn't break layout

- [ ] **Step 4: Clean up unused files**

```bash
# Check if App.css is still imported anywhere
grep -r "App.css" frontend/src/
# If not, delete it
```

- [ ] **Step 5: Final commit**

```bash
git add -A frontend/
git commit -m "chore: typecheck passing, verification complete"
```

- [ ] **Step 6: Verify full git diff is clean**

```bash
git diff main --stat
```

Review the stat: ~45 new files, 1 deleted file (App.jsx), several converted files.
