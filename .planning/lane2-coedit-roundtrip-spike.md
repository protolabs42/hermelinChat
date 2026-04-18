# Lane 2 Co-Edit Round-Trip Spike

Status: accepted research result
Bead: hermelinChat-gvy
Date: 2026-04-18
Author: aurora

## Goal

Answer the five open Lane 2 co-edit questions without shipping co-edit into production surfaces.

The target is a minimal proof loop:

1. Sophie emits a Lane 2 MCP App surface
2. user edits inside the sidewindow app
3. the host sees the edit
4. Sophie can react and re-emit state back into that same app

This is research, not product code.

## Current substrate inventory

What already exists in aurora-chat right now:

### 1. Hosted MCP App iframe exists and is real

`v2/src/a2ui/mcp-app/AppHost.tsx` already does the heavy lifting:
- resolves `ui://...` resources into HTML
- injects CSP
- mounts a sandboxed iframe with `sandbox="allow-scripts"`
- connects `AppBridge + PostMessageTransport`
- proxies `tools/call`, `resources/read`, and `resources/list` through Tauri
- pushes one-shot `toolInput`
- pushes one-shot `toolResult`
- forwards app-originated `ui/message` requests into Aurora's A2UI action channel as `mcpAppMessage`

That means the hard part is not "can an iframe talk to the host". It already can.

### 2. A2UI already has mutable local state

`v2/src/a2ui/renderer/A2UISurface.tsx` keeps a mutable `dataModel` in local React state and re-seeds from remote revisions.

That matters because Lane 2 co-edit does not need a brand-new philosophy for local mutation. We already believe in:
- observable mutable UI state
- remote revision bumps
- agent round-trips via action envelopes

### 3. Current Lane 2 is bidirectional, but asymmetrically

Today the arrows are:
- App → MCP server via `tools/call`
- Host → App via one-shot `toolInput` / `toolResult`
- App → chat/agent via `ui/message` → `mcpAppMessage`

What is missing is not transport. What is missing is an explicit collaboration protocol for repeated host↔app state sync after initialization.

### 4. We already proved full MCP Apps protocol, not co-edit semantics

`docs/phase5-test-servers.md` shows Tier 2 already validated a bidirectional tool-call loop: type in app, click generate, server returns result, iframe updates without reload.

That proves MCP Apps as a substrate. It does not answer:
- who owns shared truth
- how edits are serialized
- when Sophie wakes up
- how conflicts resolve
- what persists after the session

That is the actual gvy problem.

## The rude architectural take

Trying to do true co-edit by letting Sophie continuously watch every keystroke would be stupid.

It burns tokens, creates latency theater, and turns the app into a bad multiplayer text editor with an LLM stapled to it. The winning move is a hybrid:
- local edits stay instant and cheap
- the host captures structured deltas
- Sophie only wakes on explicit boundaries or bounded heuristics
- the app can still receive remote patches back into the same surface

If we skip that boundary and go full ambient, we get a flashy demo and an unusable product.

## Answers to the five questions

### 1. Sync semantics

Verdict: hybrid, not ambient-only and not invoke-only.

Recommended split:
- Local user edits apply immediately inside the app
- The host records deltas as structured events
- Sophie is invoked only on one of three triggers:
  1. explicit "Ask Sophie" / "Apply AI change"
  2. semantic boundary like blur, submit, drag-end, or pause debounce
  3. important app-defined events (`selectionChanged`, `constraintBroken`, `regenerateRequested`)

Why:
- pure ambient watching is too expensive and noisy
- pure invoke-only misses the feeling of inhabiting the same workspace
- hybrid preserves live UX while keeping model wakeups intentional

Concrete implication for the spike:
- use a minimal editable text field or simple point-editor app
- emit `ui/message` or custom host notifications on `blur` / `submit`, not every keypress
- prove that the host can send a patch back after Sophie responds

### 2. Conflict resolution

Verdict: optimistic local-first with soft presence, no CRDT in v0.

Recommended rule set:
- single human editor is authoritative while actively typing/dragging
- Sophie can propose or apply remote patches only when the edited region is idle or explicitly submitted
- if a remote patch lands against stale local base version, reject it and ask for rebase/regenerate
- show soft presence, not hard locks: `Inu editing…`, `Sophie drafting…`

Why:
- full CRDT/OT is overkill for a proof spike
- last-write-wins alone is too dumb and will feel insulting when it overwrites the user's live input
- hard locks kill the collaborative feel

Minimal version model:
- `surface_instance_id`
- `base_revision`
- `local_revision`
- each user delta increments local revision
- Sophie patches must declare the base revision they read
- host applies patch only if base matches current or affected fields are idle

This is enough to prove the loop without pretending we built Figma.

### 3. Persistence shape

Verdict: SQLite row per surface instance plus append-only patch/event log.

Not file. Not in-memory only.

Recommended shape:
- `coedit_surface_instances`
  - `surface_instance_id`
  - `session_id`
  - `surface_id`
  - `server`
  - `resource_uri`
  - `state_json`
  - `revision`
  - `created_at`
  - `updated_at`
- `coedit_surface_events`
  - `id`
  - `surface_instance_id`
  - `actor` (`user` | `agent` | `host`)
  - `event_type` (`patch`, `presence`, `submit`, `selection`, `agent_patch`, `agent_comment`)
  - `base_revision`
  - `payload_json`
  - `created_at`

