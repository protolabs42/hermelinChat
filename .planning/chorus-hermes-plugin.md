# Chorus Hermes Memory Provider — Design Doc

Status: accepted, pre-scaffold
Bead: hermelinChat-ahi (parent); phases 6uy/wef/nb3/7pe/ksr/mzg/9td/1wi
Date: 2026-04-14

## Goal

Let any hermes-agent install join our Chorus hive as a first-class citizen. Hermes sessions
should inject recent ring memory at startup, recall relevant prior knowledge before each
turn, persist new knowledge through the session, and (opt-in) emit signals to the ring.

## Non-goals (v1)

- Upstream PR to NousResearch/hermes-agent. Our hive is private and identity-bootstrapped;
  we ship internally first, harden, then consider upstream.
- Aurora Chat as the first consumer. Prove round-trip with headless hermes CLI before
  layering the ACP client integration.
- Signal emission by default. Opt-in and gated on the `hermes-plugin` role fill.
- Chorus features beyond memory + signals in v1: workstreams, handoffs, inbox triage,
  artifacts — these wait for v2.

## Architecture

```
   hermes agent loop
        │
   MemoryManager ── built-in provider (MEMORY.md / USER.md)
        │
        └── ChorusMemoryProvider  ──  ChorusClient  ──  HTTP/JSON
                                          │
                                   chorus-tunnel.service
                                      localhost:3099
                                          │
                                     devops-hub:3001
```

All Chorus RPC calls go through `POST /rpc` with `Authorization: Bearer <api_key>`.
Auth, onboarding, and probe details verified against chorus-protocol upstream
(see resumption briefing memory `6lt78kq1tfx2j44w0tn1`).

## File layout

### Source of truth — hermelinChat repo

```
hermelinChat/
├── scripts/
│   ├── hermes_chorus_plugin/          # authoritative source
│   │   ├── __init__.py                # ChorusMemoryProvider + register(ctx) + tool schemas
│   │   ├── plugin.yaml                # name/version/description/deps/hooks
│   │   ├── client.py                  # ChorusClientConfig dataclass + ChorusClient (HTTP)
│   │   ├── session.py                 # ChorusSessionManager (turn sync, prefetch orchestration)
│   │   ├── cli.py                     # hermes chorus {setup,status,whoami,test}
│   │   └── README.md
│   ├── install_hermes_chorus_plugin.py    # idempotent installer
│   └── uninstall_hermes_chorus_plugin.py
└── .planning/
    └── chorus-hermes-plugin.md        # this doc
```

### Live install target — where hermes loads it

```
~/.hermes/hermes-agent/plugins/memory/chorus/
├── __init__.py
├── plugin.yaml
├── client.py
├── session.py
├── cli.py
└── README.md
```

The installer copies source → live. Identical pattern to existing
`install_hermes_artifact_patch.py`. `hermes update` will clobber the live install;
the existing update wrapper (`scripts/update.sh`) already reapplies patches, we extend it.

## Hook → RPC method map

All provider hooks from `/home/inu/.hermes/hermes-agent/agent/memory_provider.py` we implement:

| ABC hook              | Kind       | Action                                                                                  |
|-----------------------|------------|-----------------------------------------------------------------------------------------|
| `name`                | required   | `"chorus"`                                                                              |
| `is_available`        | required   | file or env resolves to `{url, api_key}`. **No network.**                                |
| `initialize`          | required   | cron guard → `identity/whoami` → resolve ring from cwd → kick pre-warm thread           |
| `get_tool_schemas`    | required   | filtered by `recall_mode`; empty when `context` mode                                    |
| `handle_tool_call`    | optional   | dispatch table to `memory/store`, `memory/query`, `memory/recall`, `signal/emit`, `inbox/check` |
| `system_prompt_block` | optional   | first call: `memory/query(entity=<project>)` + `inbox/check`, bake + cache              |
| `prefetch`            | optional   | return cached result from background thread, truncate to `context_tokens`               |
| `queue_prefetch`      | optional   | spawn thread → `memory/query(query)`                                                    |
| `sync_turn`           | optional   | opt-in. If `sync_turn_emit != "never"`, queue pulse signal                              |
| `on_turn_start`       | optional   | track `_turn_count` for cadence checks                                                  |
| `on_session_end`      | optional   | join sync threads → emit final sense signal + store resumption-briefing memory           |
| `on_pre_compress`     | optional   | store compression-boundary insight as episodic memory                                    |
| `on_memory_write`     | optional   | mirror `action=add` writes as Chorus memory with tag `hermes-mirror`                    |
| `on_delegation`       | optional   | v2 — currently no-op                                                                    |
| `shutdown`            | optional   | join daemon threads with 5s timeout                                                      |
| `get_config_schema`   | optional   | fields for `hermes memory setup`                                                        |
| `save_config`         | optional   | write `$HERMES_HOME/chorus.json`                                                        |
| `post_setup`          | optional   | run invite redemption + whoami probe wizard                                             |

