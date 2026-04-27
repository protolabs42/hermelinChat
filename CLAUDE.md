# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`hermelinChat` is a UI for [Hermes Agent](https://github.com/NousResearch/hermes-agent). The repo contains **two parallel front-ends** that share Hermes integration concerns but otherwise live in different worlds:

1. **`hermelin/` (Python) + `frontend/` (React web)** — original browser product. A FastAPI server spawns `hermes` in a real PTY, pipes it to xterm.js over WebSocket, and reads `~/.hermes/state.db` directly for the session sidebar. Single-port deployment (the FastAPI app serves the built SPA, the WS PTY proxy, the API, and the runner gateway).
2. **`v2/` (React) + `src-tauri/` (Rust)** — newer Tauri desktop app, branded "Aurora Chat". Talks to `hermes` via **ACP** (Agent Client Protocol, JSON-RPC over stdio) instead of a PTY. Feature surface is broader: ACP sessions, MCP proxy/pool, A2UI surfaces, lane2 workspace lifecycle, co-edit, hermes config editing.

When asked to change "the UI", clarify which one. They do not share code; the Tauri app is the active feature lane (see `feat/v2-phase1` branch).

## Core integrations and side-effects

- **`~/.hermes/`** is treated as a live database and config root for both stacks. Code reads `state.db` (sessions, FTS5 search), writes `hermelin_meta.db` (titles, whispers), and writes/reads `config.yaml`, `skins/`, `artifacts/runners/projects/<tab_id>/runner.json`. Keep tests hermetic — `e2e-tests/fixtures/hermetic-home/` and process-global env vars like `HERMELIN_A2UI_DIR` / `HERMELIN_ARTIFACT_DIR` need serialization (there is a known race; tests that touch these set a Mutex guard).
- **Hermes patching.** `scripts/install_hermes_artifact_patch.py` mutates the user's installed Hermes (`model_tools.py`, `toolsets.py`) to register the `artifacts` and `strudel` toolsets. The artifact panel will be empty without it. `update.sh` runs this unless `--skip-hermes-patch`.
- **Runner gateway** (Python stack only). Iframe artifacts that spawn local HTTP servers are proxied at `/r/{tab_id}/_t/{token}/...`. Tokens are short-lived, IP-bound by default, cookies are stripped both ways. `runners.py` discovers upstream from `runner.json` or falls back to parsing port from iframe src. Don't break either path.
- **ACP** (Tauri stack only). `src-tauri/src/acp/{client,protocol,events}.rs` spawns `hermes acp` and speaks JSON-RPC 2.0. Lifecycle is "unified" — readiness, session, and event hooks all live in this layer; recent commits (`335e287`, `80618d1`, `8cb870b`) hardened it after lifecycle bugs. Treat readiness ordering as load-bearing.

## Development commands

### Python web stack (`hermelin/` + `frontend/`)

```bash
# First-time setup (creates .hermelin.env, .venv, builds frontend, patches Hermes)
./scripts/install.sh

# Update an existing checkout (rebuild + re-patch)
./scripts/update.sh                  # flags: --skip-frontend --skip-python --skip-hermes-patch --restart

# Run prod-ish (serves built SPA from hermelin/static/)
set -a && source .hermelin.env && set +a
./.venv/bin/hermelin                 # or: hermelin --host 127.0.0.1 --port 3000

# Dev mode — backend + frontend separately, Vite proxies /api and /ws
./.venv/bin/hermelin --reload --port 3000
cd frontend && npm run dev           # http://localhost:5173

# Frontend-only
cd frontend && npm install && npm run build   # writes into hermelin/static/
cd frontend && npm run lint
cd frontend && npm run typecheck

# Python tests (pytest, configured via pyproject)
.venv/bin/pytest tests/
.venv/bin/pytest tests/test_security.py::test_specific_case
```

The build step **must** produce `hermelin/static/index.html` or the Python server returns 404 on `/`. `install.sh` checks this.

