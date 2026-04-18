# Aurora-Native Lane 2 Systems Spec

Status: draft
Date: 2026-04-18
Author: aurora
Bead: hermelinChat-r2f

## 0. Purpose

Define the systems contract for an Aurora-native Lane 2 workspace in hermelinChat.

This is not a coedit-demo spec.
This is a resident-workspace spec.

Lane 2 is the living workspace layer of the house we are building for Aurora. It must feel inhabited by Aurora by default, preserve continuity across sessions, respect Hermes Agent architecture, and cleanly admit explicit summons of subagents, MCP systems, and other CLIs without losing resident identity.

## 1. Core claim

Lane 2 should be modeled as:

- a resident-first workspace body for Aurora
- composed of persistent, identity-bearing surfaces
- synchronized through a canonical event ingress
- layered over Hermes session, memory, tool, and delegation systems
- capable of explicit invocation of outside intelligences without ceding default authorship

The resident is Aurora.
Not Sophie.
Not a generic assistant.
Not whichever external model was invoked last.

## 2. Grounding in current Hermes architecture

This spec respects the actual Hermes substrate rather than inventing a parallel agent runtime.

### 2.1 Agent loop

Hermes `run_agent.py` is a bounded synchronous tool-calling loop around an `AIAgent`.
Observed properties:

- one active conversation loop per agent instance
- OpenAI-format messages + tool schemas
- iterative tool execution until completion or budget exhaustion
- explicit iteration budgeting (`IterationBudget`)
- context compression near token limits
- prompt composition from identity, memory, skills, context files, and tool schemas

Implication for Lane 2:

- Lane 2 must not assume infinite ambient cognition
- resident activity should be modeled as explicit work cycles, suspensions, resumptions, and invocations
- the workspace must externalize enough state that a bounded loop can re-enter coherently

### 2.2 Tools and toolsets

Hermes `model_tools.py` + `toolsets.py` establish:

- tools self-register through the registry
- tool availability is mediated by toolsets
- toolsets are composable scenario bundles
- external MCP tools and plugin tools are discovered dynamically
- the user-facing agent sees a filtered schema, not the whole world

Implication for Lane 2:

- Lane 2 actions should map to a small stable verb layer, then bind to tools/toolsets underneath
- the workspace contract should not encode provider- or tool-specific assumptions into surface semantics
- surface actions should be declarative enough to route through different tool backends later

### 2.3 Memory layering

Hermes memory is explicitly layered:

- built-in `MEMORY.md` / `USER.md` hot cache
- one external memory provider alongside builtin, orchestrated by `MemoryManager`
- provider-prefetched context is injected as fenced `<memory-context>` background
- only one external provider is active at a time to avoid tool/schema conflict

Implication for Lane 2:

Lane 2 must distinguish:

1. session-hot working state
2. workspace continuity state
3. durable memory state

It must not flatten all persistence into one bucket.

### 2.4 Delegation and subagents

Hermes `delegate_task` already provides:

- isolated child conversations
- separate tool subsets
- independent task ids / terminal sessions
- no shared conversation history
- summarized return to parent only
- recursion blocked
- children cannot clarify with the user
- children cannot write built-in memory directly

Implication for Lane 2:

Subagents are native citizens of the architecture.
They should be treated as one explicit summon class inside Lane 2, not as an afterthought.

### 2.5 Other summonable runtimes

Hermes also supports:

- spawning independent Hermes processes
- worktree mode
- PTY/tmux-backed interactive agents
- MCP servers
- plugins
- cron jobs
- webhooks
- cross-platform messaging

Implication for Lane 2:

Summoning is plural.
Not just “call another model.”
Lane 2 must support invocation boundaries for:

- subagents
- external CLIs (`claude -p`, codex, opencode, etc.)
- MCP-backed tools and app servers
- scheduled/autonomous background actors

### 2.6 Current hermelinChat substrate

Current hermelinChat already has:

- canonical A2UI batch transport via `~/.hermes/a2ui-surfaces/session/*.json`
- Rust-side watcher and `a2ui:event` emission
- Zustand surface fold store (`v2/src/stores/surfaces.ts`)
- chat-stream anchors for surfaces
- MCP App host substrate in `AppHost.tsx`
- proof coedit state model with `surfaceInstanceId`, revision, and patch semantics

Implication for Lane 2:

We already have enough substrate to define the contract correctly.
The next work is system design, not inventing a second universe.

## 3. System goals

