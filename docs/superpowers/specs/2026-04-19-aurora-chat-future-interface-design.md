# Aurora Chat Future Interface

**Beads issue:** hermelinChat-gmk (P2)
**Date:** 2026-04-19
**Status:** Design approved, pending implementation
**Contributors:** Inu + Aurora

## Summary

Aurora Chat should evolve from a capable ACP desktop client into an inhabited AI workbench: crisp enough for new users, deep enough for long technical sessions, and emotionally coherent enough to feel like Aurora actually lives there.

This design synthesizes three reference directions:

- **Claude Code desktop** for clarity, hierarchy, and obvious affordances
- **Paperclip** for advanced multi-pane operator leverage
- **Aurora / hermelinChat** for continuity, presence, and warm inhabitant-first identity

The core product move is to make **workspaces first-class**. To a human, a workspace should feel as easy to switch as a tab. Under the hood, it is richer than a tab: a persistent desk containing project context, current session, surfaces, pane state, remembered work posture, and Aurora's active continuity.

## Product thesis

The future interface should answer three questions instantly:

1. **Where am I?**
   - project, branch, workspace, session
2. **What is Aurora doing?**
   - waiting, drafting, invoking, coediting, holding context, blocked, idle
3. **How do I move?**
   - new chat, new workspace, switch workspace, open pane, restore remembered work

If the interface hides those answers, it feels magical in the wrong way.

## Design principles

### 1. Obvious first, powerful second
If a capability exists, the normal path to it should be visible without guesswork. Hidden affordances can remain as power-user accelerators, not as the only path.

### 2. One concept per control
Project switching, workspace switching, and session switching must not share a single muddy control. They are related, but not the same.

### 3. Tabs in feel, rooms in memory
A workspace should switch with the ease of a tab while preserving the depth of a room: session, surfaces, task posture, pane state, and continuity.

### 4. Advanced UX should be progressive
Paperclip-style pane power is valuable, but it should reveal itself progressively. New users should see a clean shell; power users should be able to live in multi-pane mode.

### 5. Continuity is the product, not an implementation detail
Saved state is not the story. The story is that Aurora remembers what was happening and can say so plainly.

### 6. Inhabitant-first identity
Aurora Chat should not feel like a generic shell with a skin. It should feel inhabited. Warmth matters, but capability must stay sharp.

## Core mental model

### Workspace
Primary unit of work. A workspace is a persistent desk.

A workspace contains:
- bound project or scratchpad context
- active session/thread
- open surfaces and artifacts
- pane visibility and layout
- attention/focus state
- unresolved remembered work
- Aurora resident posture and invocation continuity

### Session
Conversation/history inside the active workspace. Sessions are subordinate to workspaces, not peers.

### Surface
A live attached tool or artifact context inside a workspace: MCP App, coedit proof, artifact detail, embedded tool surface, etc.

### Pane
A secondary structured view attached to the shell: Sessions, Plan, Tasks, Surfaces, Artifacts, Context.

### Aurora
Not just a model name in a toolbar. Aurora is the inhabitant moving across workspaces and preserving continuity.

## Information architecture

### Global shell layout

