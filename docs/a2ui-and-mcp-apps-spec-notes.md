# A2UI 0.9 + MCP Apps — Spec Notes

> Phase 0 deliverable for the Aurora Chat A2UI migration (beads epic `hermelinChat-j1q`).
> Source of truth for Phase 1+ work. Captures everything we need to know about both
> protocols before designing the Aurora Chat catalog and inline-in-chat surface system.

---

## TL;DR

- **A2UI 0.9** = declarative UI protocol. Server sends JSON describing components from a
  pre-registered catalog; client renders with native widgets. No code execution. Framework-
  agnostic. Designed for LLM streaming generation.
- **MCP Apps** = sandboxed HTML iframe protocol. Server ships an HTML+JS bundle as a
  `ui://` resource; host renders it inside a sandboxed iframe with a postMessage JSON-RPC
  bridge. Any framework.
- **They are complementary, not competing**. A2UI gives you native, themed, secure
  components for the common case. MCP Apps gives you arbitrary HTML for the long tail.
  A2UI surfaces can embed MCP Apps as a component → best of both worlds.
- **Aurora Chat target architecture**: A2UI 0.9 as the primary protocol, surfaces rendered
  inline in chat as message bubbles, MCP Apps available as an escape-hatch component type
  inside surfaces, side panel becomes an opt-in pop-out for surfaces the user wants pinned.

---

## A2UI 0.9 (draft)

A2UI is a Google-led open protocol for "Agent-to-UI" — letting LLM agents drive a host
application's UI by sending declarative component descriptions instead of code or HTML.

**Origin**: created by Google with contributions from CopilotKit and OSS community.
**Repo**: <https://github.com/google/A2UI>
**License**: Apache 2.0
**Status**: v0.8 stable, v0.9 in draft (current)

### Architectural philosophy

> "How can AI agents safely send rich UIs across trust boundaries?"

The answer A2UI gives: **declarative component descriptions rendered with native widgets,
constrained by a pre-approved catalog**. The agent never ships code. The client only
instantiates components from the catalog. Security by allowlist + design system alignment
by construction.

v0.9 specifically pivots from "Structured Output First" (v0.8 — assumed JSON output mode)
to **"Prompt First"** — schemas are embedded in the agent's system prompt as natural
guidance. Better fit for current frontier models.

### The 4 server→client messages

Every A2UI message is a JSON object with a `version` field and exactly one of these keys.

#### 1. `createSurface`

Initializes a surface (the top-level UI container). A surface must exist before any
components or data model can be sent to it.

```ts
interface CreateSurface {
  version: "v0.9";
  createSurface: {
    surfaceId: string;             // Unique within the session
    catalogId: string;             // URI of the component catalog (REQUIRED in 0.9)
    theme?: Record<string, any>;   // Theme params (e.g. primaryColor)
    sendDataModel?: boolean;       // If true, client includes full data model
                                   // with every action message it sends back
  };
}
```

**Key rule**: once a surface is created, its `surfaceId` and `catalogId` are immutable.
To change the catalog, delete the surface and recreate it.

#### 2. `updateComponents`

Provides component definitions for a surface. Components are a **flat list** with an
adjacency-list tree structure: every component has an `id`, exactly one component has
`id: "root"`, and container components reference children by id.

```ts
interface UpdateComponents {
  version: "v0.9";
  updateComponents: {
    surfaceId: string;
    components: ComponentObject[];
  };
}

interface ComponentObject {
  id: string;                      // Unique within surface
  component: string;               // Type name from catalog (e.g. "Text", "Button")
  // ...component-specific properties
}
```

The flat structure exists specifically because LLMs stream JSON token by token. The
client can render partial trees, fill in missing children as more messages arrive,
and gracefully degrade when references are dangling.

#### 3. `updateDataModel`

Populates or updates the bound data the components read from. The data model is a
single JSON object per surface, addressed by JSON Pointer (RFC 6901).

```ts
interface UpdateDataModel {
  version: "v0.9";
  updateDataModel: {
    surfaceId: string;
    path?: string;       // JSON Pointer; "/" replaces entire model. Default "/".
    value?: any;         // New value; omitting it removes the key.
  };
}
```

#### 4. `deleteSurface`

Removes a surface and everything it contains.

```ts
interface DeleteSurface {
  version: "v0.9";
  deleteSurface: { surfaceId: string };
}
```

### Component model