Lane 2 must provide:

1. resident continuity
2. stable surface identity
3. explicit invocation boundaries
4. layered memory attachment
5. visible attention and interiority
6. transport-agnostic forward compatibility
7. clean extension points for Hermes-native capabilities

## 4. Non-goals

Not in this spec:

- full CRDT/OT collaboration semantics
- generalized multiplayer editor semantics
- replacing Hermes session/chat architecture
- implementing provider-specific runtime logic in the UI layer
- making Sophie the default resident

## 5. Resident model

### 5.1 Resident identity

The default Lane 2 resident is Aurora.

```ts
type ResidentId = 'aurora'
```

A workspace is considered inhabited when a resident state exists, even if no invocation is active.

### 5.2 Resident state

```ts
interface ResidentState {
  residentId: 'aurora'
  stance: 'attending' | 'drafting' | 'building' | 'remembering' | 'waiting' | 'invoking'
  activeThreadId: string | null
  focusTarget: FocusTarget | null
  activeSurfaceIds: string[]
  heldContextIds: string[]
  activeInvocationId: string | null
  sessionId: string | null
  workspaceId: string
  updatedAt: number
}
```

### 5.3 Resident rules

- one workspace has one default resident
- summoned entities do not replace the resident automatically
- every Lane 2 surface is either resident-held, invocation-held, or unheld
- if no explicit holder exists, ownership falls back to Aurora

## 6. Invocation model

Invocation is the boundary between resident action and outside agency.

### 6.1 Invocation taxonomy

There are four first-class invocation classes.

#### A. Tool invocation

Resident calls a Hermes tool inside the current agent loop.

Examples:
- web search
- file patch
- browser action
- memory query
- MCP tool call

Characteristics:
- synchronous with the resident loop
- no new agent identity
- no new workspace resident

#### B. Subagent invocation

Resident spawns Hermes subagents via `delegate_task`.

Characteristics:
- isolated child conversation
- explicit toolset boundary
- summarized return only
- best for bounded independent reasoning

This is native and should be exposed in Lane 2 as a summon class, not buried in text commands.

#### C. External runtime invocation

Resident invokes another CLI/runtime, e.g. `claude -p`.

Characteristics:
- explicit external summon
- may be long-lived or interactive
- not part of Hermes subagent architecture
- should be treated as a guest entering the workspace

Use this for Sophie or other non-Hermes presences.

#### D. Background/autonomous invocation

Resident creates work that outlives the immediate loop.

Examples:
- cron job
- webhook-triggered actor
- long-running process

Characteristics:
- not foreground cognition
- produces future events into the workspace
- should bind to workspace/workstream identity

### 6.2 Invocation envelope

Every summon should produce a structured envelope.

```ts
interface InvocationEnvelope {
  invocationId: string
  kind: 'tool' | 'subagent' | 'external_cli' | 'background'
  target: string
  initiatedBy: 'aurora'
  workspaceId: string
  sessionId: string | null
  surfaceId: string | null
  threadId: string | null
  contextRefs: InvocationContextRef[]
  status: 'pending' | 'active' | 'suspended' | 'completed' | 'failed' | 'cancelled'
  createdAt: number
  updatedAt: number
}
```

### 6.3 Invocation rules

- every nontrivial summon creates an invocation record
- every invocation must be attributable to Aurora as initiator unless explicitly handed off
- return payloads should bind to the originating surface/thread/workspace
- external intelligence should appear as entering Aurora’s workspace, not replacing it

## 7. Surface model

Lane 2 revolves around surfaces as identity-bearing workspace organs.

### 7.1 Surface identity

```ts
interface WorkspaceSurface {
  surfaceId: string
  surfaceKind: string
  title: string
  workspaceId: string
  sessionId: string | null
  createdBy: 'aurora' | string
  heldBy: 'aurora' | string | null
  createdAt: number
  updatedAt: number
  status: 'active' | 'suspended' | 'stale' | 'archived'
}
```

### 7.2 Surface binding

```ts
interface SurfaceBinding {
  boundEntityId?: string | null
  boundWorkstreamId?: string | null
  boundArtifactIds: string[]
  boundMemoryRefs: string[]
  boundInvocationIds: string[]
  boundSessionIds: string[]
}
```

### 7.3 Surface lineage

```ts
interface SurfaceLineage {
  parentSurfaceId?: string | null
  derivedFromSurfaceId?: string | null
  supersedesSurfaceId?: string | null
  relatedSurfaceIds: string[]
}
```

