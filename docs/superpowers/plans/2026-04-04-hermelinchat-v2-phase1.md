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

- [ ] **Step 1: Create workspace Cargo.toml**

```toml
[workspace]
members = ["src-tauri"]
resolver = "2"
```

- [ ] **Step 2: Create src-tauri/Cargo.toml**

```toml
[package]
name = "hermelinchat"
version = "0.1.0"
edition = "2021"

[lib]
name = "hermelinchat_lib"
crate-type = ["lib", "cdylib", "staticlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["sync", "io-util", "process"] }
```

- [ ] **Step 3: Create src-tauri/build.rs**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 4: Create src-tauri/tauri.conf.json**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "identifier": "com.hermelinchat.app",
  "productName": "hermelinChat",
  "version": "0.1.0",
  "build": {
    "frontendDist": "../v2/dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "cd v2 && npm run dev",
    "beforeBuildCommand": "cd v2 && npm run build"
  },
  "app": {
    "title": "hermelinChat",
    "windows": [
      {
        "label": "main",
        "title": "hermelinChat",
        "width": 900,
        "height": 700,
        "minWidth": 600,
        "minHeight": 400
      }
    ],
    "security": {
      "csp": null
    }
  },
  "plugins": {}
}
```

- [ ] **Step 5: Create src-tauri/capabilities/default.json**

```json
{
  "identifier": "default",
  "description": "Default capability for hermelinChat",
  "windows": ["main"],
  "permissions": [
    "core:default"
  ]
}
```

- [ ] **Step 6: Create src-tauri/src/main.rs**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    hermelinchat_lib::run()
}
```

- [ ] **Step 7: Create src-tauri/src/lib.rs**

```rust
mod commands;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::greet,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 8: Create src-tauri/src/commands.rs** (placeholder)

```rust
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}
```

- [ ] **Step 9: Add Rust/Tauri entries to .gitignore**

Append to `.gitignore`:

```
# Tauri / Rust
target/
v2/dist/
```

- [ ] **Step 10: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

- [ ] **Step 11: Commit**

```bash
git add Cargo.toml src-tauri/ .gitignore
git commit -m "feat(v2): scaffold Tauri project"
```

---

## Task 2: Scaffold React Frontend

**Files:**
- Create: `v2/package.json`
- Create: `v2/tsconfig.json`
- Create: `v2/vite.config.ts`
- Create: `v2/index.html`
- Create: `v2/src/main.tsx`
- Create: `v2/src/App.tsx`

- [ ] **Step 1: Create v2/package.json**

```json
{
  "name": "hermelinchat-v2",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create v2/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create v2/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
})
```

- [ ] **Step 4: Create v2/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>hermelinChat</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
        background: #1e1e2e;
        color: #cdd6f4;
        overflow: hidden;
      }
      #root { height: 100vh; display: flex; flex-direction: column; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create v2/src/main.tsx**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 6: Create v2/src/App.tsx** (mock chat layout)

```tsx
import { useState } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

const MOCK_MESSAGES: Message[] = [
  { id: '1', role: 'user', content: 'Hello Aurora', timestamp: Date.now() - 2000 },
  { id: '2', role: 'assistant', content: 'Hello! How can I help you today?', timestamp: Date.now() },
]