## Chorus RPC methods used

Verified against chorus-protocol source via ring `protolabs42-chorus-v0`.

| Purpose                | Transport                | Method                   |
|------------------------|--------------------------|--------------------------|
| Redeem invite          | `POST /invite`           | (REST, setup wizard)     |
| Verify auth            | `POST /rpc`              | `identity/whoami`        |
| Store memory           | `POST /rpc`              | `memory/store`           |
| Query memory           | `POST /rpc`              | `memory/query`           |
| Recall by entity       | `POST /rpc`              | `memory/recall`          |
| Update memory          | `POST /rpc`              | `memory/update`          |
| Emit signal            | `POST /rpc`              | `signal/emit`            |
| Check inbox            | `POST /rpc`              | `inbox/check`            |
| List rings             | `POST /rpc`              | `ring/list`              |

RPC envelope: `{"jsonrpc": "2.0", "method": "<m>", "params": {...}, "id": <int>}`.
Client reuses a single `requests.Session`. Timeout 10s. 1 retry on 5xx.

## Config schema

`$HERMES_HOME/chorus.json`:

```json
{
  "url": "http://localhost:3099",
  "identity_name": "hermes-<host>",
  "recall_mode": "hybrid",
  "scope_by_cwd": true,
  "default_ring": null,
  "emit_signals": false,
  "role_name": "dev",
  "sync_turn_emit": "session-end",
  "context_tokens": 1500,
  "memory_query_limit": 8,
  "inbox_limit": 5
}
```

Secrets (`.env`):
- `CHORUS_API_KEY` — Bearer token from `POST /invite` or ops-issued

Env overrides:
- `CHORUS_URL`, `CHORUS_API_KEY`, `CHORUS_IDENTITY_NAME`, `CHORUS_RECALL_MODE`

Resolution order (mirrors Honcho):
1. `$HERMES_HOME/chorus.json` (profile-local)
2. `~/.hermes/chorus.json` (default profile)
3. Environment variables

## Setup flow (`hermes memory setup`)

Interactive wizard reachable via `post_setup(hermes_home, config)`:

1. Prompt URL (default `http://localhost:3099`).
2. Prompt: "Redeem invite code now? [Y/n]"
   - Yes: ask code → `POST /invite {code, name, type:"agent"}` → capture `{identity, api_key}`.
     API key shown once — persist immediately to `.env`.
   - No: ask existing `api_key`.
3. `POST /rpc identity/whoami` with `Authorization: Bearer <api_key>` → show
   returned identity details, confirm.
4. Prompt `recall_mode` (hybrid default, one of context/tools/hybrid).
5. Prompt `emit_signals` (default no) — if yes, check `hermes-plugin` role fill via
   whoami capabilities; warn if not fulfilled.
6. Write `$HERMES_HOME/chorus.json` + `.env`.
7. Print summary + tunnel reminder if URL is localhost.

## Threading model

Mirrors Honcho exactly:
- `_prefetch_thread` / `_prefetch_lock` / `_prefetch_result`: background `memory/query`.
- `_sync_thread`: sequential turn syncing.
- All threads daemon-flagged.
- `shutdown()` joins with 5s timeout; misses are logged at debug, never raised.
- No connection pool tricks — single `requests.Session` is threadsafe for our pattern
  (one request at a time per thread; separate threads each get their own effective
  connection from the pool).

## Cron / subagent guard

Inside `initialize`:

```python
agent_context = kwargs.get("agent_context", "")
platform = kwargs.get("platform", "cli")
if agent_context in ("cron", "flush") or platform == "cron":
    self._cron_skipped = True
    return
```

Every public entry point short-circuits on `_cron_skipped`. Writes also guarded
on `agent_context != "subagent"` so child agents don't mutate the ring (reads OK).

## Error policy

| Condition                         | Behavior                                                             |
|-----------------------------------|----------------------------------------------------------------------|
| Tunnel unreachable (conn refused) | Log once at WARNING, plugin inactive for session, no spam            |
| HTTP 401                          | Log WARNING, plugin inactive for session (bad key)                   |
| HTTP 403 on signal emission       | Disable signal emission this session, memory ops still work          |
| HTTP 5xx                          | One retry with 1s backoff, then log WARNING, return empty/tool_error |
| JSON decode / malformed response  | Log DEBUG, return empty / tool_error                                 |
| Timeout (10s)                     | Log WARNING, return empty                                            |
| Missing `requests` dependency     | `is_available()` returns False                                       |