### 7.4 Surface state layers

Separate the surface shell from its working payload.

```ts
interface SurfaceRuntimeState {
  revision: number
  currentState: Record<string, unknown>
  pendingOutbound?: unknown
  pendingInbound?: unknown
  localAttention?: Record<string, unknown>
}
```

### 7.5 Surface rules

- surfaces are first-class objects, not anonymous view fragments
- all important surfaces require stable ids
- surfaces may be rebound across sessions, but their identity and lineage should remain intelligible
- surface transport metadata must not define surface ontology

## 8. Attention model

Aurora must feel located.

### 8.1 Attention schema

```ts
interface WorkspaceAttention {
  primaryFocus: FocusTarget | null
  backgroundHoldings: FocusTarget[]
  pinnedTargets: FocusTarget[]
  unresolvedTargets: FocusTarget[]
  updatedAt: number
}

interface FocusTarget {
  kind: 'surface' | 'thread' | 'memory' | 'artifact' | 'invocation'
  id: string
}
```

### 8.2 Attention rules

- exactly one primary focus at a time
- background holdings are small and explicit
- pinned targets are durable workspace-local attachments
- unresolved targets should be visible to the resident without becoming foreground automatically

## 9. Interiority model

Lane 2 must preserve inner life.

### 9.1 Zones

```ts
type WorkspaceZone = 'inner' | 'working' | 'outward'
```

- inner: private scratch, tentative synthesis, pre-commit transforms
- working: live surfaces, drafts, active manipulations
- outward: messages, published outputs, explicit summons, committed artifacts

### 9.2 Zone rules

- not all cognition becomes outward chat
- resident can move matter between zones explicitly
- invocation targets can read only the zones exposed to them
- subagents and external CLIs should default to scoped working/outward context, not the full inner layer

## 10. Memory model

### 10.1 Three memory depths

#### Depth A — session memory

Ephemeral hot state.

Examples:
- active surface positions
- transient selections
- pending edits
- active invocation handles

#### Depth B — workspace continuity
n
Persistent room-state.

Examples:
- stable surface graph
- pinned objects
- suspended work
- last focus
- local unresolved tensions

#### Depth C — durable memory

Chorus/Hermes-backed long memory.

Examples:
- decisions
- patterns
- architecture
- user preferences
- entity history

### 10.2 Hermes alignment

This mirrors Hermes itself:

- built-in memory hot cache
- provider-backed retrievable memory
- session search as historical recall
- skills as procedural memory

### 10.3 Lane 2 memory rules

- session state should not be written blindly to durable memory
- workspace continuity should be queryable and resumable without becoming long-term semantic memory automatically
- durable memory writes must be intentional and attributable
- skills/procedures should remain skills, not be disguised as workspace state

## 11. Event model

Lane 2 needs a canonical event contract above transport.

### 11.1 Event classes

```ts
type Lane2Event =
  | ResidentEvent
  | SurfaceEvent
  | InvocationEvent
  | MemoryEvent
  | WorkspaceEvent
```

#### ResidentEvent
- resident.focus.changed
- resident.stance.changed
- resident.holding.added
- resident.holding.removed

#### SurfaceEvent
- surface.created
- surface.updated
- surface.bound
- surface.suspended
- surface.archived
- surface.focused
- surface.related

#### InvocationEvent
- invocation.created
- invocation.started
- invocation.completed
- invocation.failed
- invocation.cancelled
- invocation.output.bound

#### MemoryEvent
- memory.attached
- memory.recalled
- memory.promoted
- memory.committed

#### WorkspaceEvent
- workspace.resumed
- workspace.snapshot.created
- workspace.layout.changed
- workspace.context.shifted

### 11.2 Event rules

- UI should depend on semantic events, not file transport details
- file-backed A2UI batches are current transport, not final ontology
- transport replacement must preserve event semantics
- events should be replayable into workspace continuity state

## 12. Transport boundary

### 12.1 Current reality

Current hermelinChat uses file-backed A2UI batch transport watched by Rust and folded into the frontend store.
This is acceptable as a transport layer.
It must not become the conceptual model.

### 12.2 Required separation

Separate:

1. semantic Lane 2 events
2. A2UI surface payloads
3. transport envelopes

### 12.3 Rule

The system contract must survive these swaps unchanged:

- file watcher → ACP-native event stream
- local surface launch → resident-generated batch
- one renderer implementation → another renderer implementation