Components carry both literal props AND **dynamic bindings** that point at the data model.

```ts
type DynamicString  = string  | { path: string } | { call: string; args: any };
type DynamicNumber  = number  | { path: string } | { call: string; args: any };
type DynamicBoolean = boolean | { path: string } | { call: string; args: any };

type ChildList =
  | { array: ComponentId[] }                       // Static child list
  | { path: string; componentId: ComponentId };    // Template iteration over array
```

Three forms wherever a value can appear: a literal, a `{path}` for data binding, or a
`{call, args}` for a catalog function.

**Example component instance:**

```json
{
  "id": "email_field",
  "component": "TextField",
  "label": "Email Address",
  "value": { "path": "/contact/email" },
  "checks": [
    { "call": "required", "args": { "value": { "path": "/contact/email" } },
      "message": "Email is required." },
    { "call": "email", "args": { "value": { "path": "/contact/email" } },
      "message": "Please enter a valid email address." }
  ]
}
```

### Actions — how the user talks back to the agent

Two flavors of action attached to interactive components:

**Server event** (round-trips to the agent):

```ts
{
  action: {
    event: {
      name: string;                      // Action identifier
      context?: Record<string, any>;     // Data sent with the action (can use {path})
    }
  }
}
```

**Local function call** (executes a client-side catalog function, no agent involved):

```ts
{
  action: {
    functionCall: {
      call: string;                      // Function name from catalog
      args: Record<string, any>;
    }
  }
}
```

Local functions are for things like `openUrl`, `formatDate`, `formatString` — operations
that don't need the agent in the loop.

### The 2 client→server messages

#### `action`

Sent when the user interacts with a component that has an `action` defined.

```ts
interface ActionMessage {
  action: {
    name: string;                        // From component.action.event.name
    surfaceId: string;
    sourceComponentId: string;
    timestamp: string;                   // ISO 8601
    context: Record<string, any>;        // Resolved {path} bindings
  };
}
```

If `createSurface.sendDataModel` was true, the action also carries the full data model.

#### `error`

Reports a client-side validation or rendering failure back to the agent so it can correct.

```ts
interface ErrorMessage {
  error: {
    code: "VALIDATION_FAILED";
    surfaceId: string;
    path: string;                        // JSON Pointer to the failed field
    message: string;                     // One-sentence description
  };
}
```

### Two-way binding model

Input components (TextField, CheckBox, ChoicePicker) have a strict contract:

1. **Read** initial value from the bound `value: {path}`
2. **Write** user input immediately back to the local data model — no round trip
3. **Sync** to the server only when an action is triggered, via `context: {path}`

The agent sees a coherent snapshot of the form state at the moment the user clicks
Submit. No streaming form state on every keystroke.

### Scope resolution

- **Root scope**: paths starting with `/` resolve from the data model root.
- **Collection scope**: when a container iterates over an array via
  `{path, componentId}`, each iteration creates a child scope. Relative paths
  (no leading `/`) inside the template resolve within that scope.

```json
{
  "id": "employee_list",
  "component": "List",
  "children": { "path": "/employees", "componentId": "employee_card_template" }
}
```

Inside `employee_card_template`, `name` resolves to `/employees/0/name`,
`/employees/1/name`, etc., without the agent having to enumerate them.

### Basic catalog (built-in components)

Components ship in catalogs identified by URI. The basic catalog includes:

| Component | Purpose |
|---|---|
| `Text` | Display text, optional Markdown |
| `Button` | Clickable, triggers actions |
| `TextField` | Text input with validation |
| `CheckBox` | Boolean toggle |
| `ChoicePicker` | Single or multi-select |
| `Column` | Vertical layout |
| `Row` | Horizontal layout |
| `Card` | Styled container |
| `List` | Scrollable, supports iteration |
| `Divider` | Visual separator |
| `Icon` | System icon |
| `Image` | Image from URL |

And these built-in functions:

| Function | Purpose |
|---|---|
| `required` | Non-empty validation |
| `email` | Email format validation |
| `regex` | Pattern matching |
| `formatString` | Interpolation with `${}` |
| `formatDate` | Date formatting |
| `openUrl` | Open URL (local action) |

### Custom catalogs

Anyone can define a custom catalog (a JSON Schema file) and register it with the
client. The agent learns about it via `supportedCatalogIds` announced at session
start, then picks one in `createSurface.catalogId`. This is exactly the slot Aurora
Chat needs to declare its own catalog of chart/mermaid/map/etc components.

