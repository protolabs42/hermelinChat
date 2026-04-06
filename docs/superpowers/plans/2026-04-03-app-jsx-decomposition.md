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

- [x] **Step 1: Create feature branch**
- [x] **Step 2: Install TypeScript + zustand**
- [x] **Step 3: Create `frontend/tsconfig.json`**
- [x] **Step 4: Add typecheck script to `frontend/package.json`**
- [x] **Step 5: Rename `vite.config.js` → `vite.config.ts`**
- [x] **Step 6: Create `frontend/src/vite-env.d.ts`**
- [x] **Step 7: Rename `main.jsx` → `main.tsx`**
- [x] **Step 8: Update `frontend/index.html`**
- [x] **Step 9: Verify dev server still starts**
- [x] **Step 10: Commit**

---

## Task 2: Shared Types + API Client

**Files:**
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/api/client.ts`

- [x] **Step 1: Create directory structure**
- [x] **Step 2: Create `frontend/src/types/index.ts`**
- [x] **Step 3: Create `frontend/src/api/client.ts`**
- [x] **Step 4: Commit**

---

## Task 3: Stores — Toast + Auth

**Files:**
- Create: `frontend/src/stores/toast.ts`
- Create: `frontend/src/stores/auth.ts`

These two stores have zero dependencies on other stores, so they go first.

- [x] **Step 1: Create stores directory**
- [x] **Step 2: Create `frontend/src/stores/toast.ts`**
- [x] **Step 3: Create `frontend/src/stores/auth.ts`**
- [x] **Step 4: Commit**

---

## Task 4: Stores — UI Prefs + Utils

**Files:**
- Create: `frontend/src/utils/ui-prefs.ts`
- Create: `frontend/src/stores/ui-prefs.ts`

- [x] **Step 1: Create utils directory**
- [x] **Step 2: Create `frontend/src/utils/ui-prefs.ts`**
- [x] **Step 3: Create `frontend/src/stores/ui-prefs.ts`**
- [x] **Step 4: Commit**

---

## Task 5: Store — Video FX

**Files:**
- Create: `frontend/src/stores/video-fx.ts`

- [x] **Step 1: Create `frontend/src/stores/video-fx.ts`**
- [x] **Step 2: Commit**

---

## Task 6: Store — Sessions

**Files:**
- Create: `frontend/src/stores/sessions.ts`

- [x] **Step 1: Create `frontend/src/stores/sessions.ts`**
- [x] **Step 2: Commit**

---

## Task 7: Store — Terminal

**Files:**
- Create: `frontend/src/stores/terminal.ts`

- [x] **Step 1: Create `frontend/src/stores/terminal.ts`**
- [x] **Step 2: Commit**

---

## Task 8: Store — Search

**Files:**
- Create: `frontend/src/stores/search.ts`

- [x] **Step 1: Create `frontend/src/stores/search.ts`**
- [x] **Step 2: Commit**

---

## Task 9: Store — Artifacts + Bridge

**Files:**
- Create: `frontend/src/stores/artifacts.ts`
- Create: `frontend/src/components/artifacts/bridge.ts`

- [x] **Step 1: Create `frontend/src/stores/artifacts.ts`**
- [x] **Step 2: Create `frontend/src/components/artifacts/bridge.ts`**
- [x] **Step 3: Commit**

---

## Task 10: Utils — Formatting + SVG

**Files:**
- Create: `frontend/src/utils/formatting.ts`
- Create: `frontend/src/utils/svg.ts`

- [x] **Step 1: Create `frontend/src/utils/formatting.ts`**
- [x] **Step 2: Create `frontend/src/utils/svg.ts`**
- [x] **Step 3: Commit**

---

## Task 11: Shared Components

**Files:**
- Create: `frontend/src/components/shared/icons.tsx`
- Create: `frontend/src/components/shared/CollapsiblePanel.tsx`
- Create: `frontend/src/components/shared/HighlightedSnippet.tsx`
- Create: `frontend/src/components/shared/SidebarItem.tsx`

- [x] **Step 1: Create `frontend/src/components/shared/icons.tsx`**
- [x] **Step 2: Create `frontend/src/components/shared/CollapsiblePanel.tsx`**
- [x] **Step 3: Create `frontend/src/components/shared/HighlightedSnippet.tsx`**
- [x] **Step 4: Create `frontend/src/components/shared/SidebarItem.tsx`**
- [x] **Step 5: Commit**

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

- [x] **Step 1: Extract each background component**
- [x] **Step 2: Create `BackgroundRenderer.tsx`**
- [x] **Step 3: Commit**

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

- [x] **Step 1: Extract `SessionRow.tsx`**
- [x] **Step 2: Extract `SearchHitRow.tsx`**
- [x] **Step 3: Extract `PeekDrawer.tsx`**
- [x] **Step 4: Create `SessionList.tsx`**
- [x] **Step 5: Create `SearchPanel.tsx`**
- [x] **Step 6: Create `SidebarHeader.tsx`**
- [x] **Step 7: Create `Sidebar.tsx`**
- [x] **Step 8: Commit**

---

## Task 14: Terminal Component

**Files:**
- Create: `frontend/src/components/terminal/utils.ts`
- Create: `frontend/src/components/terminal/TerminalPane.tsx`

- [x] **Step 1: Create `frontend/src/components/terminal/utils.ts`**
- [x] **Step 2: Create `frontend/src/components/terminal/TerminalPane.tsx`**
- [x] **Step 3: Commit**

---

## Task 15: Modal Components

**Files:**
- Create: `frontend/src/components/modals/LoginScreen.tsx`
- Create: `frontend/src/components/modals/SessionContextMenu.tsx`
- Create: `frontend/src/components/modals/RenameSessionModal.tsx`
- Create: `frontend/src/components/modals/DeleteSessionModal.tsx`

- [x] **Step 1: Create `LoginScreen.tsx`**
- [x] **Step 2: Create `SessionContextMenu.tsx`**
- [x] **Step 3: Create `RenameSessionModal.tsx`**
- [x] **Step 4: Create `DeleteSessionModal.tsx`**
- [x] **Step 5: Commit**

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

- [x] **Step 1: Map SettingsPanel sections**
- [x] **Step 2: Create orchestrator `SettingsPanel.tsx`**
- [x] **Step 3: Create backend sub-panels**
- [x] **Step 4: Create UI prefs sub-panels**
- [x] **Step 5: Commit**

---

## Task 17: AppShell + App.tsx + AlignmentEasterEgg

**Files:**
- Create: `frontend/src/components/AppShell.tsx`
- Create: `frontend/src/components/AlignmentEasterEgg.tsx`
- Create: `frontend/src/App.tsx`
- Delete: `frontend/src/App.jsx`

- [x] **Step 1: Create `AlignmentEasterEgg.tsx`**
- [x] **Step 2: Create `AppShell.tsx`**
- [x] **Step 3: Create `App.tsx`**
- [x] **Step 4: Update `main.tsx` import**
- [x] **Step 5: Delete `App.jsx`**
- [x] **Step 6: Verify dev server**
- [x] **Step 7: Commit**

---

## Task 18: Convert Existing Components to TypeScript

**Files:**
- Convert: `frontend/src/components/ArtifactPanel.jsx` → `.tsx`
- Convert: `frontend/src/components/VideoFxOverlay.jsx` → `.tsx`
- Convert: `frontend/src/components/artifacts/ArtifactRenderer.jsx` → `.tsx`

- [x] **Step 1: Convert `ArtifactPanel.jsx` → `ArtifactPanel.tsx`**
- [x] **Step 2: Convert `VideoFxOverlay.jsx` → `VideoFxOverlay.tsx`**
- [x] **Step 3: Convert `ArtifactRenderer.jsx` → `ArtifactRenderer.tsx`**
- [x] **Step 4: Commit**

---

## Task 19: Convert Theme Module to TypeScript

**Files:**
- Convert: `frontend/src/theme/index.js` → `index.ts`
- Convert: `frontend/src/theme/store.js` → `store.ts`
- Convert: `frontend/src/theme/themes.js` → `themes.ts`
- Convert: `frontend/src/theme/utils.js` → `utils.ts`

- [x] **Step 1: Convert `utils.js` → `utils.ts`**
- [x] **Step 2: Convert `themes.js` → `themes.ts`**
- [x] **Step 3: Convert `store.js` → `store.ts`**
- [x] **Step 4: Convert `index.js` → `index.ts`**
- [x] **Step 5: Update all imports**
- [x] **Step 6: Add SVG declarations to `vite-env.d.ts`**
- [x] **Step 7: Commit**

---

## Task 20: Final Verification + Cleanup

**Files:**
- Modify: various (fix typecheck errors)
- Delete: `frontend/src/App.css` (if unused after refactor)

- [x] **Step 1: Run typecheck**
- [x] **Step 2: Run build**
- [x] **Step 3: Run dev server and manually verify**
- [x] **Step 4: Clean up unused files**
- [x] **Step 5: Final commit**
- [x] **Step 6: Verify full git diff is clean**
