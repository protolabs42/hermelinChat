# Chorus hermes plugin — VERIFICATION

Date: 2026-04-14
Parent bead: `hermelinChat-ahi`
Phases: `6uy` (design) → `wef` (skeleton) → `nb3` (auth) → `7pe` (memory) →
`ksr` (context) → `mzg` (lifecycle) → `9td` (installer) → `1wi` (this).
Design doc: [chorus-hermes-plugin.md](./chorus-hermes-plugin.md)

## Headline

**All seven phases merged and proven end-to-end. 98 unit tests + 9 live
integration tests (107 total) green. Plugin is installed into the live
hermes-agent at `~/.hermes/hermes-agent/plugins/memory/chorus/` and
listed by `hermes memory status`.**

## Per-phase evidence

### P0 — Design doc
- File: `.planning/chorus-hermes-plugin.md` (295 lines).
- Covers: architecture, file layout, hook→RPC map, config schema, setup
  flow, threading model, error policy, per-phase verification gates,
  known v1 limitations.

### P1 — Skeleton + config (20 tests)
- `ChorusMemoryProvider` subclasses the real hermes ABC and registers
  via `register(ctx)` — exactly matching the Honcho pattern.
- `ChorusClientConfig.from_global_config()` resolves file → env → defaults.
- Malformed config falls back to env vars without crashing.
- Real hermes loader (`plugins.memory.discover_memory_providers`) sees
  the plugin, reads `plugin.yaml`, reports `is_available=False` when
  unconfigured and `True` once `chorus.json` exists.

### P2 — Auth + whoami (21 tests + 2 live)
- `ChorusClient._rpc` builds a correct JSON-RPC envelope with
  `Authorization: Bearer <api_key>` and `Content-Type: application/json`.
- Typed exceptions: `ChorusAuthError` (401), `ChorusPermissionError` (403),
  `ChorusRpcError` (server-side `error` envelope), `ChorusServerError`
  (5xx after retry), `ChorusUnreachableError` (conn refused/timeout).
- One automatic retry on 5xx with configurable backoff.
- `initialize()` cron guard for `agent_context in (cron, flush)` and
  `platform == cron`.
- `initialize()` soft-fails on auth/unreachable/unexpected — agent keeps
  running, plugin marks itself inactive.
- Ring resolution from cwd, `default_ring` fallback.
- **Live evidence against `localhost:3099`:**
  - Bad key → `ChorusAuthError` ✅
  - Unreachable host → `ChorusUnreachableError` ✅

### P3 — Memory tools (18 tests + 1 live)
- Three tools: `chorus_memory_store`, `chorus_memory_query`,
  `chorus_memory_recall` in OpenAI function-calling schema format.
- `recall_mode` gate: `context` → zero tools, `tools`/`hybrid` → all three.
- Dispatch validates required params, surfaces `ChorusError` via
  `tool_error()`, short-circuits when inactive.
- Namespace resolution: `ring:<tag>` when a project ring is known,
  `agent:<identity.id>` otherwise.
- **Live evidence:** full store→query round-trip with a unique test tag
  retrieved the written memory from the hive.

### P4 — Context injection (14 tests)
- First-call `system_prompt_block` fetches ring memories via
  `memory/query`, formats markdown, caches under lock. Subsequent calls
  return the cached block verbatim — prompt cache stays warm.
- `tools` recall mode returns empty block.
- Fetch errors cache an empty string so we don't hammer the server.
- `prefetch` returns the background thread's result, applies
  `context_tokens` char budget, drains the slot.
- `queue_prefetch` spawns a daemon thread; no-ops on inactive / tools
  mode / empty query. Shutdown joins pending threads with timeout.

### P5 — Lifecycle hooks (18 tests)
- `sync_turn` respects the `emit_signals` + `sync_turn_emit` matrix:
  `never`/`session-end` don't emit mid-session; `every-turn` fires a
  `pulse` signal per turn when signals are enabled.
- Permission error on signal emission flips `emit_signals=False` for the
  rest of the session (role not filled → graceful degradation).
- `on_session_end` joins pending threads, stores a session-briefing
  episodic memory, emits a single `sense` signal (when enabled), no-ops
  when nothing happened or plugin is inactive.
- `on_pre_compress` returns a model-free summary string AND stores the
  same summary as an episodic memory so it survives compression.
- `on_memory_write` mirrors only `add` actions, tags them `hermes-mirror`,
  ignores remove/replace/empty.