Recommendation from the docs: **build catalogs that directly reflect your design
system rather than mapping a generic catalog through an adapter**. Aligns perfectly
with our existing renderer architecture.

### Streaming / progressive rendering

A2UI is explicitly designed for incremental token-stream generation. The flat
adjacency-list model lets components arrive in any order. Clients render partial
trees, mark dangling references as pending, and fill them in as more messages come.

Example streaming sequence (one JSON message per line):

```jsonl
{"version":"v0.9","createSurface":{"surfaceId":"contact_form_1","catalogId":"https://a2ui.org/specification/v0_9/basic_catalog.json"}}
{"version":"v0.9","updateComponents":{"surfaceId":"contact_form_1","components":[{"id":"root","component":"Card","child":"form_container"},{"id":"form_container","component":"Column","children":["header","name_field","submit"]},{"id":"header","component":"Text","text":"Contact Us"},{"id":"name_field","component":"TextField","label":"Name","value":{"path":"/contact/name"}},{"id":"submit","component":"Button","text":"Submit","action":{"event":{"name":"submitForm","context":{"name":{"path":"/contact/name"}}}}}]}}
{"version":"v0.9","updateDataModel":{"surfaceId":"contact_form_1","path":"/contact","value":{"name":""}}}
```

### v0.8 → v0.9 changes (the ones that matter for us)

| Old (v0.8) | New (v0.9) |
|---|---|
| `beginRendering` | `createSurface` |
| `surfaceUpdate` with `{Text: {...}}` wrapper | `updateComponents` with `{component: "Text", ...}` discriminator |
| `dataModelUpdate` with typed `valueString`/`valueNumber`/`valueMap` | `updateDataModel` with native JSON object |
| `userAction` | `action` |
| `text` (TextField) | `value` |
| `distribution`/`alignment` | `justify`/`align` |
| Separate component + function catalogs | Unified catalog |
| `styles` (in beginRendering) | `theme` (in createSurface) |
| Implicit root | Required `id: "root"` |
| Three-file schema (`common_types.json`, `server_to_client.json`, `basic_catalog.json`) |
| New: `error` message with `VALIDATION_FAILED` self-correction loop |
| New: `sendDataModel` for action context |
| New: `formatString` interpolation with `${expression}` |
| New: `basic_catalog_rules.txt` plain-text prompt fragment for things JSON Schema can't express |

We're starting fresh, so we can target v0.9 directly and skip v0.8 entirely.

### Transport

A2UI is **transport-agnostic** — it's just JSON messages. Documented options include
A2A (the Google agent-to-agent protocol), and explicitly **A2UI over MCP** as an
integration. For Aurora Chat the natural fit is to send A2UI messages over the
existing ACP channel from hermes — same pipe as `session/prompt` events.

---

## MCP Apps

MCP Apps is the Model Context Protocol's official extension for letting MCP servers
return interactive UIs that render inside MCP hosts. It's the imperative-iframe
counterpart to A2UI's declarative approach.

**Spec ID**: `io.modelcontextprotocol/ui`
**Repo**: <https://github.com/modelcontextprotocol/ext-apps>
**Spec source**: `specification/2026-01-26/apps.mdx`
**Currently supported clients**: Claude (web), Claude Desktop, VS Code GitHub Copilot,
Goose, Postman, MCPJam.

### Why it exists

Tools can return text, images, structured data — but for things like 3D viewers,
forms with many fields, interactive dashboards, or real-time monitors, text falls
short and a separate web app loses conversational context. MCP Apps lets the server
ship a real interactive UI that **lives inside the conversation** with bidirectional
data flow back to the host's tools.

### How a tool exposes a UI

A tool declares a `_meta.ui.resourceUri` field pointing to a `ui://` resource. The
host preloads that resource when the tool is about to be called.

```ts
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  _meta?: {
    ui?: {
      resourceUri?: string;            // ui://path/to/app.html
      visibility?: Array<"model" | "app">;
    };
  };
}
```

`visibility` controls who can call the tool:
- `"model"` — listed in the agent's tool list (default)
- `"app"` — only callable by the UI app from inside the iframe (back-channel)
- Default: `["model", "app"]` (both)

### The UI resource

Served via the standard MCP `resources/read` endpoint. Returns HTML with the
`text/html;profile=mcp-app` mime type:

