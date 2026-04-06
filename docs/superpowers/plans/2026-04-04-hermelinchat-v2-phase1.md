# hermelinChat v2 Phase 1: Tauri Scaffold + ACP Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Tauri desktop app where you can have a text conversation with Hermes via ACP.

**Architecture:** Tauri v2 app with React/TypeScript frontend and Rust backend. The Rust backend spawns `hermes acp` as a child process, reads NDJSON from stdout, parses JSON-RPC into typed domain events, and emits them to the webview via Tauri events. The frontend renders streaming messages in a minimal chat UI.

**Tech Stack:** Tauri v2, React 18, TypeScript, Zustand, Rust (serde, serde_json, tokio), Vite

**Spec:** `docs/superpowers/specs/2026-04-04-hermelinchat-v2-vision-design.md`

---

## File Structure

```
hermelinChat/
├── src-tauri/                          # Rust backend (NEW)
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   └── src/
│       ├── main.rs                     # Tauri entry point
│       ├── lib.rs                      # Module declarations
│       ├── commands.rs                 # Tauri IPC command handlers
│       └── acp/
│           ├── mod.rs                  # Module re-exports
│           ├── client.rs              # Spawn hermes acp, manage stdio lifecycle
│           ├── protocol.rs            # JSON-RPC parsing, NDJSON line reader
│           └── events.rs             # Typed domain events (serde structs)
├── v2/                                # React frontend (NEW)
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx                   # React entry point
│       ├── App.tsx                    # Root layout (chat area)
│       ├── types/
│       │   └── acp.ts                # TypeScript types matching Rust events
│       ├── stores/
│       │   └── chat.ts               # Zustand store for messages + connection state
│       ├── hooks/
│       │   └── useAcpEvents.ts       # Tauri event listener hook
│       └── components/
│           ├── ChatView.tsx           # Scrollable message list
│           ├── MessageBubble.tsx      # Single message (user or agent)
│           ├── MessageInput.tsx       # Text input + send button
│           └── StatusBar.tsx          # Connection status indicator
└── Cargo.toml                         # Workspace (NEW)
```

**Why `v2/` for the frontend:** The existing `frontend/` is the v1 React app (PTY-based). Phase 1 starts fresh in `v2/` with just the minimal chat UI. Later phases will port components from `frontend/src/` into `v2/src/`.

**Why `src-tauri/` at root:** Standard Tauri convention. The workspace `Cargo.toml` at root includes `src-tauri/` as a member.

---

## Task 1: Scaffold Tauri Project