export default function App() {
  const [messages] = useState<Message[]>(MOCK_MESSAGES)
  const [input, setInput] = useState('')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 10,
              color: msg.role === 'user' ? '#b4befe' : '#a6e3a1',
              fontWeight: 700,
              marginBottom: 4,
            }}>
              {msg.role === 'user' ? 'YOU' : 'AURORA'}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{
        borderTop: '1px solid #45475a',
        padding: '12px 16px',
        display: 'flex',
        gap: 8,
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message Aurora..."
          style={{
            flex: 1,
            background: '#313244',
            border: '1px solid #45475a',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#cdd6f4',
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          style={{
            background: '#b4befe',
            color: '#1e1e2e',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontWeight: 700,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Install dependencies and verify**

Run: `cd v2 && npm install`
Expected: Installs without errors.

- [ ] **Step 8: Verify Tauri dev launches**

Run: `cd /home/inu/hermelinChat && cargo tauri dev`
Expected: Window opens showing mock chat with two messages and an input field.

- [ ] **Step 9: Commit**

```bash
git add v2/
git commit -m "feat(v2): scaffold React frontend with mock chat UI"
```

---

## Task 3: ACP Domain Event Types

**Files:**
- Create: `src-tauri/src/acp/mod.rs`
- Create: `src-tauri/src/acp/events.rs`
- Create: `v2/src/types/acp.ts`

- [ ] **Step 1: Create src-tauri/src/acp/mod.rs**

```rust
pub mod events;
pub mod protocol;
pub mod client;
```

- [ ] **Step 2: Create src-tauri/src/acp/events.rs**

These are the domain events the Rust backend emits to the frontend via Tauri IPC. They map from raw ACP JSON-RPC to clean, typed structures.

```rust
use serde::{Deserialize, Serialize};

/// Domain events emitted to the frontend via Tauri events.
/// Each variant maps to one or more ACP session_update types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum AcpEvent {
    /// Streaming thinking text
    AgentThinking { text: String },

    /// Streaming message text
    AgentMessage { text: String },

    /// Tool call started
    ToolCallStarted {
        id: String,
        title: String,
        tool_kind: String,
    },

    /// Tool call updated (progress, completion)
    ToolCallUpdate {
        id: String,
        status: String,
        content: Vec<ToolContent>,
    },

    /// File diff proposed (from tool call content)
    DiffProposed {
        tool_call_id: String,
        path: String,
        old_text: Option<String>,
        new_text: String,
    },

    /// Terminal output (from tool call content)
    TerminalOutput {
        tool_call_id: String,
        command: String,
        output: String,
    },

    /// Approval requested
    ApprovalRequested {
        id: String,
        description: String,
        command: String,
        options: Vec<ApprovalOption>,
    },

    /// Token usage update
    UsageUpdate {
        used: u64,
        size: u64,
        cost_usd: Option<f64>,
    },

    /// Session info
    SessionInfo {
        session_id: String,
        model: Option<String>,
    },

    /// Stream completed
    StreamEnd,

    /// Connection status change
    ConnectionStatus { status: String, message: Option<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ToolContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "diff")]
    Diff {
        path: String,
        old_text: Option<String>,
        new_text: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalOption {
    pub id: String,
    pub label: String,
}
```

- [ ] **Step 3: Create v2/src/types/acp.ts** (mirrors Rust events)

```typescript
export type AcpEvent =
  | { kind: 'AgentThinking'; text: string }
  | { kind: 'AgentMessage'; text: string }
  | { kind: 'ToolCallStarted'; id: string; title: string; tool_kind: string }
  | { kind: 'ToolCallUpdate'; id: string; status: string; content: ToolContent[] }
  | { kind: 'DiffProposed'; tool_call_id: string; path: string; old_text: string | null; new_text: string }
  | { kind: 'TerminalOutput'; tool_call_id: string; command: string; output: string }
  | { kind: 'ApprovalRequested'; id: string; description: string; command: string; options: ApprovalOption[] }
  | { kind: 'UsageUpdate'; used: number; size: number; cost_usd: number | null }
  | { kind: 'SessionInfo'; session_id: string; model: string | null }
  | { kind: 'StreamEnd' }
  | { kind: 'ConnectionStatus'; status: string; message: string | null }

export interface ToolContent {
  type: 'text' | 'diff'
  text?: string
  path?: string
  old_text?: string | null
  new_text?: string
}

export interface ApprovalOption {
  id: string
  label: string
}
```

- [ ] **Step 4: Update src-tauri/src/lib.rs to include acp module**

```rust
mod acp;
mod commands;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/acp/ v2/src/types/
git commit -m "feat(v2): define ACP domain event types (Rust + TypeScript)"
```

---

## Task 4: JSON-RPC Protocol Parser

**Files:**
- Create: `src-tauri/src/acp/protocol.rs`

The protocol module reads NDJSON lines from `hermes acp` stdout and converts raw JSON-RPC session_update messages into typed `AcpEvent` values.

- [ ] **Step 1: Create src-tauri/src/acp/protocol.rs**

```rust
use serde_json::Value;
use crate::acp::events::{AcpEvent, ApprovalOption, ToolContent};

/// Parse a single NDJSON line from hermes acp stdout into an AcpEvent.
///
/// Returns None for messages we don't handle (notifications, errors, etc.)
pub fn parse_acp_line(line: &str) -> Option<AcpEvent> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }

    let json: Value = serde_json::from_str(line).ok()?;

    // JSON-RPC responses (to our session/prompt requests) signal end-of-stream.
    // Responses have "result" or "error" but no "method".
    if json.get("result").is_some() || json.get("error").is_some() {
        return Some(AcpEvent::StreamEnd);
    }

    // JSON-RPC notifications/requests have "method".
    // ACP session/update: { "method": "session/update", "params": { "sessionUpdate": "...", ... } }
    let method = json.get("method")?.as_str()?;

    match method {
        "session/update" => parse_session_update(json.get("params")?),
        "session/request_permission" => parse_permission_request(&json),
        _ => None,
    }
}

fn parse_session_update(params: &Value) -> Option<AcpEvent> {
    let update_type = params.get("sessionUpdate")?.as_str()?;

    match update_type {
        "agent_thought_chunk" => {
            let text = params
                .get("content")
                .and_then(|c| c.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string();
            Some(AcpEvent::AgentThinking { text })
        }

        "agent_message_chunk" => {
            let text = params
                .get("content")
                .and_then(|c| c.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string();
            Some(AcpEvent::AgentMessage { text })
        }

        "tool_call" => {
            let id = params.get("toolCallId")?.as_str()?.to_string();
            let title = params
                .get("title")
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string();
            let tool_kind = params
                .get("kind")
                .and_then(|k| k.as_str())
                .unwrap_or("execute")
                .to_string();

            // Check for diff content in tool call
            if let Some(content_arr) = params.get("content").and_then(|c| c.as_array()) {
                for item in content_arr {
                    if item.get("type").and_then(|t| t.as_str()) == Some("diff") {
                        let path = item.get("path").and_then(|p| p.as_str()).unwrap_or("").to_string();
                        let old_text = item.get("oldText").and_then(|t| t.as_str()).map(|s| s.to_string());
                        let new_text = item.get("newText").and_then(|t| t.as_str()).unwrap_or("").to_string();

                        return Some(AcpEvent::DiffProposed {
                            tool_call_id: id,
                            path,
                            old_text,
                            new_text,
                        });
                    }
                }
            }

            Some(AcpEvent::ToolCallStarted { id, title, tool_kind })
        }

        "tool_call_update" => {
            let id = params.get("toolCallId")?.as_str()?.to_string();
            let status = params
                .get("status")
                .and_then(|s| s.as_str())
                .unwrap_or("pending")
                .to_string();
            let content = parse_tool_content(params.get("content"));
            Some(AcpEvent::ToolCallUpdate { id, status, content })
        }

        "usage_update" => {
            let used = params.get("used").and_then(|v| v.as_u64()).unwrap_or(0);
            let size = params.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
            let cost_usd = params
                .get("cost")
                .and_then(|c| c.get("amount"))
                .and_then(|a| a.as_f64());
            Some(AcpEvent::UsageUpdate { used, size, cost_usd })
        }

        "session_info_update" => {
            let session_id = params.get("sessionId")?.as_str()?.to_string();
            let model = params.get("model").and_then(|m| m.as_str()).map(|s| s.to_string());
            Some(AcpEvent::SessionInfo { session_id, model })
        }

        _ => None,
    }
}

fn parse_permission_request(json: &Value) -> Option<AcpEvent> {
    let params = json.get("params")?;
    let id = json.get("id")?.to_string(); // JSON-RPC request id
    let tool_call = params.get("toolCall")?;
    let command = tool_call.get("input").and_then(|i| i.as_str()).unwrap_or("").to_string();
    let description = tool_call
        .get("title")
        .and_then(|t| t.as_str())
        .unwrap_or("permission requested")
        .to_string();

    let options = params
        .get("options")
        .and_then(|o| o.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|opt| {
                    Some(ApprovalOption {
                        id: opt.get("optionId")?.as_str()?.to_string(),
                        label: opt.get("name")?.as_str()?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Some(AcpEvent::ApprovalRequested {
        id,
        description,
        command,
        options,
    })
}

fn parse_tool_content(content: Option<&Value>) -> Vec<ToolContent> {
    let arr = match content.and_then(|c| c.as_array()) {
        Some(a) => a,
        None => return vec![],
    };

    arr.iter()
        .filter_map(|item| {
            let content_type = item.get("type").and_then(|t| t.as_str())?;
            match content_type {
                "diff" => Some(ToolContent::Diff {
                    path: item.get("path").and_then(|p| p.as_str()).unwrap_or("").to_string(),
                    old_text: item.get("oldText").and_then(|t| t.as_str()).map(|s| s.to_string()),
                    new_text: item.get("newText").and_then(|t| t.as_str()).unwrap_or("").to_string(),
                }),
                _ => {
                    let text = item
                        .get("content")
                        .and_then(|c| c.get("text"))
                        .and_then(|t| t.as_str())
                        .or_else(|| item.get("text").and_then(|t| t.as_str()))
                        .unwrap_or("")
                        .to_string();
                    Some(ToolContent::Text { text })
                }
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_agent_message_chunk() {
        let line = r#"{"method":"session/update","params":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"Hello world"}}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::AgentMessage { text } => assert_eq!(text, "Hello world"),
            other => panic!("expected AgentMessage, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_thinking_chunk() {
        let line = r#"{"method":"session/update","params":{"sessionUpdate":"agent_thought_chunk","content":{"type":"text","text":"Let me think..."}}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::AgentThinking { text } => assert_eq!(text, "Let me think..."),
            other => panic!("expected AgentThinking, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_tool_call() {
        let line = r#"{"method":"session/update","params":{"sessionUpdate":"tool_call","toolCallId":"tc-123","title":"read_file: main.rs","kind":"read","content":[{"type":"content","content":{"type":"text","text":"file content"}}]}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::ToolCallStarted { id, title, tool_kind } => {
                assert_eq!(id, "tc-123");
                assert_eq!(title, "read_file: main.rs");
                assert_eq!(tool_kind, "read");
            }
            other => panic!("expected ToolCallStarted, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_tool_call_with_diff() {
        let line = r#"{"method":"session/update","params":{"sessionUpdate":"tool_call","toolCallId":"tc-456","title":"write: main.py","kind":"edit","content":[{"type":"diff","path":"/src/main.py","newText":"def hello():\n    pass","oldText":"def old():\n    pass"}]}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::DiffProposed { tool_call_id, path, old_text, new_text } => {
                assert_eq!(tool_call_id, "tc-456");
                assert_eq!(path, "/src/main.py");
                assert_eq!(old_text.unwrap(), "def old():\n    pass");
                assert_eq!(new_text, "def hello():\n    pass");
            }
            other => panic!("expected DiffProposed, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_usage_update() {
        let line = r#"{"method":"session/update","params":{"sessionUpdate":"usage_update","used":1250,"size":8192,"cost":{"amount":0.0015,"currency":"USD"}}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::UsageUpdate { used, size, cost_usd } => {
                assert_eq!(used, 1250);
                assert_eq!(size, 8192);
                assert_eq!(cost_usd, Some(0.0015));
            }
            other => panic!("expected UsageUpdate, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_empty_line() {
        assert!(parse_acp_line("").is_none());
        assert!(parse_acp_line("  \n").is_none());
    }

    #[test]
    fn test_parse_invalid_json() {
        assert!(parse_acp_line("not json").is_none());
    }

    #[test]
    fn test_parse_unknown_method() {
        let line = r#"{"method":"unknown/method","params":{}}"#;
        assert!(parse_acp_line(line).is_none());
    }

    #[test]
    fn test_parse_jsonrpc_response_as_stream_end() {
        let line = r#"{"jsonrpc":"2.0","id":2,"result":{"sessionId":"abc-123"}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::StreamEnd => {} // correct
            other => panic!("expected StreamEnd, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_jsonrpc_error_as_stream_end() {
        let line = r#"{"jsonrpc":"2.0","id":2,"error":{"code":-32600,"message":"Invalid Request"}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::StreamEnd => {} // correct
            other => panic!("expected StreamEnd, got {:?}", other),
        }
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo test`
Expected: All 10 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/acp/protocol.rs
git commit -m "feat(v2): JSON-RPC protocol parser with tests"
```

---

## Task 5: ACP Client (Process Manager)

**Files:**
- Create: `src-tauri/src/acp/client.rs`
- Modify: `src-tauri/src/lib.rs`

The client spawns `hermes acp`, reads stdout line by line, parses each line into domain events, and emits them to the Tauri webview.

- [ ] **Step 1: Create src-tauri/src/acp/client.rs**

```rust
use std::io::BufRead;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use tauri::{AppHandle, Emitter};

use crate::acp::events::AcpEvent;
use crate::acp::protocol::parse_acp_line;

pub struct AcpClient {
    child: Arc<Mutex<Option<Child>>>,
    stdin_tx: Arc<Mutex<Option<std::process::ChildStdin>>>,
    next_id: AtomicU64,
}

impl AcpClient {
    /// Spawn `hermes acp` and start reading stdout in a background thread.
    /// Parsed ACP events are emitted to the webview via `acp:event`.
    pub fn spawn(app: &AppHandle) -> Result<Self, String> {
        let hermes_bin = std::env::var("HERMES_BIN").unwrap_or_else(|_| "hermes".to_string());

        let mut child = Command::new(&hermes_bin)
            .arg("acp")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .env("HERMES_YOLO_MODE", "1")
            .spawn()
            .map_err(|e| format!("failed to spawn hermes acp: {}", e))?;

        let stdin = child.stdin.take();
        let stdout = child.stdout.take()
            .ok_or("failed to capture hermes acp stdout")?;

        let app_handle = app.clone();
        let child_arc = Arc::new(Mutex::new(Some(child)));
        let child_arc_thread = child_arc.clone();

        // Background thread: read NDJSON lines from stdout, parse, emit
        thread::spawn(move || {
            let reader = std::io::BufReader::new(stdout);

            // Emit connected status
            let _ = app_handle.emit("acp:event", AcpEvent::ConnectionStatus {
                status: "connected".to_string(),
                message: None,
            });

            for line in reader.lines() {
                match line {
                    Ok(line) => {
                        if let Some(event) = parse_acp_line(&line) {
                            let _ = app_handle.emit("acp:event", &event);
                        }
                    }
                    Err(e) => {
                        eprintln!("stdout read error: {}", e);
                        break;
                    }
                }
            }

            // Process exited or stdout closed
            let _ = app_handle.emit("acp:event", AcpEvent::ConnectionStatus {
                status: "disconnected".to_string(),
                message: Some("hermes acp process exited".to_string()),
            });

            // Clean up
            if let Ok(mut guard) = child_arc_thread.lock() {
                if let Some(mut child) = guard.take() {
                    let _ = child.wait();
                }
            }
        });

        Ok(Self {
            child: child_arc,
            stdin_tx: Arc::new(Mutex::new(stdin)),
            next_id: AtomicU64::new(1),
        })
    }

    /// Write a JSON-RPC message to hermes acp stdin.
    pub fn send(&self, message: &str) -> Result<(), String> {
        use std::io::Write;

        let mut guard = self.stdin_tx.lock().map_err(|e| e.to_string())?;
        let stdin = guard.as_mut().ok_or("stdin not available")?;

        writeln!(stdin, "{}", message).map_err(|e| format!("stdin write error: {}", e))?;
        stdin.flush().map_err(|e| format!("stdin flush error: {}", e))?;

        Ok(())
    }

    /// Get the next unique JSON-RPC request ID.
    fn next_request_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }

    /// Send a session/new JSON-RPC request. Returns the request ID
    /// so the caller can correlate the response (which contains the session ID).
    pub fn new_session(&self) -> Result<u64, String> {
        let id = self.next_request_id();
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "session/new",
            "params": {}
        });
        self.send(&msg.to_string())?;
        Ok(id)
    }

    /// Send a session/prompt JSON-RPC request.
    pub fn send_prompt(&self, session_id: &str, text: &str) -> Result<u64, String> {
        let id = self.next_request_id();
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "session/prompt",
            "params": {
                "sessionId": session_id,
                "content": [
                    { "type": "text", "text": text }
                ]
            }
        });
        self.send(&msg.to_string())?;
        Ok(id)
    }

    /// Send a session/cancel JSON-RPC notification.
    pub fn cancel(&self, session_id: &str) -> Result<(), String> {
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "session/cancel",
            "params": { "sessionId": session_id }
        });
        self.send(&msg.to_string())
    }

    /// Gracefully shut down the hermes acp process.
    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                // Close stdin to signal EOF
                drop(self.stdin_tx.lock().ok().and_then(|mut g| g.take()));

                // Wait briefly, then kill if needed
                match child.try_wait() {
                    Ok(Some(_)) => {} // already exited
                    _ => {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        }
    }
}

