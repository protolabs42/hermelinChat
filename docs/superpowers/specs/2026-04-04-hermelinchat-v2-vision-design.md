# hermelinChat v2 — Vision Design

**Date:** 2026-04-04
**Status:** Draft
**Authors:** Inu + Sophie

## Summary

hermelinChat v2 replaces the PTY-bridge architecture with a native Tauri desktop app that talks to Hermes via ACP (Agent Client Protocol). Chat becomes structured (diffs, tool calls, thinking, approvals as first-class UI components), artifacts stay filesystem-based with instant updates via native file watching, and the Aurora identity carries forward with all 8 themes and background effects.

## Motivation

hermelinChat v1 works by forking Hermes inside a PTY and scraping raw terminal bytes over a WebSocket. This means:

- No structured data — every UI insight (tool status, diffs, thinking) must be regex-parsed from ANSI output
- No approval UI — dangerous command prompts are terminal-native, invisible to the web UI
- No diff rendering — file changes are just text in the terminal
- No thinking visibility — model reasoning is hidden
- No token tracking — usage is opaque

Hermes already supports ACP (`hermes acp`), a JSON-RPC 2.0 protocol over stdio that exposes all of these as structured events. hermelinChat v2 becomes an ACP client, gaining these capabilities as first-class protocol objects.

## Architecture

Three layers with clean boundaries:

### Layer 1: hermelinchat-acp (Rust crate)

A Rust library that manages the ACP protocol:

- Spawns `hermes acp` as a child process
- Reads/writes NDJSON over stdio
- Parses JSON-RPC 2.0 messages into typed Rust structs
- Emits domain events: `AgentThinking`, `AgentMessage`, `ToolCallStarted`, `ToolCallUpdate`, `DiffProposed`, `TerminalOutput`, `ApprovalRequested`, `UsageUpdate`, `SessionInfo`, `StreamEnd`
- Manages session lifecycle (new, prompt, cancel, load, resume)

This crate is Aurora-agnostic. Any Rust application could embed it to talk to Hermes over ACP.

### Layer 2: @hermelinchat/ui (React/TypeScript)

The frontend, carried forward from v1's decomposition (59 TypeScript files, 8 zustand stores):

- **Structured chat** — 8 component types render ACP events (see Chat UI section)
- **Artifact panel** — all 7 artifact types, bridge system, runner support
- **Theme engine** — 8 themes via CSS custom properties, background effects, Aurora identity
- **Settings** — theme picker, approval mode toggle, default artifacts, model config
- **Sessions** — list, search (FTS5), rename, delete, peek mode

The UI consumes typed events from Tauri IPC (`listen`). No protocol logic, no process management, no direct filesystem access.

### Layer 3: Tauri shell

The glue that connects Layer 1 and Layer 2:

- Window management, native menus, system tray
- IPC bridge: exposes Rust commands to the webview, pushes events from Rust to webview
- Artifact filesystem watcher (Rust `notify` crate on `~/.hermes/artifacts/`)
- Optional lock screen (PIN stored in OS keychain)
- Process lifecycle (spawn, shutdown, crash recovery)

### Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│              TAURI WEBVIEW (React)               │
│                                                  │
│  ┌──────────┐ ┌───────────┐ ┌────────────────┐  │
│  │Structured│ │ Artifact  │ │ Aurora Theme   │  │
│  │  Chat    │ │  Panel    │ │ Engine         │  │
│  └──────────┘ └───────────┘ └────────────────┘  │
│  ┌──────────┐ ┌───────────┐                     │
│  ��� Settings │ │ Sessions  │  Zustand Stores     │
│  └──────────┘ └───────────┘                     │
├─────────────── Tauri IPC ───────────────────────┤
│            TAURI RUST BACKEND                    │
│                                                  │
│  ┌──────────────────┐ ┌───────────┐ ┌────────┐  │
│  │hermelinchat-acp  │ │ Artifact  │ │ Lock   │  │
│  │(Rust crate)      │ │ Watcher   │ │ Screen │  │
│  │                  │ │ (notify)  │ │        │  │
│  └────────┬─────────┘ └─────┬─────┘ └────────┘  │
├───────────┼─────────────────┼────────────────────┤
│     stdio (NDJSON)    filesystem (notify)         │
│           │                 │                     │
│    ┌──────▼──────┐  ┌──────▼──────────────┐      │
│    │ hermes acp  │  │~/.hermes/artifacts/ │      │
│    │ (JSON-RPC)  │  │ session/ persistent/│      │
│    └─────────────┘  └────────────────────┘      │
└─────────────────────────────────────────────────┘
```

Two independent data paths:
- **ACP** (structured chat): webview ↔ Tauri IPC ↔ Rust ACP client ↔ stdio ↔ `hermes acp`
- **Artifacts** (out-of-band): Hermes writes JSON files → `notify` detects changes → Rust pushes to webview

## ACP Protocol Flow

### Session Lifecycle

1. `session/new` — create session (model, working directory)
2. `session/prompt` — send user message
3. `session/update` — streaming events (thinking, messages, tool calls, diffs, approvals)
4. `session/cancel` — cancel in-flight request
5. `session/load` / `session/resume` — restore from state.db

### Rust Domain Events

The ACP client parses JSON-RPC and emits typed events:

| Event | ACP Source | UI Rendering |
|-------|-----------|--------------|
| `AgentThinking(text)` | `agent_thought_chunk` | Collapsible thinking block, dimmed |
| `AgentMessage(text)` | `agent_message_chunk` | Streaming markdown message |
| `ToolCallStarted { id, name }` | `tool_call` | Compact activity indicator |
| `ToolCallUpdate { id, status, content }` | `tool_call_update` | Progress update inline |
| `DiffProposed { path, old, new }` | tool call file diff | Syntax-highlighted diff, accept/reject |
| `TerminalOutput { command, output }` | tool call terminal content | Collapsible command + output |
| `ApprovalRequested { id, desc, options }` | `session/request_permission` | Inline allow/deny prompt |
| `UsageUpdate { input, output, cost }` | `usage_update` | Token counter in footer |
| `SessionInfo { id, model }` | `session_info_update` | Session metadata |
| `StreamEnd` | final `session/update` | Re-enable input |

### Approval Flow & Yolo Mode

Hermes has three approval modes (`~/.hermes/config.yaml` → `approvals.mode`):

- **manual** — prompts for every dangerous command via ACP `session/request_permission`
- **smart** — auxiliary LLM auto-assesses risk (approve/deny/escalate)
- **off** — all approvals bypassed

Plus `HERMES_YOLO_MODE=1` env var for total bypass.

**v2 default: yolo.** The app ships with auto-approve on. The Rust ACP client auto-responds to `session/request_permission` with `allow_once`.

**Easy toggle:** A shield icon in the status bar cycles between yolo → smart → manual with one click. When a command would have been flagged but was auto-approved, a subtle inline note appears ("auto-approved: recursive delete") for awareness without interruption.

When switched to manual, the full `ApprovalPrompt` component renders inline in the chat with Allow Once / Allow Always / Deny buttons. The user's choice flows back through Rust → stdio → Hermes.

## Structured Chat UI

The main interface replaces the raw terminal with 8 component types:

### Components

| Component | Purpose |
|-----------|---------|
| `UserMessage` | User input with timestamp, markdown support |
| `AgentMessage` | Streaming text from Aurora, markdown rendered |
| `ThinkingBlock` | Collapsible, shows duration, dimmed italic text |
| `ToolCallInline` | Compact: icon + tool name + args + duration, click to expand |
| `DiffView` | Syntax-highlighted diff with file path, +/- stats, accept/reject buttons |
| `TerminalBlock` | Command + output, collapsible, exit code badge (green/red) |
| `ApprovalPrompt` | Inline allow/deny when not in yolo mode, command preview |
| `UsageBar` | Token counts (in/out) + estimated cost, updates per response |

### Chat Layout

Messages flow top-to-bottom. Each agent response is a group containing: optional ThinkingBlock, AgentMessage text, and interleaved ToolCallInline / DiffView / TerminalBlock entries as they arrive via streaming. The UsageBar sits at the bottom of each response group.

## Artifact System

Artifacts are a hermelinChat invention — a filesystem-based side-channel that bypasses ACP entirely.

### How It Works

1. Hermes calls `create_artifact` tool (patched into Hermes via `artifact_tool.py`)
2. Tool writes JSON to `~/.hermes/artifacts/session/` or `persistent/`
3. Tauri's Rust backend watches the directory with the `notify` crate
4. On file change: reads JSON, emits artifact event to webview via IPC
5. Frontend renders in the artifact panel

### Artifact Types

| Type | Rendering |
|------|-----------|
| `table` | Tabular data with conditional highlight rules |
| `chart` | Line/bar charts |
| `logs` | Streaming log viewer with severity levels |
| `markdown` | Rendered markdown |
| `html` | Sandboxed HTML/CSS/JS in iframe |
| `iframe` | External URL (e.g., Strudel music coding) |
| `map` | Map with markers |

### What Changes from v1

- **Polling → native file watching**: `notify` crate replaces 1.5s Python polling. Instant detection.
- **Bridge relay moves to Rust**: iframe artifacts call `window.__TAURI__.invoke('artifact_bridge_event', {...})` instead of `fetch('/api/...')`.
- **Session cleanup in Rust**: PID management and session artifact removal on new session.

### What Stays the Same

- `artifact_tool.py` (Hermes-side toolset) — untouched
- All 7 artifact types and their JSON schemas
- Runner system (background Python processes with PID files)
- Bridge system (bidirectional iframe ↔ Hermes communication via state files)
- Artifact panel UI components carry forward from v1

## Theme Engine & Aurora Identity

### Generic Theme Contract

Any ACP client skin implements this interface:

```typescript
interface ThemeDefinition {
  id: string
  label: string
  colors: {
    accent: Scale<300..900>  // 7-stop accent scale
    bg: string
    surface: string
    elevated: string
    border: string
    muted: string
    text: string
    textBright: string
    danger: string
    success: string
    info: string
    purple: string
    cyan: string
  }
  background?: BackgroundEffect
  identity?: BrandIdentity
}
```

### Aurora Identity Layer

hermelinChat's personality, layered on top of the generic contract:

```typescript
interface BrandIdentity {
  faviconHref: string
  topbarSvgRaw: string
  mascotSvgRaw: string
  mascotTitle: string
  whisperText: string
  whisperFetch: boolean
}