### P6 — Installer + update flow (7 tests + live smoke)
- `scripts/install_hermes_chorus_plugin.py` auto-discovers the hermes
  Python, locates `plugins.memory`, copies our `chorus/` tree in.
- Idempotent: second run reports `OK: already up to date`.
- `--uninstall` removes the directory cleanly.
- `--dry-run` prints what would change without writing.
- `--target <dir>` supports tests without touching the live install.
- Post-install verification runs `plugins.memory.chorus` import +
  `load_memory_provider('chorus')` under the live hermes Python.
- Wired into `scripts/update.sh` with a `--skip-hermes-chorus` opt-out
  so `hermes update` auto-reapplies the plugin after upstream wipes it.

**Live smoke:**
```
$ python3 scripts/install_hermes_chorus_plugin.py
Hermes Chorus plugin install target
  hermes exe:    /home/inu/.hermes/hermes-agent/venv/bin/hermes
  hermes python: /home/inu/.hermes/hermes-agent/venv/bin/python3
  plugins.memory: /home/inu/.hermes/hermes-agent/plugins/memory
UPDATED: installed into /home/inu/.hermes/hermes-agent/plugins/memory/chorus
VERIFIED: plugins.memory.chorus imports and loads cleanly.
```

```
$ hermes memory status
Memory status
────────────────────────────────────────
  Built-in:  always active
  Provider:  (none — built-in only)
  Installed plugins:
    • byterover  (requires API key)
    • chorus  (API key / local)    ← our plugin
    • hindsight  (API key / local)
    ...
```

### P7 — Live integration (this phase, 4 live tests)
- `test_provider_initialize_against_live_tunnel`: full `initialize` against
  the real tunnel, identity captured from `whoami`, no `_inactive_reason`.
- `test_system_prompt_block_fetches_live_ring_memory`: block contains
  real ring memory, is cached on second call.
- `test_live_store_then_query_tool_roundtrip`: provider.handle_tool_call
  writes a memory, then provider.handle_tool_call reads it back.
- `test_live_queue_prefetch_populates_slot`: background thread populates
  the prefetch slot with real ring memories.

## Test totals

| Mode                                           | Count | Notes                                     |
|------------------------------------------------|------:|-------------------------------------------|
| Unit (default, no tunnel)                      |    98 | 9 live tests skip cleanly                 |
| Unit + live (`CHORUS_INTEGRATION_TESTS=1` + key) |  107 | Every test passes                         |
| Live-only                                      |     9 | auth (2) + client round-trip (3) + provider (4) |

Run commands:
```
# Unit only — no tunnel / key needed
/home/inu/.hermes/hermes-agent/venv/bin/python3 -m pytest \
    scripts/hermes_chorus_plugin/tests -v

# Full suite with live tunnel
CHORUS_INTEGRATION_TESTS=1 CHORUS_INTEGRATION_API_KEY=<key> \
    /home/inu/.hermes/hermes-agent/venv/bin/python3 -m pytest \
    scripts/hermes_chorus_plugin/tests -v
```

## Server-visible artifacts

The live integration tests created a handful of memories on the hive
tagged `hermes-plugin-verification` / `verify-<uuid>` under the
`agent:identity:eyeifguiuc0vbx7ihs4f` namespace. These are safe to leave
or delete — they do not affect any production ring scope. A follow-up
cleanup task (via `memory/forget` once exposed by the plugin) is
tracked informally in `hermelinChat-ahi` notes.

## Known limitations carried into v1

- `identity_name` field is informational only; the server trusts the
  api_key. The field shows up in `chorus.json` for human readability.
- Signal emission defaults to off. Enabling it requires both
  `emit_signals: true` in `chorus.json` AND the `hermes-plugin` role
  filled for the identity on the server — a parallel ops task.
- Same-identity cross-session inbox delivery bug (tracked as chorus-protocol
  extension of #21) means `inbox/check` is not wired into `system_prompt_block`
  yet. The plugin uses `memory/query` for resumption context instead,
  which is unaffected.
- Ring resolution is cwd-basename → server-resolved ring tag. No mid-session
  ring switching in v1.

## Ops parallel track

When ops adds the `hermes-plugin` role to `bootstrap.yml` and grants it
to plugin-owned identities, signal emission can be flipped on without
code changes:
```json
{"emit_signals": true, "role_name": "hermes-plugin"}
```

Plugin gracefully degrades if the role is missing — permission errors
flip `emit_signals` off for the session, memory operations continue.