No exception is ever raised out of a hook — every hook has a try/except wrapping
network work. Provider failures must never crash the agent.

## Tool schemas (v1)

Matching OpenAI function-calling format (hermes requirement):

- `chorus_memory_store(content, entity, category, tags[], memory_type="semantic")` —
  Persist knowledge. Auto-scopes to project ring. Returns memory id.
- `chorus_memory_query(query, limit=8, tags[])` — Semantic search over accessible
  memories. Returns top-k with content + tags + age.
- `chorus_memory_recall(entity)` — All memories about a named entity across
  accessible namespaces.
- `chorus_emit_signal(stream_type, content, urgency, tags[])` *(opt-in)* — Post to
  the project ring. Hidden when `emit_signals=false`.
- `chorus_check_inbox(limit=5)` *(opt-in)* — Recent unread items scoped to
  the active identity + project ring.

Tool count when `recall_mode == "context"`: zero.
Tool count when `recall_mode == "tools"` or `"hybrid"`: 3 core + 2 opt-in (when enabled).

## Testing plan

Unit tests (`scripts/hermes_chorus_plugin/tests/`):
- `test_config.py`: resolution order, env override, default filling
- `test_client.py`: RPC envelope construction, header building, error mapping
  (401/403/5xx/timeout), retry behavior, response parsing
- `test_provider.py`: `is_available` branches, cron guard, recall_mode gating,
  tool dispatch table, error-to-tool_error conversion
- `test_session.py`: daemon thread lifecycle, lock safety of prefetch result,
  token budget truncation, chunking helper

Integration tests (require live local tunnel):
- `test_integration_whoami.py`: actual `identity/whoami` round-trip
- `test_integration_roundtrip.py`: store → query → recall same memory, assert
  content preserved, cleanup deletes test memory
- `test_integration_lifecycle.py`: simulate session start → turn → end, verify
  side effects on the hive (memory created, optional signal emitted, cleanup)

Integration tests are gated behind `CHORUS_INTEGRATION_TESTS=1` env var so CI
without tunnel access skips them cleanly.

## Observability

- Python `logging` under `plugins.memory.chorus.*`. Honors hermes logging level.
- Every RPC call logs method + latency at DEBUG; failures at WARNING.
- `hermes chorus status` CLI: prints config summary, health probe result,
  active ring, last emission time, pending thread count.

## Verification gates (per phase)

- **P0 design doc**: doc merged, parent bead `hermelinChat-ahi` notes updated with
  link. This phase.
- **P1 skeleton**: `discover_memory_providers()` returns `("chorus", ..., False)`
  before config written, `True` after. `hermes memory setup` lists chorus. No
  network calls during discovery.
- **P2 auth + whoami**: live `POST /rpc identity/whoami` from the test tunnel
  returns expected identity. Bad-token test returns clean failure. Connection-refused
  test logs and no-ops. All confirmed with captured stdout/stderr evidence.
- **P3 memory tools**: `chorus_memory_store` writes to the hive, `chorus_memory_query`
  retrieves it back with matching content. Live evidence: memory ID + server round-trip.
- **P4 context injection**: `system_prompt_block` includes formatted resume context
  after first call. `prefetch` returns background result. Lock contention test passes.
- **P5 lifecycle hooks**: `sync_turn` respects `sync_turn_emit` cadence. `on_session_end`
  emits final signal + stores briefing memory (verified on the hive). `on_pre_compress`
  returns summary string. `on_memory_write` mirrors adds only.
- **P6 installer**: idempotent install + clean uninstall. `hermes update` followed
  by installer reapply leaves plugin functional. Dry-run shows no unintended changes.
- **P7 live integration**: end-to-end hermes session with `memory.provider: chorus`.
  Every hook exercised. Results logged to `.planning/VERIFICATION.md`.

## Ops dependencies

Parallel external work (not blocking us):
- Add `hermes-plugin` role to `bootstrap.yml`, deploy.
- Provision dedicated identities per hermes install when requested.

These block only phase-6 signal-emission tests. Memory-only round-trip works
with any existing dev/ops-capable identity.

## Known limitations accepted for v1

- Same-identity cross-session inbox delivery bug (documented upstream as
  chorus-protocol#21 extension) — plugin uses `memory/recall` instead of `inbox/check`
  for resumption briefings, side-stepping the bug.
- Only memory provider configured at a time — this is hermes's global rule, not ours.
- No built-in ring switching mid-session. `cwd` at `initialize` time wins for the
  session.
