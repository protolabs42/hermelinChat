# App.jsx Decomposition — Design Spec

## Problem

`frontend/src/App.jsx` is 6097 lines containing the entire frontend: auth, sessions, terminal, artifacts, settings, sidebar, background effects, video FX, modals, search, and peek. Every future change requires navigating a monolith. No unit testing is possible. Re-render blast radius is the entire app.

## Goals

- Easy DX: small, focused files with clear boundaries
- Extensibility: new features (background effects, settings sections, sidebar features) don't require touching core files
- Maintainability: each file independently understandable
- AI-assistant friendly: files fit in context windows, discoverable naming, self-documenting types

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| State management | Zustand | Selector-based rerenders, zero providers, stores are plain testable functions, cross-store access via `getState()` |
| File organization | Feature folders | Co-located components + types per domain, AI agents work in one directory |
| TypeScript | Strict mode, `allowJs: true` | Type exports/props/stores explicitly, let locals infer. Incremental at language level even though architecture is big-bang |
| Migration strategy | Big-bang feature branch | Single developer, interconnected refactor, verify before merge |
| SettingsPanel | Orchestrator + sub-panels | Transactional save across backends, each section independently editable |
| Terminal lifecycle | Explicit state machine | Replace 5 refs + 3 polling effects + output parsing heuristics with phase-driven flow |
| API layer | Typed fetch wrapper | Deduplicate ~23 fetch calls with ~9 repeated 401 checks |
| Shell UI state | Local component state | Sidebar collapsed, settings open, modals — layout concerns, not domain state |
| Types | Co-located per domain | Shared contracts in `types/`, domain-specific types next to their store |

## Architecture

### Stores (8)

**`stores/auth.ts`**
- State: `loading`, `enabled`, `authenticated`, `loginError`
- Actions: `login(password)`, `logout()`, `refresh()`, `setUnauthenticated()`
- No dependencies on other stores
- Other stores call `useAuthStore.getState().authenticated` to gate API calls

**`stores/ui-prefs.ts`**
- State: `prefs: UiPrefs`, `activeTheme: Theme`, `effectiveBgKind`, `appNameLabel`
- Actions: `update(updater)`
- Loads from localStorage on creation, auto-persists via zustand `subscribe`
- Pure local state, no API calls

**`stores/video-fx.ts`**
- State: `enabled`, `factor`, `glitchNow`, `glitchSeed`, `filter` (CSS), `transform` (CSS)
- Actions: `startGlitchLoop()`, `stopGlitchLoop()`
- Reads intensity from `useUiPrefsStore`
- Owns the glitch pulse timer lifecycle

**`stores/sessions.ts`** — data + actions
- State: `sessions[]`, `activeSessionId`, `activeSession`, `grouped`, `runtimeInfo: { loading, defaultModel, spawnCwd }`
- Actions: `startPolling()`, `stopPolling()`, `startNewSession()`, `resumeSession(id)`, `rename(id, title)`, `delete(id)`, `setActiveSessionId(sid)`, `fetchRuntimeInfo()`, `reset()`
- Depends on auth store for gating
- Uses `apiCall` for all fetches
- Polling modes (preserving current UX):
  - **Regular**: 10s interval for session list
  - **Fast-poll**: 1s interval when `activeSessionId` is set but not yet in `sessions[]` (session appearing in sidebar after spawn)
  - **Fallback detection**: 1s interval when terminal is in `detecting` phase — polls `/api/sessions` for a session newer than spawn time or absent from a baseline snapshot of pre-spawn session IDs. Stops after 20 attempts or success.
- `runtimeInfo` fetched from `/api/info` on auth, provides `defaultModel` and `spawnCwd` for topbar display
- `HERMELINCHAT_VERSION` constant exported from this store (reads `__APP_VERSION__` global)

**`stores/terminal.ts`** — PTY lifecycle state machine
- State: `state: TerminalState`, `spawnNonce`
- Derived: `connected` — selector `(s) => s.state.phase === 'connected' || s.state.phase === 'detecting'`
- Actions: `spawn(resumeId)`, `onConnectionChange(isUp)`, `onDetectedSessionId(sid)`, `reset()`
- Phase transitions:
  - idle → connecting (spawn called, `spawnNonce` incremented)
  - connecting → connected (WS opens, `resumeId` set if resuming)
  - connected → detecting (new session, `resumeId=null`, records `startedAt` timestamp and `baselineIds: Set<string>` snapshot of current session IDs from `useSessionStore`)
  - detecting → connected (session ID found via terminal output regex OR fallback poll in sessions store)
  - any → idle (WS closes)