Why SQLite:
- Lane 3 already assumes SQLite for durable anchors
- it survives restart and session reload
- it gives an audit trail for debugging weird co-edit behavior
- it is cheap enough for a spike

Why not file blobs:
- wrong shape for ordered collaborative events
- painful conflict/debug story
- we already know the legacy file-watch artifact path is debt

Why not in-memory only:
- restart wipes the experiment
- impossible to inspect failures after the fact
- defeats the whole cross-session question

For the spike, persistence can be thin:
- one table for latest state
- one append-only events table
- no garbage collection yet

### 4. Chat ↔ surface relationship

Verdict: one global session chat, but every co-edit surface gets a scoped thread identity and optional selection context.

Recommended model:
- Chat remains global at the session level
- each sidewindow app gets a `surface_instance_id`
- app-originated events to Sophie always include:
  - `surface_instance_id`
  - `surface_id`
  - current revision
  - focused field/selection if present
  - minimal changed payload
- the user can also explicitly target Sophie from the surface: `Ask Sophie about selection`

So the relationship is:
- not a totally separate chat per surface
- not context-free global chat either
- global thread with scoped attachments

Why:
- per-surface chats fragment the session and make the UI feel like Slack threads inside threads
- pure global chat without surface scoping makes Sophie blind to what object the user means

Minimal spike UX:
- a button in the app: `Ask Sophie`
- host wraps the app state delta into a structured `mcpAppMessage`
- Sophie replies in normal chat and can also emit a patch targeted at the same `surface_instance_id`

### 5. Cost bounding

Verdict: explicit wake gestures plus bounded passive triggers.

Hard rules:
- never wake Sophie on raw keypress
- debounce passive triggers aggressively (e.g. 800ms–1500ms idle for text, drag-end for pointer edits)
- batch adjacent deltas into one event
- prefer semantic payloads over full state dumps
- let the user opt into AI attention with a clear button/action

Recommended budget model:
- Tier A: free local edits, no model call
- Tier B: cheap host logging + persistence only
- Tier C: explicit/heuristic wake → one model turn with compressed delta summary

A good default policy:
- text input: wake only on submit or explicit ask
- slider/drag/chart points: wake on drag-end if the component asked for agent evaluation
- repeated edits within a short window collapse into one patch packet

The product should make the model feel present without pretending infinite attention is free.

## Recommended minimal proof design

Use a tiny bundled MCP App, not a real external app first.

### Surface

A sidewindow MCP App with:
- one text field
- one `Ask Sophie` button
- one `Apply Sophie patch` status area
- optional `selectionStart/selectionEnd` capture

### Event protocol for the spike

Host/app contract can be tiny and explicit:

App → Host:
- `ui/message` with payload `{ type: 'submit_patch', patch, selection, localRevision }`
- optionally `ui/message` with `{ type: 'presence', editing: true/false }`

Host → Sophie:
- current existing path: `mcpAppMessage` A2UI action envelope into chat
- include `surface_instance_id`, `base_revision`, `patch`, `selection`, summarized current state

Sophie → Host:
- for the spike, Sophie responds with a structured patch envelope in chat, same style as A2UI action markers
- host parses it and routes it to the target `surface_instance_id`

Host → App:
- push a custom notification such as `ui/notifications/host-patch`
  with `{ patch, newRevision, authoredBy: 'sophie' }`

App:
- applies patch locally
- acknowledges current revision

The important part is the round-trip, not the exact notification name.

## What needs to exist before implementation

1. A host-side per-surface instance registry
   - current `AppHost` is stateless after mount except bridge refs
   - co-edit needs the host to remember active surface instances and revisions

2. Repeated host → app notification channel
   - current code uses one-shot `sendToolInput` and `sendToolResult`
   - spike needs a general post-init push path for patches/presence

3. Structured patch format
   - JSON Patch is fine
   - domain-specific patch ops are also fine
   - do not ship full HTML or full-surface re-emits as the normal mutation path

4. Persistence in SQLite
   - enough to restore latest state and inspect event history

5. Surface-scoped routing back from chat
   - Sophie patch replies must target one surface instance, not "whatever app is open"

## Recommendation

Proceed with a proof spike, but keep the scope brutally narrow:
- one bundled app
- one editable field
- one explicit `Ask Sophie` action
- one returned host patch
- SQLite-backed revision tracking

If that loop feels clean, Lane 2 co-edit is viable.
If that loop feels brittle, expensive, or semantically muddy, stop there and do not pretend more framework will save it.

## Non-recommendations

Do not do these next:
- no general co-edit framework
- no CRDT layer
- no multi-user simultaneous editing
- no always-on Sophie watcher
- no production rollout into real MCP Apps
- no Lane 1 crossover

## Acceptance bar for the spike

The spike is successful only if all of these are true:

1. user can edit locally with zero model latency
2. the host captures a structured delta with revision metadata
3. Sophie can receive that delta and send a patch back
4. the app updates in place without iframe reload
5. stale-base conflicts are detectable
6. the number of model calls is bounded and explainable

If any one of those fails, the research answer is "not ready", which is a perfectly good result.
