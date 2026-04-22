# hermelinChat lifecycle hardening and desktop E2E plan

> For Hermes: use subagent-driven-development for isolated implementation slices where useful, but keep backend/frontend contract edits synchronized.

Goal: eliminate workspace-switch/startup wedges by hardening ACP liveness, session routing, workspace activation, and persistence, while extending desktop E2E and isolating it from live user state.

Architecture:
- Make ACP connection truth reflect real child-process health and preserve session identity on backend events.
- Move workspace activation from a best-effort multi-store sequence to an explicit, rollback-safe orchestration path.
- Align Rust/TS workspace schema and serialize lane2 persistence under a lock.
- Expand desktop E2E from smoke-only to startup recovery and workspace switch flows, with isolated runtime state.

Tech stack: Tauri v2, Rust, React, Zustand, selenium-webdriver + tauri-driver, mocha, npm.

---

## Task 1: Add backend ACP health state instead of inferring from Option<AcpClient>
Files:
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/acp/client.rs`
- Modify: `src-tauri/src/commands.rs`
- Test: `src-tauri/src/acp/client.rs` and/or `src-tauri/src/commands.rs`

Objective:
Make `acp_status` report real transport health and clear state when the child dies.

Steps:
1. Introduce explicit ACP runtime status in Rust shared state.
2. Update startup/reconnect paths to set status transitions (`connecting`, `connected`, `disconnected`, `error`).
3. On child exit / stdin loss, clear live-client state and mark disconnected.
4. Make `acp_status` consult the explicit health state, not just `Option<AcpClient>`.
5. Add regression test(s) covering disconnected-after-child-exit semantics.

Verification:
- `cargo test --manifest-path src-tauri/Cargo.toml`
- Manual: `cargo tauri dev`, kill ACP child, confirm frontend no longer claims connected.

## Task 2: Preserve session identity end-to-end on ACP events
Files:
- Modify: `src-tauri/src/acp/events.rs`
- Modify: `src-tauri/src/acp/protocol.rs`
- Modify: `v2/src/types/acp.ts`
- Modify: `v2/src/stores/chat.ts`
- Modify: `v2/src/hooks/useAcpEvents.ts`
- Test: Rust ACP parser tests + TS chat/event tests

Objective:
Ensure delayed/foreign ACP events can be filtered instead of contaminating the active session.

Steps:
1. Add `session_id` to parsed ACP event shapes where available.
2. Preserve that field when emitting Tauri events.
3. Update frontend ACP types.
4. Filter or ignore events that do not match the active chat session when session identity is present.
5. Add regression tests for mismatched-session events.

Verification:
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm --prefix v2 test`

## Task 3: Lock lane2 persistence and align Rust/TS schema
Files:
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/lane2.rs`
- Modify: `v2/src/lane2/schema.ts` only if needed for alignment
- Test: `src-tauri/src/lane2.rs`, `v2/src/lane2/__tests__/schema.test.ts`, new parity test if added

Objective:
Prevent lost workspace updates and stop silent field drops between frontend and backend.

Steps:
1. Add a lock/mutex around lane2 store read-modify-write operations.
2. Update Rust lane2 structs to include currently used frontend fields (`rightRail`, invocation summary/action label, any other live fields found during implementation).
3. Add round-trip tests in Rust for persisted workspace state.
4. Add a small contract/parity test surface so schema drift becomes visible.

Verification:
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm --prefix v2 test`

## Task 4: Clear global stream buffer/timer on chat reset
Files:
- Modify: `v2/src/stores/chat.ts`
- Test: `v2/src/stores/__tests__/chat.test.ts`

Objective:
Stop buffered stream chunks from leaking across workspace/session resets.

Steps:
1. Reset `_textBuffer`, `_textRole`, and cancel `_flushTimer` in `reset()`.
2. Add test covering reset during buffered stream state.

Verification:
- `npm --prefix v2 test`

## Task 5: Collapse session-start logic into one frontend path
Files:
- Modify: `v2/src/stores/projects.ts`
- Modify: `v2/src/components/StatusBar.tsx`
- Modify: `v2/src/components/SessionSidebar.tsx`
- Modify: `v2/src/components/ConnectionInterstitial.tsx`
- Modify: `v2/src/hooks/useKeyboardShortcuts.ts`
- Possibly create: `v2/src/app/session-start.ts`
- Test: targeted TS tests

