# Lane 2 Co-Edit Proof Spike — Implementation Plan

> For Hermes: use subagent-driven-development if delegating. Keep this spike narrow. Proof only, not framework.

Goal: implement the minimal bundled MCP App proof spike for `hermelinChat-1rc` so one editable sidewindow app can round-trip user edits to Sophie and receive a patch back into the same live iframe without reload.

Architecture: add one thin co-edit backend in Tauri with SQLite persistence and revision tracking, one small frontend/store bridge for active surface instances, and one bundled editable MCP App that speaks a tiny explicit message protocol. Reuse the existing AppHost, A2UI action envelope path, and MCP App iframe transport instead of inventing a second system.

Tech stack: Tauri/Rust, rusqlite, React, Zustand, MCP Apps `AppBridge` / `PostMessageTransport`, bundled HTML demo app.

Research source: `.planning/lane2-coedit-roundtrip-spike.md`
Bead: `hermelinChat-1rc`

---

## Locked scope

Must ship:
- one bundled editable MCP App demo
- explicit `Ask Sophie` action from inside the app
- host captures structured user delta with revision metadata
- host persists current state + append-only event log in SQLite
- host can apply a patch back into the same surface instance via post-init notification
- no iframe reload during patch application

Must not ship:
- no CRDT/OT
- no general-purpose framework
- no production rollout into real MCP Apps
- no ambient keystroke watcher
- no Lane 1 work

---

## Target files

Backend / Tauri:
- Create: `src-tauri/src/coedit.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/commands.rs` only if command placement makes more sense there
- Add tests in: `src-tauri/src/coedit.rs` (`#[cfg(test)]` block)

Frontend:
- Create: `v2/src/stores/coedit.ts`
- Modify: `v2/src/a2ui/mcp-app/AppHost.tsx`
- Modify: `v2/src/a2ui/mcp-app/tauri-proxy.ts`
- Create: `v2/src/stores/__tests__/coedit.test.ts`
- Modify: `v2/package.json`

Bundled demo app:
- Create: `v2/src/a2ui/mcp-app/bundled/coedit-proof.html`
- Modify: `v2/src/a2ui/mcp-app/resolver.ts`

Optional demo/example surface:
- Create: `v2/src/a2ui/examples/mcp-app-coedit-proof.json`

---

## Data model

### SQLite tables

`coedit_surface_instances`
- `surface_instance_id TEXT PRIMARY KEY`
- `session_id TEXT NOT NULL`
- `surface_id TEXT NOT NULL`
- `server TEXT NOT NULL`
- `resource_uri TEXT NOT NULL`
- `state_json TEXT NOT NULL`
- `revision INTEGER NOT NULL`
- `created_at REAL NOT NULL`
- `updated_at REAL NOT NULL`

`coedit_surface_events`
- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `surface_instance_id TEXT NOT NULL`
- `actor TEXT NOT NULL`
- `event_type TEXT NOT NULL`
- `base_revision INTEGER`
- `payload_json TEXT NOT NULL`
- `created_at REAL NOT NULL`

### Runtime message shapes

User delta from app to host/chat:
```json
{
  "type": "submit_patch",
  "surfaceInstanceId": "coedit-123",
  "localRevision": 3,
  "patch": [
    { "op": "replace", "path": "/text", "value": "new draft" }
  ],
  "selection": { "start": 0, "end": 9 }
}
```

Host patch from Sophie back into app:
```json
{
  "surfaceInstanceId": "coedit-123",
  "baseRevision": 3,
  "patch": [
    { "op": "replace", "path": "/text", "value": "Sophie rewrite" }
  ],
  "authoredBy": "sophie"
}
```

Use RFC6902-style patch arrays for the spike. Only `replace` is required in v0.

---

## Task 1: Add failing backend tests for co-edit state persistence

Objective: prove the backend can create/load/update one co-edit surface instance and append events before writing implementation code.

Files:
- Create: `src-tauri/src/coedit.rs`
- Test in same file under `#[cfg(test)]`

Step 1: write failing tests for:
- initialize schema in temp db
- upsert instance state with revision
- append event rows
- reject stale patch application when `base_revision < current revision`
- accept patch when base matches current revision and update state/revision