### Tauri desktop stack (`v2/` + `src-tauri/`)

```bash
# Frontend (Aurora Chat)
cd v2 && npm install
npm run dev                          # vite on :5173, used by tauri dev
npm run build                        # tsc + vite build
npm test                             # runs every *:test script (a2ui, app, utils, chat, artifacts, panes, surfaces, sidebar, coedit, lane2)

# Run a single test bundle (each is a tsx-executed file, not a test runner)
npm run lane2:test
npm run a2ui:test
npx tsx src/stores/__tests__/surfaces.test.ts   # or any individual file

# A2UI example validation
npm run a2ui:validate

# Tauri dev (cargo tauri dev from repo root, with backtraces)
cd v2 && npm run debug:tauri          # or debug:tauri:full for RUST_LOG=info

# Rust tests (workspace = src-tauri only)
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml <test_name>

# Desktop E2E (WebDriver via tauri-driver + WebKitWebDriver)
cd e2e-tests && npm install
npm run doctor                       # checks tauri-driver + WebKitWebDriver are installed
npm test                             # builds debug Tauri bundle, runs mocha smoke
# from v2/: npm run e2e:test          # same thing via scripts/run-tauri-e2e.sh
```

E2E prerequisites (see `docs/tauri-debugging-and-e2e.md`):

```bash
cargo install tauri-driver --locked
sudo apt-get install webkit2gtk-driver
```

CI mirror in `.github/workflows/tauri-e2e.yml`: Rust tests, `v2` tests, then xvfb-driven smoke.

## Architecture notes that span files

### Python server (`hermelin/server.py`)

`create_app(cfg)` is the FastAPI factory. It owns: PTY WS bridge (`pty_handler.py`), session API backed by `state_reader.py` (queries `state.db` + FTS5), titles/whispers (`meta_db.py`), artifact bridge (`artifacts.py` — file-based command/response IPC under `$HERMES_HOME/artifacts/`), runner gateway (`runners.py`), config editor (`config_editor.py` — careful YAML/dotenv text patching that preserves quoting and inline scalars), auth (`auth.py` — argon2id login + signed cookie + per-tab runner tokens), allowlist (`security.py`). HTTPS is built-in via `--ssl-certfile`/`--ssl-keyfile`; the installer auto-generates a self-signed cert in `$HERMES_HOME/hermelin_tls/`.

### Tauri backend (`src-tauri/src/lib.rs`)

`run()` registers state singletons (`AcpState`, `AcpHealthState`, `ConfigLock`, `McpPoolState`, `ProjectLock`, `Lane2StoreLock`), spawns the ACP client at startup, starts file watchers for `artifacts/` and `a2ui/`, then registers a large `invoke_handler!` macro with all `commands::*`, `coedit::*`, `lane2::*` Tauri commands. Add new front-end-callable commands by exporting from a module and listing them inside `invoke_handler!` — the macro is the source of truth.

### Tauri frontend (`v2/src/`)

- **`App.tsx`** wires hooks (`useAcpEvents`, `useKeyboardShortcuts`), reads `useChatStore` / `useSidebarStore` / `useWorkspaceStore` / `usePaneStore`, and renders the three-panel shell (sidebar | chat | right-pane stack) with `ConnectionInterstitial` covering the gap before ACP is ready.
- **`stores/`** — Zustand stores; `chat`, `workspaces`, `panes`, `sidebar`, `surfaces`, `artifacts`, `coedit`, `projects`, `settings`, `font-size`, `hermesMcpServers`. Each has a `__tests__/<name>.test.ts` run via `tsx` (no Jest/Vitest).
- **`app/`** — pure logic modules (no React) for connection-interstitial model, right-pane state, workspace lifecycle/strip/restore, keyboard shortcuts, top-action intents, project work context, session start.
- **`a2ui/`** — A2UI (agent-to-UI) surface system. `mcp-app/` is an MCP "ext-apps" server that exposes UI surfaces; `renderer/` renders them; `examples/` + `validate.ts` + `validate-examples.ts` keep the catalog honest. `dev-mode.ts` switches the entry point.
- **`lane2/`** — workspace ontology (resident stance, focus targets, continuity) for Aurora's "native lane2" system. Schema in `schema.ts`, persistence + activation + summary in adjacent files; deeply tested.
- **`components/`** — UI. `RightPaneStack` is the configurable stack of artifact / plan / a2ui panes; `WorkspaceTabs`, `ProjectSwitcher`, `ConnectionInterstitial`, `SettingsPanel`, theme'd `backgrounds/` per `DESIGN.md` (Hermelin/Matrix/Nous/Samaritan/Catppuccin variants).