Objective:
Make all “new session/new chat/scratchpad” paths use one implementation with consistent cwd + connection semantics.

Steps:
1. Extract a shared session-start helper.
2. Route StatusBar, SessionSidebar, interstitial recovery, keyboard shortcut, and project switching through it.
3. Ensure scratchpad uses home dir consistently.
4. Add tests for keyboard and fresh-session flows.

Verification:
- `npm --prefix v2 test`

## Task 6: Make workspace activation explicit and rollback-safe
Files:
- Modify: `v2/src/lane2/workspace-activation.ts`
- Modify: `v2/src/components/StatusBar.tsx`
- Modify: `v2/src/components/WorkspaceSwitcher.tsx`
- Modify: `v2/src/stores/workspaces.ts`
- Possibly modify: `v2/src/components/ConnectionInterstitial.tsx`, `v2/src/app/connection-interstitial.ts`
- Test: `v2/src/lane2/__tests__/workspace-activation.test.ts`, new integration-ish tests

Objective:
Prevent half-switched workspaces and provide explicit failed-switch handling.

Steps:
1. Change activation plan to stage target info before mutating live workspace/project state.
2. Apply live workspace activation only after session load/new-session succeeds, or add explicit rollback if any step fails.
3. Surface failed activation state in the interstitial/recovery UI instead of hanging indefinitely.
4. Ensure “create workspace with makeActive” results in a real live activation, not just store mutation.
5. Add tests for load-session failure/new-session failure paths.

Verification:
- `npm --prefix v2 test`
- `npm --prefix e2e-tests test`

## Task 7: Simplify right-rail authority
Files:
- Modify: `v2/src/app/right-pane-state.ts`
- Modify: `v2/src/stores/panes.ts`
- Modify: `v2/src/stores/artifacts.ts`
- Modify: `v2/src/App.tsx`
- Modify: `v2/src/components/StatusBar.tsx`
- Modify: `v2/src/components/RightPaneStack.tsx`
- Test: pane/artifact/right-pane tests

Objective:
Reduce split ownership of right rail state.

Steps:
1. Decide one source of truth for visible pane layout.
2. Minimize App-level reconciliation writes back into the pane store.
3. Keep legacy artifact state as data, not layout authority.
4. Update tests accordingly.

Verification:
- `npm --prefix v2 test`

## Task 8: Isolate E2E from live user state and expand coverage
Files:
- Modify: `e2e-tests/test/smoke.test.js`
- Modify: `e2e-tests/scripts/doctor.mjs` if needed
- Modify: `.github/workflows/tauri-e2e.yml`
- Modify: `docs/tauri-debugging-and-e2e.md`
- Possibly create helper fixtures/scripts for temp HOME/XDG state

Objective:
Make desktop E2E deterministic and cover the risky startup/workspace-switch flows.

Steps:
1. Run Tauri app under isolated HOME/XDG/runtime dirs for E2E.
2. Add readiness wait around tauri-driver startup if still missing.
3. Add assertions for workspace-switch recovery flow.
4. Add failure-path tests for reconnect/start-fresh/open-scratchpad when startup hangs.
5. Capture better diagnostics on failure in CI.

Verification:
- `npm --prefix e2e-tests run doctor`
- `npm --prefix e2e-tests test`

## Final verification
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm --prefix v2 test`
- `npm --prefix v2 run build`
- `npm --prefix e2e-tests test`
- `git status -sb`
- `git pull --rebase origin feat/v2-phase1`
- `bd sync` then `bd dolt pull` / `bd dolt push` if available
- `git push origin feat/v2-phase1`

## Delivery bar
This epic is only done when:
- backend truthfully reports ACP health
- workspace switch no longer wedges in the observed failure mode
- session identity survives ACP transport to frontend filtering
- lane2 persistence is serialized and schema-aligned
- desktop E2E runs in isolated state and covers switch/recovery paths
- all relevant tests pass and the branch is pushed
