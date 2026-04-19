# Aurora Chat Future Interface Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Ship a visibly clearer, crisper, more powerful Aurora Chat shell where workspaces are first-class, session/workspace actions are legible, and advanced panes can mature without clutter.

**Architecture:** Build on the current v2 Tauri + React shell. Keep the existing workspace persistence model and workspace switcher, but promote workspaces into primary top chrome via a workspace strip and explicit create actions. Add a structured pane model in the status/top shell over time, not via a disruptive layout rewrite. Preserve honesty in continuity language throughout.

**Tech Stack:** Tauri v2, React 18, TypeScript, Zustand, existing lane2 workspace persistence + continuity helpers

**Spec:** `docs/superpowers/specs/2026-04-19-aurora-chat-future-interface-design.md`

---

## Implementation philosophy

- Do not rewrite the shell from scratch.
- Promote existing working concepts into obvious UI.
- Keep the current WorkspaceSwitcher as overflow/power UI.
- Use TDD for each behavior slice.
- Commit after each task.
- Prefer narrow slices that visibly improve product legibility.

## Current grounding

Existing assets we should reuse:
- `v2/src/stores/workspaces.ts` — active workspace + persisted workspaces
- `v2/src/components/WorkspaceSwitcher.tsx` — current power UI for search/select/create
- `v2/src/lane2/workspace-summary.ts` — summary/action-label logic
- `v2/src/components/StatusBar.tsx` — current shell/breadcrumb area
- `v2/src/stores/sidebar.ts` — sidebar/open switcher state
- `v2/src/stores/chat.ts` — current new-session behavior

---

## Phase 1 — Workspace strip as primary navigation

### Task 1: Create a pure workspace-strip view model

**Objective:** Extract a pure helper that converts workspace state into a compact top-strip representation.

**Files:**
- Create: `v2/src/app/workspace-strip.ts`
- Create: `v2/src/app/__tests__/workspace-strip.test.ts`
- Reuse: `v2/src/lane2/workspace-summary.ts`

**Step 1: Write failing tests**

Cover:
- active workspace gets active styling flag
- summary badge prefers continuity headline/action meaning over generic idle labels
- strip model truncates into a compact top-bar label without losing state tone
- overflow trigger appears when workspace count exceeds visible max

Example test cases:
- 1 active workspace, no overflow
- 4 workspaces with mixed statuses, no overflow
- 8 workspaces, overflow count present

**Step 2: Run test to verify failure**

Run: `tsx src/app/__tests__/workspace-strip.test.ts`
Expected: fail because helper does not exist.

**Step 3: Implement minimal helper**

Export a pure helper that accepts:
- list of `WorkspaceState`
- active workspace id
- max visible count

Return:
- visible tabs with `workspaceId`, `isActive`, `tone`, `label`, `hint`
- overflow count/list

**Step 4: Re-run targeted test**

Run: `tsx src/app/__tests__/workspace-strip.test.ts`
Expected: pass.

**Step 5: Commit**

```bash
git add v2/src/app/workspace-strip.ts v2/src/app/__tests__/workspace-strip.test.ts
git commit -m "feat: add workspace strip view model"
```

### Task 2: Build `WorkspaceTabs` component

**Objective:** Add a reusable top-chrome component that renders visible workspace tabs plus `+ workspace`.

**Files:**
- Create: `v2/src/components/WorkspaceTabs.tsx`
- Modify: `v2/src/components/StatusBar.tsx`

**Step 1: Write a minimal component test or pure render-state test if practical**

If no frontend harness exists for this component, test the view-model only and keep the component thin.

**Step 2: Implement component**

Requirements:
- horizontally renders visible tabs
- active tab is clearly differentiated
- compact tone indicator per tab
- `+ workspace` button always visible
- overflow button appears when needed
- clicking a tab activates that workspace
- clicking overflow opens existing `WorkspaceSwitcher`

**Step 3: Wire into `StatusBar.tsx`**

Replace the single `ws:default` clickable breadcrumb with:
- visible workspace strip
- overflow entry point to current `WorkspaceSwitcher`
- existing project breadcrumb remains nearby but secondary

**Step 4: Verify manually**

Run:
- `npm run build`
- Tauri dev or browser preview

Check:
- tabs render crisply
- current workspace still switchable
- current switcher still accessible

**Step 5: Commit**

```bash
git add v2/src/components/WorkspaceTabs.tsx v2/src/components/StatusBar.tsx
git commit -m "feat: add visible workspace strip"
```

### Task 3: Make workspace creation explicit