type BackgroundEffect =
  | { kind: 'particles' }
  | { kind: 'matrix-rain'; config: MatrixRainConfig }
  | { kind: 'nous-crt' }
  | { kind: 'samaritan' }
```

### 8 Themes

All carry forward from v1:

1. **Hermelin** (amber) — default, particles background
2. **Matrix** (green) — matrix-rain background, skull topbar, white rabbit mascot
3. **Nous** (aqua) — CRT background, Nous Research branding
4. **Samaritan** (light/red) — light theme, samaritan background
5. **Catppuccin Mocha** (lavender) — Aurora identity, particles
6. **Catppuccin Macchiato** (lavender) — Aurora identity, particles
7. **Catppuccin Frappé** (lavender) — Aurora identity, particles
8. **Catppuccin Latte** (lavender) — light theme, Aurora identity, particles

### Improvement Over v1

Themes use **CSS custom properties** instead of JavaScript object imports. This enables:
- Theme hot-swap without page reload
- Easier community theme authoring (just a CSS file + JSON metadata)
- Smaller bundle (no theme objects in JS)

## Session Management

### Data Sources

hermelinChat does NOT maintain its own session storage. It reads from two databases:

- **`~/.hermes/state.db`** (owned by Hermes) — sessions table, messages table, FTS5 search index. Contains all conversation history, token usage, model config.
- **`~/.hermes/hermelin_meta.db`** (owned by hermelinChat) — session titles (user-renamed), whisper text for the alignment mascot.

### Operations

| Operation | Implementation |
|-----------|---------------|
| List sessions | Rust reads `state.db` via `rusqlite` |
| Search messages | Rust queries FTS5 index in `state.db` |
| Resume session | ACP `session/load` or `session/resume` (restores from state.db internally) |
| Rename session | `hermes sessions rename` subprocess + write to meta DB |
| Delete session | `hermes sessions delete` subprocess + remove from meta DB |
| Session titles | Read from meta DB, overlay onto state.db results |

### Search

Full-text search across all message history using SQLite FTS5 (already indexed in state.db). Results show snippet, session title, timestamp, and model. Peek mode previews a message in context without leaving the current session.

## Tauri Shell & Desktop Integration

### IPC Commands (webview → Rust)

| Command | Purpose |
|---------|---------|
| `acp_send_prompt` | Send user message to Hermes |
| `acp_new_session` | Create new ACP session |
| `acp_cancel` | Cancel in-flight request |
| `acp_approve` | Respond to permission request |
| `list_sessions` | Query state.db |
| `search_messages` | FTS5 search state.db |
| `get_artifacts` | Current artifact snapshot |
| `artifact_bridge_event` | Bridge command from iframe |
| `set_approval_mode` | Toggle yolo/smart/manual |
| `lock_screen_check` | Verify PIN |

### IPC Events (Rust → webview)

| Event | Purpose |
|-------|---------|
| `acp:event` | All ACP domain events |
| `artifact:update` | Artifact created/changed/removed |
| `artifact:focus` | Focus a specific artifact tab |
| `artifact:bridge` | Bridge command forwarded to iframe |
| `session:status` | Connection status |

### Native Features

- **System tray** — minimize to tray, notification badge on response completion
- **Native menus** — File, Edit, View, Help
- **Auto-update** — Tauri's built-in updater
- **Window state** ��� remembers size, position, panel state
- **Lock screen** — optional PIN stored in OS keychain via Tauri's secure storage

### Process Lifecycle

- Launch: spawn `hermes acp` with configured env vars (including `HERMES_YOLO_MODE` when yolo is active)
- Shutdown: SIGTERM → wait for graceful shutdown → exit
- Crash: detect process death, show reconnect UI, offer respawn

## What Gets Dropped from v1

| v1 Feature | Reason |
|------------|--------|
| FastAPI backend (`hermelin/server.py`) | Replaced by Tauri Rust backend |
| PTY terminal bridge | Replaced by ACP structured protocol |
| Raw terminal rendering | Replaced by structured chat components |
| Password auth + session cookies | Replaced by optional lock screen (desktop app) |
| WebSocket transport | Replaced by Tauri IPC |
| IP allowlist / CORS / TLS config | Not needed for local desktop app |

## Implementation Phases

### Phase 1: Tauri Scaffold + ACP Core

1. Scaffold Tauri app (`cargo create-tauri-app`), window opens
2. Minimal React setup: text input, message list, mock messages for layout validation
3. Rust backend: spawn `hermes acp`, pipe stdio
4. JSON-RPC parsing: NDJSON → typed Rust structs (`hermelinchat-acp` crate)
5. Wire together: real Hermes responses stream into webview, replacing mocks

**Goal:** You can have a text conversation with Hermes through a Tauri window.

### Phase 2: Structured Chat

- All 8 chat components: UserMessage, AgentMessage, ThinkingBlock, ToolCallInline, DiffView, TerminalBlock, ApprovalPrompt, UsageBar
- Approval flow with yolo default + status bar toggle
- Message input with markdown support

**Goal:** Full structured chat replaces raw terminal.

### Phase 3: Artifact System

- Rust filesystem watcher (`notify`) on `~/.hermes/artifacts/`
- Artifact panel carry-forward from v1
- Bridge command relay via Tauri IPC
- All 7 artifact types rendering

**Goal:** Artifacts work exactly like v1 but with instant updates.

### Phase 4: Theme Engine & Aurora

- Generic theme contract via CSS custom properties
- All 8 themes ported from v1
- Background effects (particles, matrix-rain, CRT, samaritan)
- Aurora identity (fox mascot, whisper, per-theme favicons)

**Goal:** Looks and feels identical to v1.

### Phase 5: Sessions, Search & Settings

- Session list from `state.db` via `rusqlite`
- FTS5 search with peek mode
- Settings panel (theme picker, approval mode, default artifacts, model config)
- Meta DB for titles + whispers
- Rename/delete sessions

**Goal:** Feature parity with v1.

### Phase 6: Desktop Polish

- Optional lock screen (OS keychain)
- System tray + notification badges
- Native menus
- Auto-update
- Window state persistence

**Goal:** Feels like a native app, not a web wrapper.

## Non-Goals

- **Web deployment** — v2 is Tauri-only. No WebSocket relay or browser fallback.
- **Plugin architecture** — no formal plugin API. Community themes are just CSS + JSON.
- **Multiple agent support** — one `hermes acp` instance per window.
- **Mobile** — desktop only (macOS, Linux, Windows via Tauri).
- **Svelte rewrite** — React carries forward from v1's decomposition.
