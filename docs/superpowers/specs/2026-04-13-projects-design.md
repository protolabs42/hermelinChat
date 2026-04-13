# Aurora Chat Projects

**Beads issue:** hermelinChat-rc1 (P1)
**Date:** 2026-04-13
**Status:** Design approved, pending implementation
**Contributors:** Sophie (design lead), Ada (UX vision), Ruby (scope critique)

## Overview

Replace Aurora Chat's raw CWD picker with first-class Projects. A project is a named folder with git awareness. Sessions belong to projects. The sidebar, status bar, and session model all reshape around project context.

### Goals

- Projects as first-class objects persisted across launches
- Visible project switcher (dropdown, three triggers)
- Sessions filtered and time-grouped by active project
- Git branch + dirty indicator in status bar and sidebar
- Scratchpad project for ad hoc chats
- Git root as canonical project boundary

### Non-goals (MVP)

- `.aurora/config.json` project-scoped config (follow-up phase)
- Command palette (ship visible switcher first)
- Sidebar tabs (Sessions / MCP / Files)
- Project-scoped MCP server management
- File tree / context surfaces
- Branch switching from UI

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Project switcher | Universal dropdown, 3 triggers | Sidebar header click, status bar name click, Ctrl+Shift+P. Works with sidebar open or closed. |
| Sidebar header | Minimal 32px, one line | Name + chevron left, branch + dirty right. Maximum session list space. |
| Session grouping | Time-grouped | Today / Yesterday / This Week / Older. Filtered to active project. |
| Project detection | Git root canonical | `.git` directory required. Other markers (package.json) only suggest candidates. |
| Session ownership | Always belongs to a project | Except Scratchpad. CWD drift within session does not reassign project. |
| Config overrides | Deferred | `.aurora/config.json` comes after project navigation model is proven. |
| Keyboard shortcut | Ctrl+Shift+P | Not Cmd+P (file quick-open muscle memory). |
| Status bar | Context breadcrumb | `Project Name / branch` + dirty dot. Replaces raw CWD path + session ID. |

## Architecture

### Data Model

```typescript
interface Project {
  id: string               // stable UUID
  name: string             // display name (default: folder basename)
  path: string             // absolute path to project root
  createdAt: number        // timestamp
  lastOpenedAt: number     // timestamp, for recents sorting
  pinned: boolean          // pinned projects appear first in switcher
}

// Special built-in project
const SCRATCHPAD_PROJECT: Project = {
  id: 'scratchpad',
  name: 'Scratchpad',
  path: '',              // no fixed path
  pinned: false,
  // ...
}
```

### Git Info (fetched on demand from Rust)

```typescript
interface GitInfo {
  branch: string | null    // current branch name
  dirty: boolean           // any uncommitted changes
  remote: string | null    // origin URL (for display, not functional)
}
```

### Session-Project Relationship

The session-project mapping lives in Aurora's own `projects.json` — NOT in hermes's `state.db` (which Aurora opens read-only). A `sessionProjects` map in the JSON file tracks which project each session belongs to:

```typescript
// Inside projects.json
{
  projects: Project[],
  sessionProjects: Record<string, string>,  // sessionId -> projectId
  activeProjectId: string | null            // persisted for desktop-icon launches
}
```

When listing sessions for a project, Aurora reads all sessions from hermes's DB (read-only, as today), then filters client-side against the `sessionProjects` map. Sessions not in the map default to Scratchpad.

The session's `cwd` may differ from the project's `path` (CWD drift), but the owning project does not change. Project assignment happens at session creation time.

## Rust Backend

### New module: src-tauri/src/projects.rs

**Project storage:** Projects are stored in Aurora's own data directory, resolved via Tauri's `app_data_dir()` (cross-platform: `~/.local/share/aurora-chat/` on Linux, `~/Library/Application Support/aurora-chat/` on macOS, `%LOCALAPPDATA%/aurora-chat/` on Windows). The file is `projects.json` — contains projects, session-project map, and last active project ID.

**Rust data model:**

```rust
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,              // UUID v4 (generated via uuid crate)
    pub name: String,            // display name (default: folder basename)
    pub path: String,            // absolute path to project root
    pub created_at: u64,         // epoch milliseconds (matches JS Date.now())
    pub last_opened_at: u64,     // epoch milliseconds, updated on setActiveProject
    pub pinned: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct GitInfo {
    pub branch: Option<String>,
    pub dirty: bool,
    pub remote: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ProjectStore {
    pub projects: Vec<Project>,
    pub session_projects: HashMap<String, String>,  // session_id -> project_id
    pub active_project_id: Option<String>,          // persisted for desktop launches
}

// Scratchpad is synthesized in code, not stored in JSON.
// ID is always "scratchpad", path is empty.
```