Step 2: run only the new backend test target

Run:
`cargo test coedit::tests`

Expected: FAIL because `coedit.rs` and functions do not exist yet.

Step 3: implement minimal backend

Implement in `coedit.rs`:
- db path helper under Aurora's app data dir
- `init_schema(conn)`
- `upsert_surface_instance(...)`
- `append_surface_event(...)`
- `get_surface_instance(...)`
- `apply_patch_if_fresh(...)`

Keep patching deliberately tiny:
- only support JSON object roots
- only support `replace` ops
- return a conflict error when base revision mismatches

Step 4: expose thin Tauri commands in `coedit.rs` or `commands.rs`
- `coedit_upsert_surface_instance`
- `coedit_get_surface_instance`
- `coedit_submit_patch`
- `coedit_apply_host_patch`

Step 5: register module + commands in `src-tauri/src/lib.rs`

Step 6: rerun backend tests

Run:
`cargo test coedit::tests`

Expected: PASS.

Step 7: commit

`git add src-tauri/src/coedit.rs src-tauri/src/lib.rs`
`git commit -m "Add co-edit proof backend state store"`

---

## Task 2: Add failing frontend tests for co-edit state/revision helpers

Objective: prove revision/conflict logic on the frontend before wiring AppHost.

Files:
- Create: `v2/src/stores/coedit.ts`
- Create: `v2/src/stores/__tests__/coedit.test.ts`
- Modify: `v2/package.json`

Step 1: write failing TS tests for:
- registering a surface instance
- applying local patch increments revision
- rejecting host patch when base revision is stale
- applying fresh host patch updates state in place
- storing last selection / pending outbound patch summary

Use the existing `tsx` test style in `v2/src/stores/__tests__/artifacts.test.ts`.

Step 2: run the new test script only

Run:
`tsx src/stores/__tests__/coedit.test.ts`

Expected: FAIL because store/helpers do not exist yet.

Step 3: implement minimal `coedit.ts`

Store should expose:
- `instances: Record<string, CoeditSurfaceInstance>`
- `registerInstance(instance)`
- `recordLocalPatch(surfaceInstanceId, patch, selection?)`
- `applyHostPatch(surfaceInstanceId, baseRevision, patch, authoredBy)`
- `setPresence(surfaceInstanceId, actor, status)`

No networking in this store. Pure state transitions only.

Step 4: add `coedit:test` to `v2/package.json`

Step 5: rerun the new test

Run:
`npm run coedit:test`

Expected: PASS.

Step 6: commit

`git add v2/src/stores/coedit.ts v2/src/stores/__tests__/coedit.test.ts v2/package.json`
`git commit -m "Add co-edit proof frontend state helpers"`

---

## Task 3: Add bundled editable proof app with a failing integration expectation first

Objective: ship one tiny bundled MCP App that can edit local state and send an explicit `Ask Sophie` message upward.

Files:
- Create: `v2/src/a2ui/mcp-app/bundled/coedit-proof.html`
- Modify: `v2/src/a2ui/mcp-app/resolver.ts`
- Optional create: `v2/src/a2ui/examples/mcp-app-coedit-proof.json`

Step 1: add a failing resolver test that `ui://aurora-bundled/coedit-proof.html` resolves successfully

Modify/create test in:
- `v2/src/a2ui/mcp-app/__tests__/resolver.test.ts`

Run:
`tsx src/a2ui/mcp-app/__tests__/resolver.test.ts`

Expected: FAIL until bundled resolver knows about the file.

Step 2: add `coedit-proof.html`

The app must:
- initialize via `window.parent.postMessage`
- render a textarea
- keep local draft instantly
- show revision/status text
- send `ui/message` on explicit button click with the `submit_patch` payload
- receive host notifications for patch application and apply them without reload

For the spike the app can directly interpret one custom notification method:
- `ui/notifications/host-patch`

Step 3: update resolver allowlist/cache

Add `coedit-proof.html` to bundled filenames and import/read logic.

Step 4: rerun resolver tests

Expected: PASS.

Step 5: commit