- On detection: calls `useSessionStore.getState().setActiveSessionId(sid)`
- On spawn: calls `useSessionStore.getState().startNewSession()` which snapshots baseline IDs and clears search
- `detecting` phase carries: `{ startedAt: number, baselineIds: Set<string> }` — used by sessions store's fallback detection poll

**`stores/artifacts.ts`** — panel UI state
- State: `tabs[]`, `activeId`, `panelOpen`, `panelPinned`, `panelWidth`, `panelDismissed`
- Actions: `setActiveId(id)`, `setPanelWidth(w)`, `openPanel()`, `closePanel()`, `togglePin()`, `applyArtifacts(items, opts)`, `deleteTab(id)`, `startPolling()`, `stopPolling()`, `reset()`
- `openPanel()` calls `useSearchStore.getState().closePeek()`
- `applyArtifacts` behavioral contract (must be preserved exactly):
  - Merges new items with existing tabs, preserving dropdown order for known IDs (prevents list jumping under mouse)
  - Only auto-opens panel if `!panelDismissed || hasNewIds` (new IDs the panel hasn't seen)
  - Skips all panel state changes when `next.length === 0` (prevents panel collapsing on empty refresh)
  - `opts.openOnChange` defaults to `true`; set `false` for delete/settings-save refreshes
- Polling: 1.5s interval for `/api/artifacts`, applies via `applyArtifacts`
- Bridge command handling via stateless `artifacts/bridge.ts` module

**`artifacts/bridge.ts`** — stateless control message router
- Handles 5 WS control message types routed from TerminalPane's `onControlMessage`:
  - `artifact` — single artifact upsert → `applyArtifacts([payload], { openOnChange: true })`
  - `artifact_list` — bulk replace → `applyArtifacts(payload, { openOnChange: true })`
  - `artifact_focus` — activate tab + open panel → `setActiveId()` + `openPanel()`
  - `artifact_close` — close one tab or close_all → `applyArtifacts(filtered)` or reset + close panel
  - `artifact_bridge_command` — forward to iframe via `window.__hermesArtifactBridgeCommands` queue + `CustomEvent`
- Pure function: `handleControlMessage(payload: unknown): boolean`
- Calls into `useArtifactStore.getState()` for mutations

**`stores/search.ts`** — search + peek
- State: `query`, `results[]`, `searching`, `groups`, `expandedSessions`, peek state
- Actions: `setQuery(q)`, `toggleSession(id)`, `openPeek(hit)`, `closePeek()`, `reset()`
- Debounced search via `setQuery` (250ms internal timer)
- Depends on auth store for gating

**`stores/toast.ts`**
- State: `toast: { id, text } | null`
- Actions: `show(text, ms?)`
- Auto-clears after timeout

### Cross-Store Communication

- Direct `getState()` calls — explicit, traceable, grep-able
- Auth logout calls `reset()` on sessions, artifacts, search, AND terminal (clears phase to idle, resets spawnNonce)
- Terminal detection calls `sessions.setActiveSessionId()`
- Artifact panel open calls `search.closePeek()`
- No event bus, no pub/sub

### Typed API Layer

**`api/client.ts`** (~40 lines):
- `apiCall<T>(path, opts?)` — fetch wrapper with 401 handling
- `apiPost<T>(path, body)` — convenience for JSON POST
- `ApiError` class with `status` and `detail`
- 401 responses call `useAuthStore.getState().setUnauthenticated()`
- Response types co-located with each store

### SettingsPanel Decomposition

**`settings/SettingsPanel.tsx`** (~120 lines) — orchestrator:
- Section navigation (CollapsiblePanel open state)
- Dirty tracking across sub-panels
- Single "save all" action (**new behavior** — current code has independent save flows per section; unifying is a deliberate UX improvement)
- Unsaved-changes guard on close (**existing behavior** — `attemptClose` already checks dirty state)

**Sub-panels** (each ~80-200 lines):

| File | Edits | Save behavior |
|---|---|---|
| `ModelSettings.tsx` | Default model | Backend save via orchestrator |
| `AgentSettings.tsx` | config.yaml agent block | Backend save via orchestrator |
| `KeySettings.tsx` | API keys | Backend save via orchestrator |
| `ArtifactSettings.tsx` | Default artifacts | Backend save via orchestrator |
| `AppearanceSettings.tsx` | Theme, app name, timestamps | Live via UiPrefs store |
| `BackgroundSettings.tsx` | Background effect, particles | Live via UiPrefs store |
| `TerminalCursorSettings.tsx` | Cursor style, blink | Live via UiPrefs store |
| `VideoFxSettings.tsx` | VFX toggle, intensity, glitch | Live via UiPrefs store |

## File Structure

```
frontend/src/
├── App.tsx                          # ~30 lines — <AppShell />
├── api/
│   └── client.ts                    # typed fetch wrapper, 401 handling
├── stores/
│   ├── auth.ts
│   ├── ui-prefs.ts
│   ├── video-fx.ts
│   ├── sessions.ts
│   ├── terminal.ts
│   ├── artifacts.ts
│   ├── search.ts
│   └── toast.ts
├── types/
│   └── index.ts                     # shared contracts only (Session, Artifact, etc.)
├── components/
│   ├── AppShell.tsx                  # layout, shell-local state, topbar (session/model/cwd/PTY status)
│   ├── sidebar/
│   │   ├── Sidebar.tsx
│   │   ├── SidebarHeader.tsx
│   │   ├── SessionList.tsx
│   │   ├── SessionRow.tsx
│   │   ├── SearchPanel.tsx
│   │   ├── SearchHitRow.tsx
│   │   └── PeekDrawer.tsx
│   ├── terminal/
│   │   ├── TerminalPane.tsx
│   │   └── utils.ts
│   ├── settings/
│   │   ├── SettingsPanel.tsx
│   │   ├── ModelSettings.tsx
│   │   ├── AgentSettings.tsx
│   │   ├── KeySettings.tsx
│   │   ├── ArtifactSettings.tsx
│   │   ├── AppearanceSettings.tsx
│   │   ├── BackgroundSettings.tsx
│   │   ├── TerminalCursorSettings.tsx
│   │   └── VideoFxSettings.tsx
│   ├── backgrounds/
│   │   ├── BackgroundRenderer.tsx
│   │   ├── ParticleField.tsx
│   │   ├── MatrixRainField.tsx
│   │   ├── NousCRTField.tsx
│   │   ├── SamaritanField.tsx
│   │   ├── GrainOverlay.tsx
│   │   └── ScanlinesOverlay.tsx
│   ├── modals/
│   │   ├── RenameSessionModal.tsx
│   │   ├── DeleteSessionModal.tsx
│   │   ├── SessionContextMenu.tsx
│   │   └── LoginScreen.tsx
│   ├── shared/
│   │   ├── icons.tsx
│   │   ├── CollapsiblePanel.tsx
│   │   ├── HighlightedSnippet.tsx
│   │   └── SidebarItem.tsx
│   ├── artifacts/
│   │   ├── ArtifactRenderer.tsx
│   │   └── bridge.ts
│   ├── ArtifactPanel.tsx              # existing, .jsx → .tsx in-place conversion
│   ├── VideoFxOverlay.tsx             # existing, .jsx → .tsx in-place conversion
│   └── AlignmentEasterEgg.tsx
├── utils/
│   ├── formatting.ts
│   ├── ui-prefs.ts
│   └── svg.ts
├── theme/                           # existing, .js → .ts
│   ├── index.ts
│   ├── store.ts
│   ├── themes.ts
│   └── utils.ts
└── fonts.css

```

## TypeScript Configuration

- `strict: true`, `allowJs: true`, `noEmit: true`
- New deps: `typescript`, `zustand`, `@types/dompurify`
- New script: `"typecheck": "tsc --noEmit"`
- Vite handles `.tsx` natively via esbuild

**Typing discipline:**
- Explicit: store interfaces, API response types, component props, hook returns
- Inferred: local variables, intermediate computations, event handlers where obvious

## Migration Order (within feature branch)

1. Add tsconfig, typescript, zustand deps
2. Build `api/client.ts`
3. Build `types/index.ts` (shared contracts)
4. Build stores (`.ts`) — pure logic, no JSX
5. Build `utils/` (`.ts`)
6. Build components (`.tsx`) — leaf components first, then containers
7. Build `AppShell.tsx` — wire everything together
8. Replace `App.jsx` with `App.tsx`
9. Convert existing components (ArtifactPanel, VideoFxOverlay, ArtifactRenderer) `.jsx` → `.tsx`
10. Convert `theme/*.js` → `.ts`
11. `tsc --noEmit` — zero errors
12. Manual verification against running app

## New Dependency

| Package | Size | Purpose |
|---|---|---|
| `zustand` | ~1KB gzipped | State management — selector-based rerenders, zero providers |

## Review Credits

Architecture reviewed by Ruby (gpt-5.4) who identified:
- SessionContext/ArtifactContext granularity issues
- Missing shell UI boundary
- Missing typed API layer
- Terminal state machine need
- Type co-location recommendation
- TS migration risk with big-bang coupling
