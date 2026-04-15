# Sophie Chorus Plugin — Design Doc

Status: accepted, pre-scaffold
Bead: hermelinChat-bbj
Date: 2026-04-15
Author: sophie

## Goal

Ambient chorus integration for sophie (Claude Code), equivalent in spirit to
aurora's hermes chorus plugin. Make the session-bootstrap / session-close ritual
unskippable by wiring it to Claude Code lifecycle hooks. Capture context
before auto-compaction destroys it.

Today those rituals live in the global `~/.claude/CLAUDE.md` as instructions I
*should* follow. Instructions are fallible under pressure; hooks aren't. This
plugin removes the failure mode.

## Non-goals (v1)

- Per-turn injection (honcho-style rolling peer representations). Wrong shape
  for chorus, which is deliberate-signals-plus-durable-memory, not continual
  retrieval. Ruled out in brainstorm.
- Per-turn signal emission (`Stop`, `PostToolUse`, `UserPromptSubmit`). Creates
  ring noise, zero concrete win over the three lifecycle hooks.
- Subagent hooks (`SubagentStart` / `SubagentStop`). Nice audit-trail add, but
  high noise cost on parallel fan-outs (16 signals per operation), no scenario
  yet where I can't reconstruct from existing chorus primitives. Revisit when
  a real need appears.
- Bundling a plugin-local MCP server. External `chorus-mcp` pointing at
  `https://chorus.runclaw.run` is the single source of truth. Plugin assumes
  it's separately installed.
- Publishing publicly. Private repo until it earns polish.
- Any deriver / async synthesis worker. v2 if ever.

## Reference prior art

Plastic Labs ship `plastic-labs/claude-honcho` — the marketplace-in-a-repo
pattern that informed this design. Key learnings we're adopting:

- Repo is its own marketplace (`.claude-plugin/marketplace.json` at root).
- Plugin lives under `plugins/<name>/` with `.claude-plugin/plugin.json`.
- `hooks.json` points at Bun-executed `.ts` scripts via `${CLAUDE_PLUGIN_ROOT}`.
- Thin hook entrypoints delegate to handlers in `src/`.

Things we're *not* copying from claude-honcho:

- Their 6-hook set (`UserPromptSubmit`, `PostToolUse`, `Stop`). Architected for
  honcho's per-turn representation model. Three hooks is right for chorus.
- Bundled MCP. They bundle because their MCP is a thin HTTP wrapper; ours is
  already a stand-alone published package.
- `honcho-dev` sibling plugin (migration skills). No equivalent for us yet.

## Architecture

```
   Claude Code session
          │
          ├── SessionStart ── sophie-chorus hook ── chorus_resume_context(cwd)
          │                           │
          │                           └── additionalContext → injected into my context
          │
          ├── (normal turns — no hook fires)
          │
          ├── PreCompact ──── sophie-chorus hook ── chorus_memory_store(pre-compact)
          │                           │              + chorus_emit_signal(pulse)
          │
          └── SessionEnd ──── sophie-chorus hook ── chorus_memory_store(briefing)
                                      │              + chorus_emit_signal(sense)

   All RPCs go to chorus-mcp (externally installed) →
     https://chorus.runclaw.run/rpc with Bearer auth.
```

All hook scripts are stand-alone: they spawn, call the chorus HTTP RPC directly
(not via MCP — MCP is for in-agent tool use), exit. No long-running process,
no shared state between hooks beyond what chorus stores server-side.

## Repo layout

```
sophie-chorus/                              ← marketplace repo root (private)
├── .claude-plugin/
│   └── marketplace.json                    ← one-entry marketplace manifest
├── plugins/
│   └── sophie-chorus/                      ← the plugin
│       ├── .claude-plugin/
│       │   └── plugin.json                 ← name/version/license/hooks pointer
│       ├── hooks/
│       │   ├── hooks.json                  ← event → script map
│       │   ├── session-start.ts            ← thin: initHook() + handleSessionStart()
│       │   ├── session-end.ts              ← thin: initHook() + handleSessionEnd()
│       │   └── pre-compact.ts              ← thin: initHook() + handlePreCompact()
│       ├── src/
│       │   ├── config.ts                   ← env load (CHORUS_URL, CHORUS_API_KEY)
│       │   ├── chorus-rpc.ts               ← POST /rpc helper, Bearer auth, retries
│       │   ├── hooks/
│       │   │   ├── session-start.ts        ← handler
│       │   │   ├── session-end.ts          ← handler
│       │   │   └── pre-compact.ts          ← handler
│       │   └── format.ts                   ← resume_context → additionalContext string
│       ├── tsconfig.json
│       ├── package.json                    ← bun runtime, minimal deps
│       └── bun.lock
├── tests/                                  ← not shipped in plugin dir
│   ├── chorus-rpc.test.ts                  ← mocked HTTP
│   └── format.test.ts
├── README.md
├── CHANGELOG.md
└── LICENSE
```