`git add v2/src/a2ui/mcp-app/bundled/coedit-proof.html v2/src/a2ui/mcp-app/resolver.ts v2/src/a2ui/mcp-app/__tests__/resolver.test.ts`
`git commit -m "Add bundled co-edit proof MCP App"`

---

## Task 4: Wire AppHost to active co-edit surface instances and host-patch notifications

Objective: let the host remember a live surface instance and push patches into the same iframe after initialization.

Files:
- Modify: `v2/src/a2ui/mcp-app/AppHost.tsx`
- Modify: `v2/src/a2ui/mcp-app/tauri-proxy.ts`
- Modify: `v2/src/stores/coedit.ts`

Step 1: write failing frontend tests for the host-side patch path where practical

If AppHost is too awkward to unit test directly, test the extracted helpers instead:
- notification payload builder
- surface instance registration payload
- host patch application routing guard

Step 2: add a stable `surfaceInstanceId`

For the spike, derive it deterministically from:
- `sessionId`
- `surfaceId`
- `componentId`

Step 3: on iframe init, register/upsert instance state in backend and frontend store

Step 4: on `bridge.onmessage`, when payload is the co-edit proof message:
- append/persist event via Tauri command
- update frontend coedit store
- emit existing A2UI action envelope with full context for Sophie

Step 5: add host→app push path

After bridge connect, store the bridge reference by `surfaceInstanceId` so the host can later emit:
- `ui/notifications/host-patch`

If ext-apps bridge does not expose a pretty helper, use its generic notification sending path. Do not invent a second transport.

Step 6: when a host patch is applied from frontend or parsed chat action, send it into the iframe and update backend/frontend revision state.

Step 7: run typecheck + targeted tests

Run:
`npm run coedit:test`
`npx tsc --noEmit`

Step 8: commit

`git add v2/src/a2ui/mcp-app/AppHost.tsx v2/src/a2ui/mcp-app/tauri-proxy.ts v2/src/stores/coedit.ts`
`git commit -m "Wire host round-trip for co-edit proof app"`

---

## Task 5: Add a manual patch-in path so Sophie can answer the app today

Objective: close the loop without building a giant parser framework.

Files:
- Modify: `v2/src/components/chat/SurfaceAnchor.tsx` only if shared envelope helper extraction is useful
- Create or modify a thin frontend helper near AppHost/coedit store

Step 1: define one temporary Sophie reply contract for the spike

Example envelope inside assistant text:
```json
[[COEDIT_PATCH]] {"surfaceInstanceId":"...","baseRevision":3,"patch":[{"op":"replace","path":"/text","value":"..."}]}
```

Step 2: add a tiny parser/helper that scans assistant messages for this exact marker and applies the patch through:
- backend `coedit_apply_host_patch`
- frontend `applyHostPatch`
- AppHost bridge notification

Do not generalize this beyond the spike.

Step 3: add a failing test for marker parsing + fresh/stale patch handling, then make it pass.

Step 4: commit

`git add [relevant files]`
`git commit -m "Add proof-only Sophie patch loop for co-edit demo"`

---

## Task 6: Verification and proof artifact

Objective: prove the loop works end to end and leave a crisp handoff.

Files:
- Optionally create: `.planning/lane2-coedit-proof-verification.md`

Step 1: create a minimal example surface JSON if helpful for dev preview/manual launch

Step 2: run all relevant verification

Backend:
`cargo test`

Frontend:
`npm run a2ui:test`
`npm run coedit:test`
`npm test`
`npx tsc --noEmit`

Step 3: manual proof checklist
- open the co-edit proof surface
- type locally, verify zero-latency local edit
- click `Ask Sophie`, verify outbound action contains `surfaceInstanceId` + revision + patch
- simulate or trigger a Sophie patch reply
- verify patch applies inside the live iframe without reload
- verify stale-base patch is rejected visibly/logically

Step 4: close bead, push, emit Chorus signal, store memory

---

## Notes for whoever implements this

- Reuse the existing A2UI action envelope path. It already works.
- Reuse AppBridge/PostMessageTransport. Do not bolt on a second iframe API.
- Keep the backend patch engine intentionally dumb. `replace` is enough.
- If ext-apps generic notifications are awkward, wrap them once in AppHost and move on.
- The goal is to prove one clean loop, not to build the final product.