**Objective:** Split workspace creation into clear choices instead of one ambiguous button.

**Files:**
- Modify: `v2/src/components/WorkspaceSwitcher.tsx`
- Optional create: `v2/src/components/NewWorkspaceMenu.tsx`
- Modify: `v2/src/lane2/persistence.ts` if needed for a blank-workspace path
- Add tests in: `v2/src/lane2/__tests__/persistence.test.ts` or new pure helper tests

**Step 1: Write failing tests for workspace creation semantics**

Need coverage for:
- duplicate current workspace copies current state into new id
- blank workspace seeds empty/default workspace state rather than cloning the current one

**Step 2: Run tests to confirm failure**

Run targeted lane2 test command.

**Step 3: Implement create semantics**

New actions:
- `New blank workspace`
- `Duplicate current workspace`

Do not use `window.prompt` as the only UX long-term, but it is acceptable for the first slice if wrapped by explicit action choice.

**Step 4: Verify manually**

Check:
- creating blank workspace opens a clean desk
- duplicating current workspace preserves remembered continuity

**Step 5: Commit**

```bash
git add v2/src/components/WorkspaceSwitcher.tsx v2/src/lane2/persistence.ts v2/src/lane2/__tests__/persistence.test.ts
git commit -m "feat: split blank and duplicate workspace creation"
```

---

## Phase 2 — Clarify chat/session vs workspace actions

### Task 4: Separate new chat from new workspace visually

**Objective:** Ensure the user can immediately distinguish session creation from workspace creation.

**Files:**
- Modify: `v2/src/components/StatusBar.tsx`
- Modify: `v2/src/hooks/useKeyboardShortcuts.ts`
- Add tests if extracting a pure action registry helper makes sense

**Step 1: Extract or document action intents**

Actions needed:
- New chat in current workspace
- Open workspace switcher
- Create workspace

**Step 2: Update top-bar controls**

Suggested outcome:
- keep `+` for new chat only if label/tooltip is explicit
- add dedicated `+ workspace` or icon+label affordance in workspace strip
- add a keyboard shortcut for workspace switcher and/or create workspace

**Step 3: Verify discoverability**

Manual check: without prior knowledge, a user should be able to tell how to:
- start a new conversation
- create/switch workspaces

**Step 4: Commit**

```bash
git add v2/src/components/StatusBar.tsx v2/src/hooks/useKeyboardShortcuts.ts
git commit -m "feat: clarify chat and workspace actions"
```

---

## Phase 3 — Continuity directly on workspace tabs

### Task 5: Add compact continuity summaries to tabs

**Objective:** Make each workspace tab whisper what’s inside.

**Files:**
- Modify: `v2/src/app/workspace-strip.ts`
- Modify: `v2/src/components/WorkspaceTabs.tsx`
- Reuse: `v2/src/lane2/workspace-summary.ts`
- Add/expand tests: `v2/src/app/__tests__/workspace-strip.test.ts`

**Step 1: Write failing tests**

Cases:
- remembered active work shows active tone + compact hint
- unresolved work shows ready tone + count/hint
- idle waiting workspace stays quiet/simple

**Step 2: Implement compact hint rules**

Examples:
- `active`
- `2 unresolved`
- `coedit open`
- `idle`

**Step 3: Verify strip readability**

Tabs must remain visually compact. Avoid turning them into noisy cards.

**Step 4: Commit**

```bash
git add v2/src/app/workspace-strip.ts v2/src/components/WorkspaceTabs.tsx v2/src/app/__tests__/workspace-strip.test.ts
git commit -m "feat: show compact continuity on workspace tabs"
```

### Task 6: Deepen unresolved target semantics

**Objective:** Move from generic unresolved targets toward user-meaningful posture labels.

**Files:**
- Modify: `v2/src/lane2/schema.ts`
- Modify: `v2/src/lane2/persistence.ts`
- Modify: `v2/src/lane2/workspace-summary.ts`
- Modify/add tests in `v2/src/lane2/__tests__/...`

**Step 1: Write failing tests first**

Add semantic examples such as:
- `waiting-for-tool`
- `draft-in-progress`
- `coedit-open`
- `session-booting`

**Step 2: Add schema support**

Keep it small and typed.

Suggested extension:
- unresolved target metadata with `reason` / `label`
- invocation posture helpers feeding continuity summaries

**Step 3: Surface semantics in summaries and cards**

Examples:
- `Waiting on tool result`
- `Drafting deploy reply`
- `Coedit proof open`

**Step 4: Verify with lane2 tests**