impl Drop for AcpClient {
    fn drop(&mut self) {
        self.shutdown();
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/acp/client.rs
git commit -m "feat(v2): ACP client — spawn hermes acp, read stdout, emit events"
```

---

## Task 6: Tauri IPC Commands

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

Wire the ACP client into Tauri commands so the frontend can create sessions and send prompts.

- [ ] **Step 1: Rewrite src-tauri/src/commands.rs**

```rust
use std::sync::Mutex;
use tauri::State;

use crate::acp::client::AcpClient;

/// Managed state: the ACP client instance.
pub struct AcpState(pub Mutex<Option<AcpClient>>);

#[tauri::command]
pub fn acp_new_session(state: State<'_, AcpState>) -> Result<String, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let client = guard.as_ref().ok_or("ACP client not initialized")?;
    client.new_session()?;
    Ok("session/new sent".to_string())
}

#[tauri::command]
pub fn acp_send_prompt(
    state: State<'_, AcpState>,
    session_id: String,
    text: String,
) -> Result<String, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let client = guard.as_ref().ok_or("ACP client not initialized")?;
    client.send_prompt(&session_id, &text)?;
    Ok("prompt sent".to_string())
}

#[tauri::command]
pub fn acp_cancel(
    state: State<'_, AcpState>,
    session_id: String,
) -> Result<String, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let client = guard.as_ref().ok_or("ACP client not initialized")?;
    client.cancel(&session_id)?;
    Ok("cancel sent".to_string())
}
```

- [ ] **Step 2: Update src-tauri/src/lib.rs** to register commands and spawn ACP on startup

```rust
mod acp;
mod commands;