**Dependencies:** Add `uuid = { version = "1", features = ["v4"] }` to Cargo.toml.

**Commands:**

```rust
#[tauri::command]
fn list_projects() -> Vec<Project>

#[tauri::command]
fn add_project(path: String, name: Option<String>) -> Result<Project, String>
// Validates: path exists, has .git directory
// Auto-names from folder basename if name not provided
// Returns error if project with same path already exists

#[tauri::command]
fn remove_project(id: String) -> Result<(), String>
// Does NOT delete the folder, just removes from Aurora's project list

#[tauri::command]
fn update_project(id: String, name: Option<String>, pinned: Option<bool>) -> Result<Project, String>
// Rename or pin/unpin

#[tauri::command]
fn get_git_info(path: String) -> Result<GitInfo, String>
// Runs: git rev-parse --abbrev-ref HEAD (branch)
// Runs: git status --porcelain (dirty check)
// Returns null branch if not a git repo

#[tauri::command]
fn detect_project(path: String) -> Result<Option<DetectedProject>, String>
// Walks up from path to find .git root (stops at filesystem root — never traverses /)
// Validates path against SHELL_META chars (same pattern as hermes_config.rs)
// Returns: git root path, suggested name, branch, dirty
// Used for first-time auto-detection when opening a folder

#[tauri::command]
fn assign_session_to_project(session_id: String, project_id: String) -> Result<(), String>
// Adds/updates entry in sessionProjects map
// Called when a new session is created in a project

#[tauri::command]
fn get_sessions_for_project(project_id: String, limit: Option<usize>) -> Result<Vec<SessionSummary>, String>
// Reads sessions from hermes state.db (read-only), filters client-side against sessionProjects map
// Returns sessions belonging to the project, ordered by created_at DESC
```

**Atomic writes:** Same pattern as hermes_config — temp file + rename + chmod 0600.

**File locking:** `tokio::sync::Mutex` for serialized access to projects.json.

### sessions.rs — NO CHANGES

Hermes's `state.db` is opened read-only. Session-project mapping lives in `projects.json` (Aurora's own storage). The `get_sessions_for_project` command in `projects.rs` reads sessions from hermes via the existing `list_sessions()` function and filters client-side.

## Frontend

### New store: v2/src/stores/projects.ts

```typescript
interface ProjectStore {
  projects: Record<string, Project>
  activeProjectId: string | null
  gitInfo: Record<string, GitInfo>  // keyed by project id

  // Actions
  refresh(): Promise<void>
  setActiveProject(id: string): Promise<void>
  addProject(path: string, name?: string): Promise<Project>
  removeProject(id: string): Promise<void>
  updateProject(id: string, updates: { name?: string; pinned?: boolean }): Promise<void>
  refreshGitInfo(projectId: string): Promise<void>
}
```

`setActiveProject` triggers:
1. Update store state + persist `activeProjectId` to Rust (saved in projects.json for desktop-icon launches)
2. Update `lastOpenedAt` on the project
3. Refresh git info for the project
4. Trigger session list refresh (filtered to new project)
5. Reset chat + start a new hermes session with the project's CWD
6. If active project is Scratchpad, use launch CWD (or `$HOME` if no CWD available)

**Git info refresh strategy:** Refresh on project switch, on window re-focus (`document.addEventListener('visibilitychange')`), and on every `StreamEnd` ACP event (agent just finished a turn that may have modified files). No interval polling.

### New component: v2/src/components/ProjectSwitcher.tsx

A dropdown overlay component. Renders:
- Search/filter input at top
- Pinned projects section (if any)
- Recent projects (sorted by `lastOpenedAt`)
- Scratchpad entry (always last, italic)
- "+ Open folder..." action at bottom (opens OS folder picker, auto-detects project)
- Active project highlighted

**Trigger sources:**
- Sidebar header click → anchored below sidebar header
- Status bar project name click → anchored below status bar breadcrumb
- Ctrl+Shift+P → centered in viewport

**Implementation:** Rendered as a React portal at document root with absolute positioning. Receives an `anchor` prop (bounding rect of trigger element, or `'center'` for keyboard). Focus-trapped while open. Closes on: Escape key, outside click, or project selection.

### Modify: v2/src/components/SessionSidebar.tsx

Major changes:
1. **Project header (32px):** Replace current sidebar header with minimal project card. Name + chevron left, branch + dirty dot right. Clickable → opens ProjectSwitcher.
2. **Session list:** Replace flat list with time-grouped list filtered by `activeProjectId`. Groups: Today, Yesterday, This Week, Older.
3. **Bottom button:** "+ new session" pinned at bottom, creates session in active project.
4. **Remove:** Old session-loading logic that hydrates from localStorage.