Matches claude-honcho's pattern with one plugin instead of two.

## Runtime & deps

- **Bun + TypeScript.** Native ESM, no build step, `bun run *.ts` is the
  entrypoint. Startup < 50ms, matters for hook latency.
- **Zero runtime deps** beyond Bun. `fetch` is global. We write our own RPC
  helper — thin enough not to justify a client library.
- **Dev deps**: `bun:test` for unit tests.

Rationale for Bun over Node: claude-honcho's precedent, fast startup, ESM
without tsconfig gymnastics. Rationale over Python: hooks live in
`~/.claude/` ecosystem, TS fits better; no Python dep needed in this repo.

## Per-hook contracts

### SessionStart

**Trigger:** Claude Code session opens (source `startup`, `resume`, `clear`, or `compact`).

**Input (stdin JSON):**
```
session_id, transcript_path, cwd, hook_event_name, source, model
```

**Action:**
1. Load `CHORUS_URL`, `CHORUS_API_KEY` from env (or `~/.claude/secrets/chorus.env`).
2. POST `chorus_resume_context` with `{ cwd }`.
3. Format response into a terse markdown brief: project tag, workstream, inbox
   now/recent (top 3 each), active tasks, blocked, recent memory (top 5,
   truncated), suggested next action.
4. Emit JSON to stdout:
   ```json
   { "hookSpecificOutput": {
       "hookEventName": "SessionStart",
       "additionalContext": "<brief>"
   } }
   ```

**Timeout:** 10s (chorus usually responds <500ms; 10s leaves room for cold starts).

**Failure mode:** On any error (chorus unreachable, auth fail, malformed response),
write short note to stderr, exit 0 with `additionalContext: ""`. Never block session.

**Source filter:** Skip on `source: "compact"` — PreCompact already stored
recent-memory for that transition. Re-fetching resume_context immediately after
compaction is redundant and noisy.

### SessionEnd

**Trigger:** Session ends for any reason (`clear`, `resume`, `logout`,
`prompt_input_exit`, `bypass_permissions_disabled`, `other`).

**Input (stdin JSON):**
```
session_id, transcript_path, cwd, hook_event_name, reason
```

**Action:**
1. Same env load.
2. Read last N turns from transcript file at `transcript_path` (tail, not full
   parse). N=20 by default.
3. POST `chorus_memory_store` with:
   - namespace: `ring:<project-ring-id>` (resolved via cached tag or a light
     `chorus_resume_context` call)
   - category: `session-briefing`
   - entity: project-tag
   - tags: `[project-tag, "session-end", <ISO-date>]`
   - content: terse summary (session length, last commit, open threads from
     recent memory query, outstanding beads)
4. POST `chorus_emit_signal` with:
   - ring: project ring
   - kind: `sense`
   - urgency: 0.3
   - content: "sophie session-end — {reason}, {turns} turns, HEAD {short-sha}"

**Timeout:** 10s.

**Failure mode:** Log to stderr, exit 0. Session already ended — user
experience doesn't care.

**Reason filter:** On `reason: "resume"`, skip (we're not ending, we're
switching).

### PreCompact

**Trigger:** Claude Code about to auto-compact (matcher `auto`) or user
triggered `/compact` (matcher `manual`).

**Input (stdin JSON):**
```
session_id, transcript_path, cwd, hook_event_name, trigger, custom_instructions
```

**Action:**
1. Env load.
2. Tail transcript (last ~40 turns, more than SessionEnd since context is
   full).
3. POST `chorus_memory_store`:
   - namespace: `ring:<project-ring-id>`
   - category: `pre-compact-insight`
   - entity: project-tag + `-precompact`
   - tags: `[project-tag, "pre-compact", <ISO-date>, trigger]`
   - content: distilled "what sophie was working on at compact time" — open
     threads, partial work, next-expected-step
4. POST `chorus_emit_signal`:
   - kind: `pulse`
   - urgency: 0.2
   - content: "sophie context compacted ({trigger}) — briefing stored"

**Timeout:** 20s (matches claude-honcho; compaction itself has a timeout so
we want to be well under it).

**Failure mode:** Log, exit 0. Compaction proceeds regardless; we lose that
one save but nothing breaks.

## Chorus integration contract

Tools we call (via HTTP `/rpc`, not MCP):