use commands::AcpState;
use std::sync::Mutex;

pub fn run() {
    tauri::Builder::default()
        .manage(AcpState(Mutex::new(None)))
        .setup(|app| {
            // Spawn hermes acp on app start
            match acp::client::AcpClient::spawn(&app.handle()) {
                Ok(client) => {
                    let state = app.state::<AcpState>();
                    *state.0.lock().unwrap() = Some(client);
                    println!("hermes acp spawned successfully");
                }
                Err(e) => {
                    eprintln!("failed to spawn hermes acp: {}", e);
                    // App still launches — frontend will show disconnected state
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::acp_new_session,
            commands::acp_send_prompt,
            commands::acp_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(v2): Tauri IPC commands for ACP session management"
```

---

## Task 7: Frontend Zustand Store + Event Listener

**Files:**
- Create: `v2/src/stores/chat.ts`
- Create: `v2/src/hooks/useAcpEvents.ts`

- [ ] **Step 1: Create v2/src/stores/chat.ts**

```typescript
import { create } from 'zustand'
import type { AcpEvent } from '../types/acp'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'thinking' | 'tool' | 'system'
  content: string
  timestamp: number
  toolId?: string
  toolTitle?: string
  toolKind?: string
  toolStatus?: string
}

export interface ChatStore {
  messages: ChatMessage[]
  sessionId: string | null
  isStreaming: boolean
  connectionStatus: string
  pendingPrompt: string | null  // queued for after session/new resolves

  addUserMessage: (text: string) => void
  handleAcpEvent: (event: AcpEvent) => void
  setSessionId: (id: string) => void
  setPendingPrompt: (text: string | null) => void
  reset: () => void
}

let _nextId = 0
const genId = () => `msg-${++_nextId}-${Date.now()}`

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  sessionId: null,
  isStreaming: false,
  connectionStatus: 'connecting',
  pendingPrompt: null,

  addUserMessage: (text: string) => {
    set((s) => ({
      messages: [...s.messages, {
        id: genId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      }],
      isStreaming: true,
    }))
  },

  handleAcpEvent: (event: AcpEvent) => {
    switch (event.kind) {
      case 'AgentMessage': {
        set((s) => {
          const msgs = [...s.messages]
          const last = msgs[msgs.length - 1]
          // Append to existing assistant message if streaming
          if (last && last.role === 'assistant') {
            msgs[msgs.length - 1] = { ...last, content: last.content + event.text }
          } else {
            msgs.push({ id: genId(), role: 'assistant', content: event.text, timestamp: Date.now() })
          }
          return { messages: msgs }
        })
        break
      }

      case 'AgentThinking': {
        set((s) => {
          const msgs = [...s.messages]
          const last = msgs[msgs.length - 1]
          if (last && last.role === 'thinking') {
            msgs[msgs.length - 1] = { ...last, content: last.content + event.text }
          } else {
            msgs.push({ id: genId(), role: 'thinking', content: event.text, timestamp: Date.now() })
          }
          return { messages: msgs }
        })
        break
      }

      case 'ToolCallStarted': {
        set((s) => ({
          messages: [...s.messages, {
            id: genId(),
            role: 'tool',
            content: '',
            timestamp: Date.now(),
            toolId: event.id,
            toolTitle: event.title,
            toolKind: event.tool_kind,
            toolStatus: 'running',
          }],
        }))
        break
      }

      case 'ToolCallUpdate': {
        set((s) => {
          const msgs = s.messages.map((m) =>
            m.toolId === event.id
              ? { ...m, toolStatus: event.status }
              : m
          )
          return { messages: msgs }
        })
        break
      }

      case 'SessionInfo': {
        const pending = get().pendingPrompt
        set({ sessionId: event.session_id, pendingPrompt: null })
        // If there's a queued prompt from before session was created, send it now
        if (pending) {
          import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke('acp_send_prompt', { sessionId: event.session_id, text: pending })
              .catch((e) => console.error('Failed to send queued prompt:', e))
          })
        }
        break
      }

      case 'StreamEnd': {
        set({ isStreaming: false })
        break
      }

      case 'ConnectionStatus': {
        // On fresh connection, reset session ID so next message triggers session/new
        if (event.status === 'connected') {
          set({ connectionStatus: event.status, sessionId: null, isStreaming: false })
        } else {
          set({ connectionStatus: event.status, isStreaming: false })
        }
        break
      }

      default:
        break
    }
  },

  setSessionId: (id: string) => set({ sessionId: id }),
  setPendingPrompt: (text: string | null) => set({ pendingPrompt: text }),

  reset: () => {
    _nextId = 0
    set({ messages: [], sessionId: null, isStreaming: false, pendingPrompt: null })
  },
}))
```

- [ ] **Step 2: Create v2/src/hooks/useAcpEvents.ts**

```typescript
import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { AcpEvent } from '../types/acp'
import { useChatStore } from '../stores/chat'