```text
┌────────────────────────────────────────────────────────────────────┐
│ Top chrome                                                        │
│ [nav] [workspace strip.............] [project / branch] [actions] │
├───────────────┬──────────────────────────────────────┬─────────────┤
│ Left rail     │ Center canvas                        │ Right rail  │
│ Sessions      │ Chat + primary surface/canvas        │ Plan/Tasks/ │
│ within        │ Empty state / active conversation    │ Surfaces/   │
│ workspace     │ Composer always available            │ Artifacts   │
├───────────────┴──────────────────────────────────────┴─────────────┤
│ Ambient continuity/status layer                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Top chrome responsibilities
- primary navigation and app identity
- visible workspace strip
- active project and branch context
- global actions: new chat, new workspace, pane toggles, settings

### Left rail responsibilities
- sessions in the current workspace only
- recents/history grouped usefully
- session title, message count, last activity, soft status

### Center canvas responsibilities
- main conversation
- primary active work surface
- empty states
- inline continuity and agent output
- composer always visible

### Right rail responsibilities
- secondary structured context
- stackable panes
- advanced operator leverage without cluttering the center

## Primary shell model

### Workspace strip
Workspaces become a visible horizontal strip in the top bar.

Example shape:

```text
[ws:default • fresh] [research • 2 unresolved] [coedit proof • active] [+]
```

Each workspace tab shows:
- workspace name
- tiny state summary (active, unresolved, idle, blocked)
- active/focus styling
- overflow menu on right click / long press / chevron

Behavior:
- single click switches workspace
- hover reveals richer continuity summary
- `+` opens create menu
- overflow opens full switcher for many workspaces

### Create workspace actions
Do not collapse into one ambiguous “new workspace”. Provide explicit options:

- **New blank workspace**
- **Duplicate current workspace**
- **Workspace from current task** (follow-up)
- **Workspace from surface** (follow-up)

### New chat action
Separate from workspace creation. New chat should be unambiguous and scoped to the active workspace.

## Pane model

The right rail should become a flexible stack, inspired by Paperclip's operator affordances but calmer and more legible.

### Supported panes
- **Plan** — structured execution plan and notes
- **Tasks** — checklist/todo lane
- **Surfaces** — open attached surfaces in current workspace
- **Artifacts** — artifact list/detail
- **Context** — project facts, linked memory, workstream, references

### Pane behavior
- one-click show/hide
- optionally stack two panes vertically
- pane configuration remembered per workspace
- power users can pin panes open
- novice users can collapse right rail entirely

### Non-goals for this phase
- fully arbitrary panel docking
- freeform floating windows
- infinitely configurable IDE chrome

The goal is advanced leverage with a stable, learnable shell.

## Continuity model in UI

Continuity should be rendered plainly, never as fake resumability.

### Workspace summary language
Good:
- `Working in coedit proof`
- `Drafting reply in deploy thread`
- `Waiting on tool result`
- `2 unresolved remembered`
- `No active work remembered`

Bad:
- `Resuming execution`
- `Continue where you left off` when execution cannot truly resume
- generic `Active` with no meaning

### Aurora posture vocabulary
The resident posture should remain ambient and legible:
- attending
- drafting
- building
- invoking
- coediting
- remembering
- waiting
- blocked

### Where posture appears
- workspace tabs: tiny summary
- continuity card/status area: richer sentence
- empty states: context-sensitive hints
- workspace switcher rows: action-oriented summaries

## Visual hierarchy

### Reference synthesis
**Claude Code desktop contributes:**
- strong hierarchy
- visible actions
- clear sidebars
- calm workbench

**Paperclip contributes:**
- pane richness
- deeper operator flow
- multi-context seriousness

**Aurora contributes:**
- presence
- continuity
- warmth
- identity

### Shell styling goals
- extremely crisp alignment and spacing
- fewer hidden controls
- stronger contrast for active states
- cleaner distinction between primary and secondary info
- keep retro-futurist / Aurora identity, but reduce any feeling of ornamental clutter in navigation areas

### Empty states
Empty states should be useful and alive.

Examples:
- `Message Aurora to begin`
- `This workspace remembers a draft thread and a pinned coedit surface`
- `Start a fresh session here or reopen remembered work`

They should orient, not decorate.

## Recommended interaction flows

### Flow: create and switch workspaces
1. User sees workspace tabs in top chrome
2. User clicks `+`
3. Menu offers `New blank workspace` / `Duplicate current workspace`
4. New workspace appears in strip immediately
5. Center canvas updates without shell disorientation

### Flow: switch active work
1. User clicks another workspace tab
2. Left rail updates to that workspace's sessions
3. Center restores remembered session/surfaces honestly
4. Right rail updates to that workspace's pane configuration

### Flow: restore remembered work
1. User sees continuity summary in tab or status card
2. User clicks it
3. App restores the rememberable state: session, surfaces, focus, panes
4. UI language stays honest about what was reopened vs what truly resumes

## Current-state critique

Today, the capability is ahead of the UX:
- workspaces exist but are too hidden
- the entry point (`ws:default` in status bar) is not obvious enough
- new chat vs new workspace is not visually distinguished enough
- workspace switcher acts like the primary affordance when it should be the overflow/power path
- pane system is still secondary and underformalized

This creates confusion even though the underlying architecture is already strong.

## Future direction

### Phase A — first-class workspace shell
- add visible workspace strip to top chrome
- add explicit `+ workspace`
- keep current workspace switcher as overflow/power UI
- split blank vs duplicate workspace creation

### Phase B — mature pane system
- formalize right rail pane stack
- support Plan / Tasks / Surfaces / Artifacts / Context
- remember pane setup per workspace

### Phase C — continuity productization
- richer unresolved target semantics
- clearer Aurora posture labels
- continuity summaries everywhere workspaces are represented

### Phase D — final crispness pass
- spacing refinement
- iconography cleanup
- stronger active-state contrast
- declutter low-value chrome
- improve keyboard discoverability and command affordances

## Success criteria

The future interface succeeds when:
- a new user can discover workspaces without asking
- a power user can keep multiple desks alive for hours
- switching workspaces feels instant and natural
- Aurora's remembered posture is visible without pretending to resume impossible things
- the shell feels both capable and inhabited
- the product looks and feels more coherent than either Claude Code desktop or Paperclip alone

## Immediate recommendation

The next concrete interface move should be:

1. **Visible workspace strip in the top chrome**
2. **Explicit `+ workspace` affordance**
3. **Separate `new chat` from `new workspace`**
4. **Keep current switcher as overflow / search / power control**
5. **Use continuity summaries directly on workspace tabs**

That is the first slice that makes the future obvious on sight.