**Files:**
- Create: `Cargo.toml` (workspace)
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`

- [x] **Step 1: Create workspace Cargo.toml**
- [x] **Step 2: Create src-tauri/Cargo.toml**
- [x] **Step 3: Create src-tauri/build.rs**
- [x] **Step 4: Create src-tauri/tauri.conf.json**
- [x] **Step 5: Create src-tauri/capabilities/default.json**
- [x] **Step 6: Create src-tauri/src/main.rs**
- [x] **Step 7: Create src-tauri/src/lib.rs**
- [x] **Step 8: Create src-tauri/src/commands.rs** (placeholder)
- [x] **Step 9: Add Rust/Tauri entries to .gitignore**
- [x] **Step 10: Verify Rust compiles**
- [x] **Step 11: Commit**

---

## Task 2: Scaffold React Frontend

**Files:**
- Create: `v2/package.json`
- Create: `v2/tsconfig.json`
- Create: `v2/vite.config.ts`
- Create: `v2/index.html`
- Create: `v2/src/main.tsx`
- Create: `v2/src/App.tsx`

- [x] **Step 1: Create v2/package.json**
- [x] **Step 2: Create v2/tsconfig.json**
- [x] **Step 3: Create v2/vite.config.ts**
- [x] **Step 4: Create v2/index.html**
- [x] **Step 5: Create v2/src/main.tsx**
- [x] **Step 6: Create v2/src/App.tsx** (mock chat layout)
- [x] **Step 7: Install dependencies and verify**
- [x] **Step 8: Verify Tauri dev launches**
- [x] **Step 9: Commit**

---

## Task 3: ACP Domain Event Types

**Files:**
- Create: `src-tauri/src/acp/mod.rs`
- Create: `src-tauri/src/acp/events.rs`
- Create: `v2/src/types/acp.ts`

- [x] **Step 1: Create src-tauri/src/acp/mod.rs**
- [x] **Step 2: Create src-tauri/src/acp/events.rs**
- [x] **Step 3: Create v2/src/types/acp.ts** (mirrors Rust events)
- [x] **Step 4: Update src-tauri/src/lib.rs to include acp module**
- [x] **Step 5: Verify compilation**
- [x] **Step 6: Commit**

---

## Task 4: JSON-RPC Protocol Parser

**Files:**
- Create: `src-tauri/src/acp/protocol.rs`

The protocol module reads NDJSON lines from `hermes acp` stdout and converts raw JSON-RPC session_update messages into typed `AcpEvent` values.

- [x] **Step 1: Create src-tauri/src/acp/protocol.rs**
- [x] **Step 2: Run tests**
- [x] **Step 3: Commit**

---

## Task 5: ACP Client (Process Manager)

**Files:**
- Create: `src-tauri/src/acp/client.rs`
- Modify: `src-tauri/src/lib.rs`

The client spawns `hermes acp`, reads stdout line by line, parses each line into domain events, and emits them to the Tauri webview.

- [x] **Step 1: Create src-tauri/src/acp/client.rs**
- [x] **Step 2: Verify compilation**
- [x] **Step 3: Commit**

---

## Task 6: Tauri IPC Commands

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

Wire the ACP client into Tauri commands so the frontend can create sessions and send prompts.

- [x] **Step 1: Rewrite src-tauri/src/commands.rs**
- [x] **Step 2: Update src-tauri/src/lib.rs** to register commands and spawn ACP on startup
- [x] **Step 3: Verify compilation**
- [x] **Step 4: Commit**

---

## Task 7: Frontend Zustand Store + Event Listener

**Files:**
- Create: `v2/src/stores/chat.ts`
- Create: `v2/src/hooks/useAcpEvents.ts`

- [x] **Step 1: Create v2/src/stores/chat.ts**
- [x] **Step 2: Create v2/src/hooks/useAcpEvents.ts**
- [x] **Step 3: Commit**

---

## Task 8: Wire Frontend to Backend

**Files:**
- Modify: `v2/src/App.tsx`
- Create: `v2/src/components/ChatView.tsx`
- Create: `v2/src/components/MessageBubble.tsx`
- Create: `v2/src/components/MessageInput.tsx`
- Create: `v2/src/components/StatusBar.tsx`

- [x] **Step 1: Create v2/src/components/StatusBar.tsx**
- [x] **Step 2: Create v2/src/components/MessageBubble.tsx**
- [x] **Step 3: Create v2/src/components/ChatView.tsx**
- [x] **Step 4: Create v2/src/components/MessageInput.tsx**
- [x] **Step 5: Rewrite v2/src/App.tsx**
- [x] **Step 6: Verify Tauri dev launches and shows chat UI**
- [x] **Step 7: Test real conversation**
- [x] **Step 8: Commit**

---

## Task 9: Error Handling & Reconnect

**Files:**
- Modify: `v2/src/components/StatusBar.tsx`
- Modify: `v2/src/App.tsx`

- [x] **Step 1: Add reconnect button to StatusBar**
- [x] **Step 2: Add acp_reconnect command to Rust**
- [x] **Step 3: Verify reconnect works**
- [x] **Step 4: Commit**

---

## Phase 1 Completion Criteria

- [x] Tauri window opens with chat UI
- [x] Status bar shows connection state (connected/disconnected)
- [x] User can type a message and send it
- [x] Hermes responds with streaming text
- [x] Thinking blocks appear (collapsible in Phase 2)
- [x] Tool call indicators appear (detailed rendering in Phase 2)
- [x] Reconnect works if hermes acp dies
- [x] `cargo test` passes (JSON-RPC parser tests)
- [x] All code committed on a feature branch