export function useAcpEvents() {
  useEffect(() => {
    const unlisten = listen<AcpEvent>('acp:event', (event) => {
      useChatStore.getState().handleAcpEvent(event.payload)
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])
}
```

- [ ] **Step 3: Commit**

```bash
git add v2/src/stores/ v2/src/hooks/
git commit -m "feat(v2): zustand chat store + Tauri event listener hook"
```

---

## Task 8: Wire Frontend to Backend

**Files:**
- Modify: `v2/src/App.tsx`
- Create: `v2/src/components/ChatView.tsx`
- Create: `v2/src/components/MessageBubble.tsx`
- Create: `v2/src/components/MessageInput.tsx`
- Create: `v2/src/components/StatusBar.tsx`

- [ ] **Step 1: Create v2/src/components/StatusBar.tsx**

```tsx
import { useChatStore } from '../stores/chat'

export default function StatusBar() {
  const status = useChatStore((s) => s.connectionStatus)
  const sessionId = useChatStore((s) => s.sessionId)

  const color = status === 'connected' ? '#a6e3a1' : status === 'connecting' ? '#f9e2af' : '#f38ba8'

  return (
    <div style={{
      padding: '4px 16px',
      borderBottom: '1px solid #45475a',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 10,
      color: '#6c7086',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: color,
      }} />
      <span>{status}</span>
      {sessionId && <span style={{ marginLeft: 'auto' }}>{sessionId.slice(0, 8)}...</span>}
    </div>
  )
}
```

- [ ] **Step 2: Create v2/src/components/MessageBubble.tsx**

```tsx
import type { ChatMessage } from '../stores/chat'

interface Props {
  message: ChatMessage
}

export default function MessageBubble({ message }: Props) {
  if (message.role === 'thinking') {
    return (
      <div style={{ marginBottom: 8, padding: '8px 12px', borderLeft: '2px solid #45475a' }}>
        <div style={{ fontSize: 10, color: '#6c7086', fontStyle: 'italic', marginBottom: 4 }}>
          Thinking...
        </div>
        <div style={{ fontSize: 11, color: '#6c7086', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === 'tool') {
    return (
      <div style={{
        marginBottom: 8,
        padding: '6px 12px',
        background: '#181825',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 10,
      }}>
        <span style={{ color: '#a6e3a1' }}>
          {message.toolStatus === 'running' ? '▶' : '✓'}
        </span>
        <span style={{ color: '#a6e3a1', fontWeight: 600 }}>{message.toolTitle}</span>
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 10,
        color: isUser ? '#b4befe' : '#a6e3a1',
        fontWeight: 700,
        marginBottom: 4,
      }}>
        {isUser ? 'YOU' : 'AURORA'}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {message.content}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create v2/src/components/ChatView.tsx**

```tsx
import { useEffect, useRef } from 'react'
import { useChatStore } from '../stores/chat'
import MessageBubble from './MessageBubble'

export default function ChatView() {
  const messages = useChatStore((s) => s.messages)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      {messages.length === 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#6c7086',
          fontSize: 13,
        }}>
          Start a conversation with Aurora
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 4: Create v2/src/components/MessageInput.tsx**

```tsx
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../stores/chat'

export default function MessageInput() {
  const [input, setInput] = useState('')
  const sessionId = useChatStore((s) => s.sessionId)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const addUserMessage = useChatStore((s) => s.addUserMessage)

  const handleSend = async () => {
    const text = input.trim()
    if (!text) return

    setInput('')
    addUserMessage(text)

    try {
      if (!sessionId) {
        // First message — create session, queue prompt for when SessionInfo arrives
        useChatStore.getState().setPendingPrompt(text)
        await invoke('acp_new_session')
      } else {
        await invoke('acp_send_prompt', { sessionId, text })
      }
    } catch (e) {
      console.error('Failed to send prompt:', e)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{
      borderTop: '1px solid #45475a',
      padding: '12px 16px',
      display: 'flex',
      gap: 8,
    }}>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message Aurora..."
        disabled={isStreaming}
        style={{
          flex: 1,
          background: '#313244',
          border: '1px solid #45475a',
          borderRadius: 8,
          padding: '8px 12px',
          color: '#cdd6f4',
          fontSize: 13,
          fontFamily: 'inherit',
          outline: 'none',
          opacity: isStreaming ? 0.5 : 1,
        }}
      />
      <button
        onClick={handleSend}
        disabled={isStreaming || !input.trim()}
        style={{
          background: isStreaming ? '#45475a' : '#b4befe',
          color: '#1e1e2e',
          border: 'none',
          borderRadius: 8,
          padding: '8px 16px',
          fontWeight: 700,
          fontSize: 12,
          cursor: isStreaming ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {isStreaming ? '...' : 'Send'}
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Rewrite v2/src/App.tsx**

```tsx
import { useAcpEvents } from './hooks/useAcpEvents'
import StatusBar from './components/StatusBar'
import ChatView from './components/ChatView'
import MessageInput from './components/MessageInput'

export default function App() {
  useAcpEvents()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <StatusBar />
      <ChatView />
      <MessageInput />
    </div>
  )
}
```

- [ ] **Step 6: Verify Tauri dev launches and shows chat UI**

Run: `cargo tauri dev`
Expected: Window opens with status bar (connecting/connected), empty chat area with "Start a conversation with Aurora" placeholder, and message input at bottom.

- [ ] **Step 7: Test real conversation**

Type a message and press Enter. Expected:
1. User message appears in chat
2. Status shows connected (green dot)
3. Thinking text appears (if model thinks)
4. Agent response streams in word-by-word
5. Tool calls show as compact indicators
6. Input re-enables when streaming completes

- [ ] **Step 8: Commit**

```bash
git add v2/src/
git commit -m "feat(v2): wire frontend to ACP backend — working chat"
```

---

## Task 9: Error Handling & Reconnect

**Files:**
- Modify: `v2/src/components/StatusBar.tsx`
- Modify: `v2/src/App.tsx`

- [ ] **Step 1: Add reconnect button to StatusBar**

Update `v2/src/components/StatusBar.tsx` — when status is "disconnected", show a "Reconnect" button that calls a new `acp_reconnect` Tauri command.

```tsx
import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../stores/chat'

export default function StatusBar() {
  const status = useChatStore((s) => s.connectionStatus)
  const sessionId = useChatStore((s) => s.sessionId)

  const color = status === 'connected' ? '#a6e3a1' : status === 'connecting' ? '#f9e2af' : '#f38ba8'

  const handleReconnect = async () => {
    try {
      useChatStore.setState({ connectionStatus: 'connecting' })
      await invoke('acp_reconnect')
    } catch (e) {
      console.error('Reconnect failed:', e)
    }
  }

  return (
    <div style={{
      padding: '4px 16px',
      borderBottom: '1px solid #45475a',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 10,
      color: '#6c7086',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span>{status}</span>
      {status === 'disconnected' && (
        <button
          onClick={handleReconnect}
          style={{
            background: 'transparent',
            border: '1px solid #45475a',
            borderRadius: 4,
            color: '#bac2de',
            fontSize: 10,
            padding: '2px 8px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Reconnect
        </button>
      )}
      <span style={{ marginLeft: 'auto' }}>
        {sessionId ? `${sessionId.slice(0, 8)}...` : ''}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Add acp_reconnect command to Rust**

Add to `src-tauri/src/commands.rs`:

```rust
#[tauri::command]
pub fn acp_reconnect(app: tauri::AppHandle, state: State<'_, AcpState>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    // Shut down existing client if any
    if let Some(client) = guard.take() {
        client.shutdown();
    }

    // Spawn fresh
    let client = crate::acp::client::AcpClient::spawn(&app)?;
    *guard = Some(client);

    Ok("reconnected".to_string())
}
```

Register it in `src-tauri/src/lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    commands::acp_new_session,
    commands::acp_send_prompt,
    commands::acp_cancel,
    commands::acp_reconnect,
])
```

- [ ] **Step 3: Verify reconnect works**

Run: `cargo tauri dev`
Kill the `hermes acp` process externally. Expected: status shows "disconnected" with Reconnect button. Click Reconnect. Expected: status goes to "connecting" then "connected".

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs v2/src/components/StatusBar.tsx
git commit -m "feat(v2): error handling and reconnect flow"
```

---

## Phase 1 Completion Criteria

- [ ] Tauri window opens with chat UI
- [ ] Status bar shows connection state (connected/disconnected)
- [ ] User can type a message and send it
- [ ] Hermes responds with streaming text
- [ ] Thinking blocks appear (collapsible in Phase 2)
- [ ] Tool call indicators appear (detailed rendering in Phase 2)
- [ ] Reconnect works if hermes acp dies
- [ ] `cargo test` passes (JSON-RPC parser tests)
- [ ] All code committed on a feature branch