Run: `npm run lane2:test`

**Step 5: Commit**

```bash
git add v2/src/lane2/schema.ts v2/src/lane2/persistence.ts v2/src/lane2/workspace-summary.ts v2/src/lane2/__tests__
git commit -m "feat: enrich continuity posture semantics"
```

---

## Phase 4 — Formalize right-rail panes

### Task 7: Define pane model in store

**Objective:** Give the right rail a workspace-scoped, explicit pane model.

**Files:**
- Create: `v2/src/stores/panes.ts`
- Create tests: `v2/src/stores/__tests__/panes.test.ts`
- Modify: `v2/src/lane2/schema.ts` if pane config needs persistence

**Step 1: Write failing tests**

Need coverage for:
- open pane
- close pane
- stacked pane arrangement
- per-workspace persistence shape

**Step 2: Implement store**

Initial panes:
- Plan
- Tasks
- Surfaces
- Artifacts
- Context

Keep layout constrained:
- hidden
- single pane
- stacked pair

**Step 3: Verify state transitions**

Run targeted tests.

**Step 4: Commit**

```bash
git add v2/src/stores/panes.ts v2/src/stores/__tests__/panes.test.ts v2/src/lane2/schema.ts
git commit -m "feat: add workspace-scoped pane model"
```

### Task 8: Turn current right sidebar into formal pane stack

**Objective:** Promote the existing ad hoc right rail into a deliberate pane system.

**Files:**
- Modify the current right-panel components in `v2/src/components/`
- Potentially create: `v2/src/components/RightPaneStack.tsx`
- Modify: `v2/src/App.tsx`

**Step 1: Build stack shell**

Requirements:
- render selected pane(s)
- support hiding/collapsing
- support workspace-scoped persistence

**Step 2: Wire Plan and Tasks first**

Do not attempt Surfaces/Artifacts/Context all at once. Start with the panes already conceptually present.

**Step 3: Verify manual behavior**

Check:
- right rail can be hidden without losing the main shell
- reopening restores prior pane choice in that workspace

**Step 4: Commit**

```bash
git add v2/src/components/RightPaneStack.tsx v2/src/App.tsx [other touched pane files]
git commit -m "feat: formalize right pane stack"
```

---

## Phase 5 — Final crispness pass

### Task 9: Tighten visual hierarchy and affordances

**Objective:** Make the shell feel obviously usable and visually crisp.

**Files:**
- Likely modify: `v2/src/components/StatusBar.tsx`
- `v2/src/components/WorkspaceTabs.tsx`
- `v2/src/components/WorkspaceSwitcher.tsx`
- theme tokens/components as needed

**Step 1: Audit low-value chrome**

Reduce ambiguity around:
- tiny icons with unclear action
- overloaded breadcrumb semantics
- weak active state contrast
- hidden-only controls

**Step 2: Refine spacing and active states**

Specific targets:
- stronger current-workspace emphasis
- less cramped control groupings
- clearer separation of project, workspace, and session context

**Step 3: Improve empty states**

Ensure empty session / empty workspace states orient the user usefully.

**Step 4: Commit**

```bash
git add [touched UI files]
git commit -m "feat: polish future workspace shell"
```

---

## Verification matrix

After each major phase, verify all of the following:

### Build and tests
```bash
cd /home/inu/hermelinChat/v2
npm run build
npm run test
```

### Tauri verification
```bash
cd /home/inu/hermelinChat
cargo tauri dev
```

### Manual UX checklist
- [ ] New user can discover workspace switching without asking
- [ ] New user can distinguish new chat vs new workspace
- [ ] Active workspace is obvious at a glance
- [ ] Workspace switching preserves continuity honestly
- [ ] Right rail feels useful, not cluttered
- [ ] Empty states are helpful and calm
- [ ] Shell still feels like Aurora, not generic adminware

## First recommended execution slice

If implementing immediately, do this order first:

1. Task 1 — workspace strip view model
2. Task 2 — visible workspace strip
3. Task 3 — split blank vs duplicate workspace creation
4. Task 4 — separate new chat vs new workspace affordances

That sequence gives the biggest product-legibility gain for the least architectural risk.

## Notes for the implementer

- Reuse existing lane2 continuity helpers aggressively.
- Do not break honesty around resumability.
- The current `WorkspaceSwitcher` is not wrong — it is just in the wrong role. Keep it as the power path.
- Avoid an IDE-style chrome explosion. The shell should stay calm even as it gets more capable.
- The target emotional feel is: **crisp, powerful, inhabited**.