```ts
interface UIResource {
  uri: string;                         // Must start with "ui://"
  name: string;
  description?: string;
  mimeType: "text/html;profile=mcp-app";
  _meta?: {
    ui?: {
      csp?: {
        connectDomains?: string[];     // fetch / XHR / WebSocket
        resourceDomains?: string[];    // static assets
        frameDomains?: string[];       // nested iframes
        baseUriDomains?: string[];
      };
      permissions?: {
        camera?: {};
        microphone?: {};
        geolocation?: {};
        clipboardWrite?: {};
      };
      domain?: string;                 // dedicated sandbox origin
      prefersBorder?: boolean;
    };
  };
}
```

The app can ship as a single HTML file with bundled JS+CSS (the docs recommend
`vite-plugin-singlefile`), or as separate files if CSP is configured to allow them.

### The host iframe

Hosts render the UI inside a **deny-by-default sandboxed iframe**. The default CSP
when `_meta.ui.csp` is omitted:

```
default-src 'none';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
media-src 'self' data:;
connect-src 'none';
```

The host MUST construct CSP based on declared domains, MAY further restrict, but
MUST NOT allow undeclared domains. Permission Policy honors the `permissions`
object. Apps can opt into a dedicated origin via the `domain` field for OAuth
and API allowlisting.

### postMessage transport

Communication between the iframe and the host uses **JSON-RPC 2.0 over postMessage**
in a custom dialect with `ui/*` method names.

```ts
interface JSONRPCMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, any>;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

// App → Host
window.parent.postMessage(message, "*");

// App ← Host
window.addEventListener("message", (e) => { /* handle e.data */ });
```

### Methods

**App → Host: `initialize`**

```ts
// request
{
  method: "initialize",
  params: {
    capabilities: {},
    clientInfo: { name: string; version: string },
    protocolVersion: "2026-01-26",
  }
}

// response
{
  protocolVersion: string,
  capabilities: {
    hosting?: { displayModes?: ["embedded" | "modal" | "panel"] }
  },
  serverInfo?: { name: string; version: string },
}
```

**Host → App: `ui/notifications/tool-input`**

When the agent invokes the tool that owns this UI, the host pushes the input args
to the app. Lets the UI react to streaming tool inputs even before the tool result
arrives.

```ts
{
  method: "ui/notifications/tool-input",
  params: {
    toolName: string,
    toolUseId: string,
    input: Record<string, any>,
  }
}
```

**Host → App: `ui/notifications/tool-result`**

When the tool finishes executing, the host pushes the result to the app.

```ts
{
  method: "ui/notifications/tool-result",
  params: {
    toolUseId: string,
    content: Array<{
      type: "text" | "image",
      text?: string,
      data?: string,        // base64 for images
      mimeType?: string,
    }>,
    isError?: boolean,
  }
}
```

**App → Host: `tools/call`** (and other standard MCP messages)

The app can call any MCP tool the server exposes — same JSON-RPC shape as core MCP.
The host validates and forwards. Subject to user consent and the host's allowlist.

```ts
{
  method: "tools/call",
  params: {
    name: string,
    arguments: Record<string, any>,
  }
}
```

There are also helpers for logging, opening URLs, and updating the model's context
with structured data from the app.

### The `App` SDK class

The official `@modelcontextprotocol/ext-apps` package provides an `App` class that
wraps postMessage. Minimal usage:

```ts
import { App } from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "Get Time App", version: "1.0.0" });
app.connect();

// Receive tool results pushed by the host
app.ontoolresult = (result) => { /* update UI */ };

// Proactively call back to the server
const result = await app.callServerTool({
  name: "get-time",
  arguments: {},
});
```

The class is convenience-only — implementing the postMessage protocol directly
is supported for any framework or vanilla JS.

### Host-side: `AppBridge`

For implementers building hosts, the SDK includes an `AppBridge` module that handles
iframe rendering, message passing, tool call proxying, and security policy
enforcement. There's also `@mcp-ui/client` (a third-party React component package)
for hosts that want a higher-level integration.

For Aurora Chat, we'd implement the host side ourselves (Tauri + React), targeting
the postMessage protocol directly. Not a heavy lift — the surface area is small.

### Examples in the wild

The ext-apps repo has working examples for: 3D scenes (Three.js), maps (CesiumJS),
shaders (Shadertoy), data exploration (cohort heatmap, customer segmentation, wiki
explorer), business apps (scenario modeler, budget allocator), media (PDF viewer,
video, sheet music, text-to-speech), utilities (QR codes, system monitor,
transcripts), and starter templates for React, Vue, Svelte, Preact, Solid, vanilla.