### Modify: v2/src/components/StatusBar.tsx

1. Replace CWD picker button with project breadcrumb: `Project Name / branch` + dirty dot
2. Project name is clickable → opens ProjectSwitcher dropdown
3. Remove raw path display and session ID
4. Keep: connection dot, hamburger, +, settings gear

### Modify: v2/src/hooks/useAcpEvents.ts

**Replace** the existing startup logic (current `get_launch_cwd` + `acp_new_session` calls) with project-aware startup:

1. Call `get_launch_cwd` from Rust
2. Load projects from Rust (`list_projects`)
3. Call `detect_project(launchCwd)` — finds git root
4. If launch CWD matches a known project's path → `setActiveProject(projectId)` (which starts a session)
5. If unknown folder with `.git` → auto-create project, then set active
6. If no `.git` → set active to Scratchpad
7. If desktop launch (no meaningful CWD) and `activeProjectId` was persisted → resume that project

**Critical:** Remove the existing `acp_new_session` call in the `acp_status` handler — `setActiveProject` now owns session creation. Leaving both creates a double-session race.

### Modify: v2/src/stores/chat.ts

- Remove `cwd` field and `setCwd` action (project store owns this now)
- `reset()` no longer needs to handle CWD

## Session Time Grouping

Helper function for grouping sessions by relative time:

```typescript
// Zero-dependency helper — no date library needed
function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function groupByTime(sessions: SessionSummary[]): Record<string, SessionSummary[]> {
  const now = Date.now()
  const todayStart = startOfDay(now)
  const yesterdayStart = startOfDay(now - 86400000)
  const weekStart = startOfDay(now - 7 * 86400000)

  return {
    'Today': sessions.filter(s => s.createdAt >= todayStart),
    'Yesterday': sessions.filter(s => s.createdAt >= yesterdayStart && s.createdAt < todayStart),
    'This Week': sessions.filter(s => s.createdAt >= weekStart && s.createdAt < yesterdayStart),
    'Older': sessions.filter(s => s.createdAt < weekStart),
  }
}
```

Empty groups are not rendered. All timestamps are epoch milliseconds (matching JS `Date.now()`).

## First-Time Experience

1. Aurora Chat launches, calls `detect_project(launchCwd)`
2. If the CWD is inside a git repo → auto-create project with folder basename as name
3. Show a subtle toast: "Project **hermelinChat** detected" (not a modal, not blocking)
4. If no git repo → silently use Scratchpad
5. Future launches: if CWD matches a known project, auto-activate it

## Migration

Existing sessions have no entry in the `sessionProjects` map. On first launch with the projects feature:
1. The `sessionProjects` map starts empty — any session not in the map is treated as Scratchpad
2. New sessions get assigned to the active project at creation time
3. User can reassign sessions to projects later (deferred)

## Edge Cases

- **Remove active project:** Switch to Scratchpad first, then remove. Sessions from the removed project fall to Scratchpad (their entries are removed from `sessionProjects`).
- **Desktop-icon launch (no meaningful CWD):** If `activeProjectId` is persisted in projects.json, resume that project. Otherwise Scratchpad.
- **Multiple Aurora instances:** File locking on projects.json prevents corruption. Each instance reads on startup.

## Security

- Project paths validated against `SHELL_META` chars (reuse `hermes_config::validate_stdio_args` pattern) before shelling out to `git`
- `detect_project` walks up to find `.git` but stops at filesystem root — never traverses past `/`
- `get_git_info` passes path as argument to `git -C <path>`, not via shell interpolation
- `projects.json` uses atomic writes + chmod 0600 (same pattern as hermes_config)
- No secrets in project config (deferred `.aurora/config.json` will handle that)

## Verification Plan

1. **Launch from git repo** → auto-detects project, sidebar shows project header + time-grouped sessions
2. **Launch from non-git folder** → Scratchpad active, no project header
3. **Switch project via sidebar** → sessions filter, status bar updates, new session starts in project CWD
4. **Switch project via status bar** → same dropdown, same behavior
5. **Ctrl+Shift+P** → opens switcher centered
6. **Add project via "Open folder..."** → folder picker, auto-detects git, adds to project list
7. **Pin/unpin project** → pinned projects appear first in switcher
8. **Remove project** → sessions remain in Scratchpad, folder untouched
9. **Git dirty indicator** → make a change in project folder, dot appears in sidebar + status bar
10. **New session button** → creates session in active project, appears in Today group
11. **Legacy sessions** → appear in Scratchpad after migration