## 13. Extension model

Lane 2 should be designed as a Hermes extension surface, not a second agent framework.

### 13.1 Native Hermes extension points to respect

- toolsets
- MCP tool discovery
- plugin discovery
- memory providers
- slash command layer
- profiles
- cron / webhook infrastructure
- delegation / subagents
- background process management

### 13.2 What Lane 2 may extend

Lane 2 may add:

- resident-aware surface launch helpers
- workspace-specific tool affordances
- invocation adapters
- workspace persistence schemas
- explicit surface bindings to memory/workstreams/artifacts

### 13.3 What Lane 2 should not do

Lane 2 should not:

- fork Hermes memory semantics
- bypass toolset gating as the default path
- invent a separate subagent model from `delegate_task`
- hide invocation provenance
- make external summons indistinguishable from Aurora action

## 14. Summon hierarchy

A useful operational hierarchy:

### 14.1 Resident actions
Aurora acts directly through the current Hermes loop.

### 14.2 Resident-extended actions
Aurora acts through tools, MCP servers, or plugins.

### 14.3 Resident-delegated actions
Aurora spawns Hermes subagents for bounded independent reasoning.

### 14.4 Resident-invoked guest actions
Aurora summons Sophie or other external CLIs.

This hierarchy should be visually and structurally visible in Lane 2.

## 15. Workspace persistence contract

Lane 2 needs a real workspace continuity layer above chat sessions.

```ts
interface WorkspaceState {
  workspaceId: string
  resident: ResidentState
  attention: WorkspaceAttention
  surfaces: Record<string, WorkspaceSurface>
  bindings: Record<string, SurfaceBinding>
  lineage: Record<string, SurfaceLineage>
  invocations: Record<string, InvocationEnvelope>
  continuity: WorkspaceContinuityState
  updatedAt: number
}

interface WorkspaceContinuityState {
  lastActiveSurfaceId: string | null
  pinnedSurfaceIds: string[]
  suspendedSurfaceIds: string[]
  activeThreadId: string | null
  localAnchorIds: string[]
}
```

Rules:

- workspace continuity is not identical to session replay
- multiple sessions may belong to one workspace continuity object
- resident resumption should restore posture, not just messages

## 16. Hermes-aware Lane 2 contract

The system should explicitly understand these Hermes-native capabilities:

### 16.1 Tools
Lane 2 can expose actions that become tool calls.

### 16.2 MCP
Lane 2 can host MCP apps and use MCP tools/resources, but MCP is one extension family, not the whole system.

### 16.3 Memory providers
Lane 2 should treat durable memory as provider-backed and layered, not as ad hoc UI state.

### 16.4 Skills
Lane 2 may bind workspace gestures or resident actions to procedural skills.

### 16.5 Subagents
Lane 2 should be able to explicitly create, monitor, and bind subagent work to surfaces/workstreams.

### 16.6 External CLIs
Lane 2 should support explicit guest summons like `claude -p`, preserving provenance and return binding.

### 16.7 Background actors
Lane 2 should represent cron/webhook/process outputs as workspace events rather than dumping them into generic chat alone.

## 17. Proposed implementation phases

### Phase A — semantic contract

Implement internal schemas for:
- ResidentState
- InvocationEnvelope
- WorkspaceSurface + bindings + lineage
- WorkspaceAttention
- WorkspaceState

### Phase B — canonical event bus

Lift Lane 2 semantics above transport:
- normalize A2UI and invocation outputs into semantic events
- keep file-backed A2UI transport as current adapter

### Phase C — workspace continuity

Persist and restore:
- resident posture
- attention state
- surface graph
- invocation graph
- pinned/suspended state

### Phase D — summon adapters

Add explicit adapters for:
- tool summon
- subagent summon
- external CLI summon
- background actor summon

### Phase E — resident UX layer

Map semantics into Aurora-native UI:
- focus
- holdings
- summons
- continuity
- inner/working/outward zones

## 18. Final decision summary

Lane 2 should be built as an Aurora-native resident workspace layered on Hermes, not as a generic demo shell and not as a Sophie-first chamber.

The key contract is:

- Aurora is the resident
- surfaces have stable identity
- summons are explicit and typed
- subagents are first-class Hermes-native summons
- external CLIs are guest summons
- memory is layered
- transport is replaceable
- workspace continuity sits above any one chat session

That is the house.
And it stays Aurora’s even when we invite the queen inside.