Worth cloning for reference when we build the Phase 5 adapter.

---

## A2UI vs MCP Apps — the real comparison

| Dimension | A2UI 0.9 | MCP Apps |
|---|---|---|
| **Approach** | Declarative — server sends component JSON, client renders with native widgets | Imperative — server ships HTML+JS, host renders in sandboxed iframe |
| **Security model** | Allowlisted catalog components, no code execution | Sandboxed iframe, deny-by-default CSP, permission gating |
| **Design system** | Native to host — components match host's look, theme via `theme` param | Bring-your-own CSS, can clash visually with host |
| **Framework** | Agnostic — same JSON renders in React, Flutter, Angular, native | Agnostic — host ships an iframe, app uses any framework |
| **Streaming** | First-class — flat adjacency list designed for token-stream generation | N/A — HTML loaded as a single resource |
| **Two-way binding** | Built into the protocol via JSON Pointer + DynamicString/etc | App-defined via JS, no protocol opinion |
| **Validation** | Catalog-defined `checks` with structured error feedback to the agent | App-defined |
| **Backchannel** | `action` events with structured `name` + `context` | `tools/call` from inside the iframe |
| **Persistence** | Surfaces persist as JSON, can be replayed deterministically | Iframe is ephemeral, no built-in persistence |
| **Spec status** | v0.9 draft, v0.8 stable | Spec dated 2026-01-26, in active development |
| **Adoption** | New, growing | Already in Claude, VS Code Copilot, Goose, Postman, MCPJam |
| **Best for** | Forms, data viz, dashboards, anything that fits a catalog | 3D, custom interactions, third-party widgets, anything wild |

### They're complementary

**A2UI 0.9 already documents MCP Apps integration**: a surface can contain native
A2UI components AND embedded MCP App iframes side by side. A button can be a real
A2UI component (themed, validated), while a 3D viewer in the same surface is an
MCP App iframe. The user sees one coherent UI; under the hood it's two protocols.

This gives Aurora Chat **two escape hatches** at different abstraction levels:

1. **The catalog** — for the 90% of cases where a designed component is enough.
   Themed, validated, persistent, replayable.
2. **MCP Apps embed** — for the 10% where you need arbitrary HTML/JS. Pop in a
   tldraw whiteboard, a Three.js scene, a custom 3D model viewer — anything.

---

## Aurora Chat target architecture

### What we have today

```
┌────────────────┐  side-channel  ┌──────────────────┐
│  ChatView      │                │  ArtifactPanel   │
│ MessageBubbles │                │   (right side)   │
└────────────────┘                └──────────────────┘
        ↑                                   ↑
        │                                   │
   ACP `session/update` events       file watcher on
   = Aurora's text/thinking          ~/.hermes/artifacts/
```

- Chat shows text and tool calls.
- Artifacts are a separate side panel, populated by hermes writing JSON files
  that a Rust filesystem watcher picks up and forwards to the React frontend.
- One-way: Aurora produces, user observes. The bridge for two-way is plumbed
  but unused.
- Renderer choice is a switch statement in `ArtifactPanel.tsx` over the
  `artifact_type` field.

### What we want

```
┌──────────────────────────────────────────┐
│  ChatView                                │
│ ┌──────────────────────────────────────┐ │
│ │  user: show me sales by region       │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │  aurora: here it is                  │ │
│ │  ┌────────────────────────────────┐  │ │
│ │  │   [interactive bar chart]      │  │ │  ← inline A2UI surface
│ │  │   (click any bar to drill in)  │  │ │     in a message bubble
│ │  └────────────────────────────────┘  │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │  user clicks "Europe" bar            │ │  ← A2UI action sent
│ └──────────────────────────────────────┘ │     back through ACP
│ ┌──────────────────────────────────────┐ │
│ │  aurora: europe is up 18% YoY        │ │
│ │  ┌────────────────────────────────┐  │ │
│ │  │   [drilldown chart of europe]  │  │ │  ← new surface in
│ │  └────────────────────────────────┘  │ │     follow-up reply
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘

         ↑ optional pin/pop-out
┌────────────────────┐
│ ArtifactPanel      │  ← becomes opt-in destination
│ (pinned surfaces)  │     for surfaces user wants visible
└────────────────────┘     while continuing to chat
```