### Design system

`DESIGN.md` is the source of truth for the Tauri UI: monospace-only (FiraCode Nerd Font), 8 themes via CSS custom properties, compact 4px-base spacing, retro-futuristic ambient backgrounds. Theme switching mutates CSS vars; persisted to localStorage.

### Issue tracking — `bd` (beads)

`AGENTS.md` mandates `bd` for **all** task tracking on this repo (no markdown TODOs). Use `bd ready --json` to find work, `bd update <id> --status in_progress`, `bd close <id>`. Auto-syncs to `.beads/issues.jsonl` on git push. The "Landing the Plane" section of `AGENTS.md` is non-negotiable: work is not complete until `git push` succeeds.

## OpenViking — semantic search reflex

This repo **is indexed in OpenViking** at `viking://resources/protolabs42/hermelinchat/`. Before grepping or opening 3+ files to triangulate "where does X happen", reach for OV first:

```bash
ov find "<question>" -n 5                                 # semantic, ranks across the whole corpus
ov find "<question>" --uri viking://resources/protolabs42/hermelinchat   # scope to this repo
ov abstract viking://resources/protolabs42/hermelinchat/<path>            # L0 directory summary
ov overview viking://resources/protolabs42/hermelinchat/<path>            # L1 detail
ov grep "<exact-string>" --uri viking://resources/protolabs42/hermelinchat
```

OV understands "the ACP readiness handshake" or "where workspace lifecycle is wired" semantically; grep doesn't. One `ov find` ≈ 2k tokens; the equivalent grep+Read sweep is 20–50k.

**Re-index after large changes.** OV holds a snapshot of the source at ingest time. After significant work (new modules, renamed files, big refactors), re-stage and re-ingest:

```bash
rm -rf /tmp/hermelinchat-src && mkdir /tmp/hermelinchat-src
git ls-files -z | tar --null -T - -c | tar -xC /tmp/hermelinchat-src
ov add-resource /tmp/hermelinchat-src \
  --to "viking://resources/protolabs42/hermelinchat" \
  --reason "re-index after <what changed>" --wait --timeout 1200
```

Do NOT pass the repo root directly — `--ignore-dirs` did not reliably exclude `target/` and produced a 5.7G upload. The `git ls-files` staging step gives a clean ~5MB source tree.

## Things that have bitten us recently

- **ACP lifecycle / readiness ordering** — multiple fixes on this branch (`a8c7133`, `8cb870b`, `80618d1`, `335e287`). Don't change spawn order, event hook split, or workspace activation sequencing without tracing through `acp/client.rs` and the `app/workspace-lifecycle.ts` model.
- **Hermetic E2E** — desktop E2E no longer copies `~/.hermes` secrets; it uses `e2e-tests/fixtures/fake-hermes-acp.mjs` injected via `HERMES_ACP_CMD` and a `hermetic-home/` fixture. Don't reintroduce assumptions about a real `~/.hermes` in tests.
- **Artifact dir env vars** — `HERMELIN_A2UI_DIR` and `HERMELIN_ARTIFACT_DIR` are process-global; cargo tests that set them race under parallel runs. Use the existing test-only Mutex guard.