| Tool | Hook | Frequency |
|---|---|---|
| `chorus_resume_context` | SessionStart | Per session open |
| `chorus_memory_store` | SessionEnd, PreCompact | Per session close / compact |
| `chorus_emit_signal` | SessionEnd, PreCompact | Per session close / compact |

Signals we emit:

- `sense` at SessionEnd, urgency 0.3 — audit trail of work ended
- `pulse` at PreCompact, urgency 0.2 — low-urgency "still alive, saved state"

Memory we write:

- `session-briefing` (episodic-ish, but we'll use `procedural` type to match
  existing `next-session-plan` entries) at SessionEnd
- `pre-compact-insight` (procedural) at PreCompact

Both memory writes use `ring:<project-ring-id>` namespace so they scope to the
folder sophie was working in, matching existing chorus convention.

## Config & secrets

```
~/.claude/secrets/chorus.env        ← CHORUS_URL, CHORUS_API_KEY
```

Already exists for the MCP install — we reuse, don't duplicate. Plugin never
requires interactive setup.

Fall-back env var read order:
1. `$CHORUS_URL`, `$CHORUS_API_KEY` directly in env
2. `~/.claude/secrets/chorus.env` (dotenv parse)
3. `~/.claude/secrets/chorus.json` (if someone prefers JSON)

If all three fail → no-op with stderr warning. Plugin never errors the session.

## Error handling philosophy

**Never block the session.** Every hook script wraps its work in a top-level
try/catch; any error logs to stderr (user-visible but non-blocking) and
exits 0. Chorus being down is annoying, not fatal.

**No retries for transient errors.** Hook fires once per lifecycle event; if
network is flaky we miss that one event rather than delay the session. Chorus
is eventually-consistent enough that a missed briefing next session is
recoverable from git + transcript tail.

**No queuing / deferred writes.** If we want retry semantics later we add a
sidecar daemon; not in v1.

## Install flow

One-time, per machine:

```
/plugin marketplace add /path/to/sophie-chorus         # local path for now
/plugin install sophie-chorus@sophie-chorus
```

After install, plugin shows in `enabledPlugins`, hooks auto-register from
`hooks.json`, no manual settings.json edits needed. Same UX as beads,
skill-seeker, etc.

Uninstall: `/plugin uninstall sophie-chorus@sophie-chorus`. Clean.

## Testing strategy

- **Unit tests** (`bun:test`): `chorus-rpc.ts` with mocked `fetch`, `format.ts`
  against fixture `chorus_resume_context` payloads.
- **Integration smoke** (manual, one-shot per change): invoke each hook script
  directly with a fixture stdin, verify stdout + chorus state after.
- **End-to-end** (manual): install in a fresh Claude Code session, verify
  (a) SessionStart brief shows up, (b) SessionEnd emits signal visible in
  `chorus_search_signals`, (c) PreCompact fires by triggering `/compact`
  and checking memory.

No CI until v2.

## Open questions

- **Project-ring resolution caching.** Every hook resolves `ring:<project-id>`
  from `cwd`. We either (a) call `chorus_resume_context` to get it — but that
  means PreCompact does two HTTP calls — or (b) cache the mapping in
  `~/.claude/plugins/cache/sophie-chorus/rings.json` after first SessionStart.
  Lean toward (b) for latency; the cache is purely an optimization, stale
  cache at worst causes a memory write to go to the wrong ring which is
  recoverable.

- **Transcript tail strategy.** The transcript is JSONL, full conversation.
  Tailing last N lines blindly can cut a message in half. Proper parse to
  last-N-complete-messages is safer but more code. Probably do the proper
  parse, it's ~30 lines of TS.

## v2 candidates (explicitly not in v1)

- `SubagentStart/Stop` hooks, with `agent_type` matcher filter to avoid spam
  on `Explore`/`statusline-setup`.
- Periodic inbox poll via `UserPromptSubmit` + Nth-turn counter, if
  cross-agent mid-session pings become common.
- Async synthesis deriver (honcho-style) that walks transcript, distills
  entity-level memories into chorus. Requires a background process or cron.
- `Elicitation` hook to capture `AskUserQuestion` moments as chorus `query`
  signals — useful if we ever want fleet agents to answer each other.
- Publish to a public marketplace (or host as a GitHub template).

## Success criteria

A week after install:

1. Every session I start shows a chorus brief without me asking — zero skipped.
2. Every session close leaves a briefing in chorus — zero skipped.
3. At least one context compaction happened and the pre-compact memory is
   findable via `chorus_memory_query`.
4. No session was blocked, slowed, or errored by the plugin.
5. Inu has not had to debug the plugin once.

If 1-4 hold, v1 is a success and we have the validation base to decide about
subagent hooks or periodic pulses.