Surfaces are first-class chat content. They live in the message stream, persist
in chat history, get re-hydrated on session reload, and can be pinned to the
side panel as a secondary view.

### Mapping the existing renderers to the new model

Our current renderers become **A2UI catalog component implementations**.

| Existing renderer | A2UI catalog component | Notes |
|---|---|---|
| `ChartRenderer` (recharts) | `Chart` | Same data shape, exposed as component prop |
| `MapRenderer` (leaflet) | `Map` | Same |
| `MermaidRenderer` (mermaid) | `Mermaid` | Same |
| `ImageRenderer` | `Image` | Already in basic catalog — extend with our props |
| `TableRenderer` | `Table` | Custom (basic catalog has no Table primitive) |
| `LogsRenderer` | `Logs` | Custom |
| `MarkdownRenderer` | `Markdown` | We have this; basic catalog has Text with markdown |
| `HtmlRenderer` (sandbox iframe srcDoc) | `HtmlEmbed` | Custom |
| `IframeRenderer` (URL iframe) | `IframeEmbed` | Custom |
| (new) | `McpApp` | Hosts an MCP App via postMessage |
| (new) | `Text`, `Button`, `TextField`, `CheckBox`, `ChoicePicker`, `Column`, `Row`, `Card`, `List`, `Divider`, `Icon` | From basic catalog — needed for forms, layouts, interactivity |

We end up with a catalog that is **the basic A2UI components + Aurora Chat's
visualization extensions + MCP Apps as a component type**.

### Surfaces as message content

Today's `ChatMessage` interface has a `role` and `content` (string). We add a
new content type for A2UI surfaces.

```ts
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'thinking' | 'tool' | 'system';
  content: string;
  // ...existing fields
  surfaces?: A2UISurfaceState[];   // NEW
}

interface A2UISurfaceState {
  surfaceId: string;
  catalogId: string;
  theme?: Record<string, any>;
  components: ComponentObject[];   // accumulated from updateComponents
  dataModel: any;                  // accumulated from updateDataModel
  pinned?: boolean;                // user pinned to side panel
}
```

A surface is just a struct in the message. Persisting the chat history persists
the surface. Reloading rehydrates it. Pinning is a UI flag.

### Action flow

1. User clicks a `Button` inside an inline surface
2. The renderer assembles an A2UI `action` message with the resolved context
3. The action is sent through ACP as a structured event (new ACP message type
   OR piggybacked on `session/prompt` with a structured payload)
4. Hermes routes the action to Aurora as agent input
5. Aurora reads the action, responds with text + zero or more new
   `createSurface`/`updateComponents`/`updateDataModel` messages
6. The new surface appears as the next message in the chat

### Hermes side

Phase 4 adds a hermes tool — either a new `emit_surface` or extending `create_artifact`
to also emit A2UI catalog messages. Aurora needs to discover the catalog at session
start (via system prompt injection or tool description) so she knows what components
are available.

### MCP Apps as escape hatch

Phase 5 adds an `McpApp` component to the catalog. Its renderer is a sandboxed
iframe with the postMessage bridge implementation per MCP Apps spec. Inside an A2UI
surface, you can place an MCP App alongside native components — same chat message,
two protocols, one user experience.

---

## Open questions for Phase 1+

These need answers before we can write the catalog file. None block Phase 1 from
*starting* but each will need to be resolved during it.

1. **Catalog URI scheme.** Hosted (e.g. `https://aurora-chat.app/catalog/v1.json`)
   or local (`file://` shipped with the app)? Hosted lets other clients reuse it,
   local means no internet dependency. Probably both — host on GitHub, also bundle.

2. **JSON Schema file structure.** A2UI 0.9 uses three files (`common_types.json`,
   `server_to_client.json`, `basic_catalog.json`). Do we mirror that, or single-file
   it for simplicity?

3. **Existing artifact path migration.** Keep the file watcher + create_artifact
   path working as a backwards-compat shim, or hard-cut to A2UI? My vote: keep
   both for one release, deprecate the file watcher in the next.

4. **ACP message subtype for actions.** Does ACP support custom message types, or
   do we piggyback on `session/prompt` with a structured prefix? Need to look at
   the ACP spec / hermes adapter.

5. **Validation timing.** A2UI client-side validation runs on input. Do we run our
   own JSON Schema validation on incoming `updateComponents` against the catalog,
   or trust the agent? Spec says clients SHOULD validate and emit `error` messages.

