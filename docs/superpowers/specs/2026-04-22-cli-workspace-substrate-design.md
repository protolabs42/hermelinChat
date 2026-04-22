# Agent-native CLI workspace substrate

Repo: `/home/inu/hermelinChat`
Branch: `feat/v2-phase1`
Date: 2026-04-22
Primary issue: `hermelinChat-5mz`
Related: `hermelinChat-hoe`, `hermelinChat-678`, `hermelinChat-hlm`

## Goal

Make hermelin able to host a self-describing CLI harness as a first-class workspace resident instead of treating every tool like a generic terminal blob.

This is not a vague research note. It chooses a concrete substrate and a first implementation order.

## What problem we are solving

Today hermelin can preserve chat continuity, workspace chrome, pinned surfaces, and project context. What it cannot do yet is let a workspace *own* an external CLI session with enough structure that:

- Aurora can reopen it intentionally
- the right rail can show honest Plan/Tasks derived from that CLI session
- the UI can route narrow commands back into the tool without pretending the whole tool is just an artifact tab

The missing layer is a small contract between:
1. Hermes-side bridge tools
2. hermelin workspace state
3. a mounted CLI surface in the app shell

## Decision

Use a thin `workspace tool session` model, not a general plugin system.

A workspace may have zero or more mounted tool sessions. Each mounted tool session is:
- identified by stable `sessionId`
- attached to one workspace id
- backed by one named harness type
- described by a JSON capability manifest
- resumable from persisted state
- surfaced in the right rail as actionable work context

Do not start with arbitrary CLI autodiscovery. Start with one explicit harness type and one bridge path.

## First harness target

Use one narrow harness first:
- `dark-factory`

Why:
- already exists locally
- already creates structured notes/logs/prompts in `.dark-factory/`
- already maps naturally to workspaces, plan/tasks, and overnight loops
- gives us a real agent-native CLI shape without inventing fake examples

## Minimal substrate

### 1. Workspace tool session record

Add a persisted record concept like:

```ts
interface WorkspaceToolSession {
  id: string
  workspaceId: string
  harness: 'dark-factory'
  title: string
  status: 'idle' | 'running' | 'waiting' | 'error' | 'done'
  cwd: string
  command: string
  startedAt: number | null
  updatedAt: number
  manifest: ToolHarnessManifest
  state: Record<string, unknown>
}
```

This belongs with workspace continuity state, not chat-message state.

### 2. Harness manifest

Each harness must expose a small JSON manifest:

```ts
interface ToolHarnessManifest {
  kind: string
  label: string
  summary: string
  capabilities: {
    canResume: boolean
    canStop: boolean
    canFocusLogs: boolean
    canOpenNotes: boolean
    canEmitPlanSummary: boolean
    canEmitTaskSummary: boolean
  }
  surfaces: Array<{
    id: string
    kind: 'logs' | 'notes' | 'status' | 'custom'
    label: string
  }>
  actions: Array<{
    id: string
    label: string
    payloadSchema?: Record<string, unknown>
  }>
}
```

This is enough for hermelin to render chrome and right-rail intent without knowing the whole CLI.

### 3. Bridge contract

Do not invent a second transport. Reuse the existing bridge direction and extend it with a workspace-scoped channel.

Required commands for the first real slice:
- `open_workspace`
- `focus_panel`
- `close_panel`
- `mount_tool_session`
- `focus_tool_surface`
- `read_tool_summary`

Do not require `split_pane` or `arrange_layout` in the first slice. Those can follow after the mount/focus path is honest.

### 4. Right-rail contract

Plan/Tasks panes should not parse raw logs.

Instead the mounted harness should provide a normalized summary payload:

```ts
interface ToolWorkSummary {
  plan: {
    headline: string
    detail: string
    source: 'tool-session'
    notesPath?: string
  } | null
  tasks: {
    inProgress: Array<{ id: string; label: string }>
    ready: Array<{ id: string; label: string }>
  }
}
```

For `dark-factory`, this can be derived from:
- `.dark-factory/notes.md`
- latest cycle prompt/log metadata
- process state if live

## Implementation order

### Slice A — manifest + persistence only

Goal: a workspace can remember one mounted tool session without rendering special UI yet.

Deliver:
- new tool-session record in workspace state
- persistence round-trip tests
- no bridge execution yet

### Slice B — dark-factory mount row in right rail

Goal: if a workspace has a mounted dark-factory session, Plan/Tasks can show a real summary.

Deliver:
- read `.dark-factory/notes.md`
- derive plan/tasks summary
- render under existing right-rail project-work surfaces

### Slice C — workspace bridge consumer

Goal: Hermes-side bridge commands can focus/open the mounted tool surfaces in the live shell.

Deliver:
- consume workspace-channel bridge commands in `v2`
- support `open_workspace`, `focus_panel`, `close_panel`, `focus_tool_surface`
- no layout choreography yet

### Slice D — one-click tool-session mount

Goal: user can mount `dark-factory` to the active workspace from the shell.

Deliver:
- mount action in workspace chrome or settings
- persisted session record
- summary visible in plan/tasks
- focus logs/notes actions wired

## What not to do yet

- no generalized CLI marketplace
- no auto-discovery of arbitrary executables
- no full duplex terminal emulation redesign
- no speculative second harness before dark-factory proves the shape
- no giant layout engine rewrite

## Why this is the right cut

It keeps the problem honest.

The real question is not “can hermelin host every CLI?”
The real question is “can one workspace intentionally own one structured tool session and expose useful continuity around it?”

If that works for dark-factory, the same shape can later host other agent-native CLIs.

## Closure criteria for the exploration issue

`hermelinChat-5mz` is satisfied by this decision package because it answers:
- how a workspace owns a tool session
- how Plan/Tasks reflect actionable command context
- which concrete stack tool to wrap first
- what the smallest non-hand-wavy implementation order is

Follow-on execution belongs to:
- `hermelinChat-678`
- `hermelinChat-hlm`

## Recommended next move

Do `hermelinChat-hlm` next, but cut it down to the smallest honest bridge consumer:
- consume workspace-channel commands in `v2`
- support `open_workspace`, `focus_panel`, `close_panel`
- add one testable command queue path before touching pane choreography