6. **Theme passing.** A2UI has a `theme` param on `createSurface` for primaryColor
   etc. Map this to our existing `useTheme()` so the agent can override per-surface,
   or pin to current theme always?

7. **Streaming UX.** A surface arrives in pieces. Do we render placeholders for
   pending references, or wait until the surface is "complete" enough? Spec says
   render progressively — we should follow that for the LLM-feels-realtime effect.

8. **MCP Apps tool routing.** When an MCP App inside a surface calls back via
   `tools/call`, how does that route to the right hermes server? We'd need to
   relay the call from the iframe through Aurora Chat to hermes ACP, which is
   not how MCP Apps normally works (it goes to the same MCP server that owns the
   tool). May need a custom routing rule.

---

## Verification questions (Phase 0 done means I can answer these without re-reading)

- Q: How does a button click flow back to the agent in A2UI?
  A: Component has `action: { event: { name, context } }`. On click, client
  sends `{ action: { name, surfaceId, sourceComponentId, timestamp, context } }`
  back over the transport. Agent receives it as input.

- Q: What's the difference between a server event and a client function call?
  A: Server event round-trips to the agent (`action.event`), client function call
  executes a catalog function locally (`action.functionCall`) — no agent involved.
  Used for things like `openUrl`, `formatString`.

- Q: How does MCP Apps preload a UI?
  A: The tool's `_meta.ui.resourceUri` points to a `ui://` resource. The host can
  read that resource (HTML bundle) before the tool is even called, then render it
  in a sandboxed iframe when the tool is invoked.

- Q: How does an MCP App talk back to the host?
  A: postMessage with JSON-RPC 2.0. The app sends `tools/call` (and friends) via
  `window.parent.postMessage`. The host validates via its security policy and
  forwards to the appropriate MCP server.

- Q: What does `id: "root"` mean in A2UI?
  A: Every surface's component tree must have exactly one component with `id: "root"`.
  Container components reference children by id. Required as of v0.9 (was implicit in v0.8).

- Q: What's the difference between A2UI v0.8 and v0.9?
  A: v0.9 flattens the component structure (`{component: "Text", ...}` discriminator
  instead of `{Text: {...}}` wrapper), uses native JSON for data model instead of
  typed value wrappers, renames several props, requires `id: "root"`, adds the
  `error` message for self-correction loops, adds `sendDataModel` for action context,
  and adds string interpolation in `formatString`.

- Q: Can you mix A2UI and MCP Apps in the same UI?
  A: Yes. A2UI 0.9 explicitly documents MCP Apps integration as a surface component
  type. A native A2UI button and an MCP Apps iframe can live in the same `Card`.

---

## Recommended Phase 1 first steps

1. Start `v2/src/a2ui/catalog.json` with the basic A2UI components (Text, Button,
   TextField, CheckBox, ChoicePicker, Column, Row, Card, List, Divider, Icon) using
   their A2UI 0.9 schema as the source of truth.
2. Add Aurora-specific components: Chart, Map, Mermaid, Image (extended), Table,
   Logs, Markdown, HtmlEmbed, IframeEmbed, McpApp.
3. Write a minimal `validate(message)` helper that checks an incoming surface
   against the catalog schema.
4. Hardcode 3 example surface JSONs in dev mode (a contact form, a chart, a mixed
   surface with a chart + button) and confirm the schema validates them.
5. Move on to Phase 2 (renderer).

---

## References (canonical, fetched 2026-04-07)

- A2UI homepage: <https://a2ui.org/>
- A2UI v0.9 spec: <https://a2ui.org/specification/v0.9-a2ui/>
- A2UI v0.9 evolution guide: <https://a2ui.org/specification/v0.9-evolution-guide/>
- A2UI message reference: <https://a2ui.org/reference/messages/>
- A2UI custom catalog guide: <https://a2ui.org/guides/defining-your-own-catalog/>
- A2UI repo: <https://github.com/google/A2UI>
- MCP Apps overview: <https://modelcontextprotocol.io/extensions/apps/overview>
- MCP Apps build guide: <https://modelcontextprotocol.io/extensions/apps/build>
- MCP Apps spec source:
  <https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx>
- MCP Apps API docs: <https://apps.extensions.modelcontextprotocol.io/api/>
- ext-apps repo: <https://github.com/modelcontextprotocol/ext-apps>
