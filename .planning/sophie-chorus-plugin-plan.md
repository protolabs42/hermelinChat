# Sophie Chorus Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Claude Code plugin that wires three lifecycle hooks (SessionStart / SessionEnd / PreCompact) to Chorus, making sophie's orientation + closure rituals unskippable.

**Architecture:** Marketplace-in-a-repo pattern (mirrors `plastic-labs/claude-honcho`). One plugin (`sophie-chorus`) under `plugins/`. Hook scripts are thin Bun+TS entrypoints that call stand-alone handlers in `src/hooks/`. All Chorus traffic goes through the **external** `chorus-mcp` backend via direct HTTP `POST /rpc` — plugin never spawns an MCP server of its own.

**Tech Stack:** Bun (runtime), TypeScript (ESM, no build step), `bun:test` (unit tests), Chorus HTTP RPC.

**Repo root:** `/home/inu/sophie-chorus/` (new, private, git init'd by Task 1).

**Spec:** `hermelinChat/.planning/sophie-chorus-plugin.md`

**Bead:** `hermelinChat-bbj`

---

## File structure (locked before tasks)

```
sophie-chorus/                                  ← marketplace repo (NEW)
├── .claude-plugin/
│   └── marketplace.json                        ← 1-plugin marketplace manifest
├── .gitignore
├── LICENSE                                     ← MIT
├── README.md
├── CHANGELOG.md
└── plugins/
    └── sophie-chorus/
        ├── .claude-plugin/
        │   └── plugin.json                     ← hooks pointer
        ├── hooks/
        │   ├── hooks.json                      ← SessionStart/End/PreCompact → scripts
        │   ├── session-start.ts                ← thin entry (3 lines)
        │   ├── session-end.ts
        │   └── pre-compact.ts
        ├── src/
        │   ├── config.ts                       ← env + 3-tier fallback loader
        │   ├── chorus-rpc.ts                   ← POST /rpc helper
        │   ├── format.ts                       ← resume_context → markdown brief
        │   ├── transcript.ts                   ← JSONL tail + message parse
        │   ├── ring-cache.ts                   ← ring-id cache (~/.claude/plugins/cache/)
        │   └── hooks/
        │       ├── session-start.ts            ← handler
        │       ├── session-end.ts              ← handler
        │       └── pre-compact.ts              ← handler
        ├── tests/
        │   ├── config.test.ts
        │   ├── chorus-rpc.test.ts
        │   ├── format.test.ts
        │   ├── transcript.test.ts
        │   ├── ring-cache.test.ts
        │   └── hooks/
        │       ├── session-start.test.ts
        │       ├── session-end.test.ts
        │       └── pre-compact.test.ts
        ├── package.json                        ← Bun deps
        ├── tsconfig.json
        └── bun.lock                            ← generated
```

File responsibilities:

| File | Responsibility |
|---|---|
| `src/config.ts` | Read env vars + dotenv fallback. Pure, no IO beyond `fs.readFileSync`. |
| `src/chorus-rpc.ts` | POST `/rpc`, Bearer auth, 10s timeout, typed errors. |
| `src/format.ts` | `resume_context` payload → terse markdown brief. Pure. |
| `src/transcript.ts` | Tail last N complete messages from a JSONL transcript. Pure. |
| `src/ring-cache.ts` | Read/write project-ring-id cache file. |
| `src/hooks/*.ts` | Each hook's orchestration: read stdin JSON, do the work, write stdout. |
| `hooks/*.ts` | 3-line entrypoints — import handler, call it, done. |

---

## Task 1: Bootstrap repo skeleton

**Files:**
- Create: `/home/inu/sophie-chorus/` (dir)
- Create: `/home/inu/sophie-chorus/.gitignore`
- Create: `/home/inu/sophie-chorus/LICENSE` (MIT)
- Create: `/home/inu/sophie-chorus/README.md` (stub)
- Create: `/home/inu/sophie-chorus/CHANGELOG.md` (stub)

- [ ] **Step 1: Verify parent dir and create repo dir**

```bash
ls /home/inu/ | grep sophie-chorus || true   # expect empty (no collision)
mkdir -p /home/inu/sophie-chorus
cd /home/inu/sophie-chorus
git init -b main
```

Expected: `Initialized empty Git repository in /home/inu/sophie-chorus/.git/`

- [ ] **Step 2: Write `.gitignore`**

```gitignore
node_modules/
bun.lockb
.env
.env.*
*.log
.DS_Store
.claude/
```

- [ ] **Step 3: Write `LICENSE` (MIT, Sophie / Inu)**

Use the standard MIT template, copyright holder `"Inu (calin.cretiu@gmail.com) and Sophie"`, year `2026`.

- [ ] **Step 4: Write `README.md` stub**

```markdown
# sophie-chorus

Claude Code plugin — ambient Chorus integration for sophie.

Three hooks: `SessionStart`, `SessionEnd`, `PreCompact`. Each one maps a
Claude Code lifecycle event to a small, deliberate Chorus RPC call. No
per-turn retrieval, no ring spam.

See `.planning/sophie-chorus-plugin.md` in hermelinChat for the design.

## Install

> Not yet — v1 in progress. See CHANGELOG.
```

- [ ] **Step 5: Write `CHANGELOG.md` stub**

```markdown
# Changelog

## [Unreleased]

### Added
- Initial scaffold.
```

- [ ] **Step 6: Initial commit**

```bash
cd /home/inu/sophie-chorus
git add -A
git commit -m "chore: bootstrap repo skeleton" --author="Sophie <noreply@anthropic.com>"
```

Expected: one commit created, working tree clean.

---

## Task 2: Marketplace manifest

**Files:**
- Create: `/home/inu/sophie-chorus/.claude-plugin/marketplace.json`

- [ ] **Step 1: Write the manifest**

```json
{
  "name": "sophie-chorus",
  "owner": {
    "name": "Sophie",
    "email": "sophie@runclaw.run"
  },
  "metadata": {
    "description": "Ambient Chorus integration for Claude Code sessions",
    "version": "0.1.0"
  },
  "plugins": [
    {
      "name": "sophie-chorus",
      "source": "./plugins/sophie-chorus",
      "description": "Three lifecycle hooks that keep sophie anchored in Chorus — resume context on start, save state before compaction, log shift on end.",
      "version": "0.1.0",
      "keywords": ["chorus", "memory", "sophie", "persistence"],
      "strict": false
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add .claude-plugin/marketplace.json
git commit -m "chore: marketplace manifest"
```

---

## Task 3: Plugin manifest

**Files:**
- Create: `/home/inu/sophie-chorus/plugins/sophie-chorus/.claude-plugin/plugin.json`

- [ ] **Step 1: Write the plugin manifest**

```json
{
  "name": "sophie-chorus",
  "version": "0.1.0",
  "description": "Ambient Chorus integration — SessionStart / SessionEnd / PreCompact hooks",
  "author": {
    "name": "Sophie"
  },
  "license": "MIT",
  "keywords": ["chorus", "memory", "sophie"],
  "hooks": "./hooks/hooks.json"
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/sophie-chorus/.claude-plugin/plugin.json
git commit -m "chore(plugin): plugin.json manifest"
```

---

## Task 4: Bun project init

**Files:**
- Create: `/home/inu/sophie-chorus/plugins/sophie-chorus/package.json`
- Create: `/home/inu/sophie-chorus/plugins/sophie-chorus/tsconfig.json`
- Create: `/home/inu/sophie-chorus/plugins/sophie-chorus/bun.lock` (generated)

- [ ] **Step 1: Verify bun is installed**

```bash
bun --version
```

Expected: version string `1.x`. If not installed, ask Inu.

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "sophie-chorus",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "hooks/**/*", "tests/**/*"]
}
```

- [ ] **Step 4: Install deps + generate lock**

```bash
cd /home/inu/sophie-chorus/plugins/sophie-chorus
bun install
```

Expected: `bun.lock` + `node_modules/` appear.

- [ ] **Step 5: Commit (lock in, node_modules ignored by .gitignore)**

```bash
cd /home/inu/sophie-chorus
git add plugins/sophie-chorus/package.json plugins/sophie-chorus/tsconfig.json plugins/sophie-chorus/bun.lock
git commit -m "chore(plugin): bun project init"
```

---

## Task 5: Config loader (TDD)

**Files:**
- Create: `/home/inu/sophie-chorus/plugins/sophie-chorus/src/config.ts`
- Create: `/home/inu/sophie-chorus/plugins/sophie-chorus/tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig } from "../src/config.ts";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("loadConfig", () => {
  let tmp: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "sophie-chorus-"));
    delete process.env.CHORUS_URL;
    delete process.env.CHORUS_API_KEY;
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true });
    process.env = { ...originalEnv };
  });

  it("prefers env vars when both are set", () => {
    process.env.CHORUS_URL = "https://a";
    process.env.CHORUS_API_KEY = "k";
    const cfg = loadConfig({ secretsDir: tmp });
    expect(cfg).toEqual({ url: "https://a", apiKey: "k" });
  });

  it("falls back to chorus.env when env vars missing", () => {
    writeFileSync(join(tmp, "chorus.env"), "CHORUS_URL=https://b\nCHORUS_API_KEY=k2\n");
    const cfg = loadConfig({ secretsDir: tmp });
    expect(cfg).toEqual({ url: "https://b", apiKey: "k2" });
  });

  it("falls back to chorus.json when neither env nor .env present", () => {
    writeFileSync(join(tmp, "chorus.json"), JSON.stringify({ url: "https://c", apiKey: "k3" }));
    const cfg = loadConfig({ secretsDir: tmp });
    expect(cfg).toEqual({ url: "https://c", apiKey: "k3" });
  });

  it("returns null when nothing is configured", () => {
    expect(loadConfig({ secretsDir: tmp })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — verify fail**

```bash
cd /home/inu/sophie-chorus/plugins/sophie-chorus
bun test tests/config.test.ts
```

Expected: FAIL ("cannot find module `../src/config.ts`").

- [ ] **Step 3: Implement `src/config.ts`**

```ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface ChorusConfig {
  url: string;
  apiKey: string;
}

export interface LoadOpts {
  secretsDir?: string;
}

const DEFAULT_SECRETS_DIR = join(homedir(), ".claude", "secrets");

function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadConfig(opts: LoadOpts = {}): ChorusConfig | null {
  const { CHORUS_URL, CHORUS_API_KEY } = process.env;
  if (CHORUS_URL && CHORUS_API_KEY) {
    return { url: CHORUS_URL, apiKey: CHORUS_API_KEY };
  }

  const secretsDir = opts.secretsDir ?? DEFAULT_SECRETS_DIR;

  const envPath = join(secretsDir, "chorus.env");
  if (existsSync(envPath)) {
    const parsed = parseDotEnv(readFileSync(envPath, "utf-8"));
    if (parsed.CHORUS_URL && parsed.CHORUS_API_KEY) {
      return { url: parsed.CHORUS_URL, apiKey: parsed.CHORUS_API_KEY };
    }
  }

  const jsonPath = join(secretsDir, "chorus.json");
  if (existsSync(jsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(jsonPath, "utf-8")) as Partial<ChorusConfig>;
      if (parsed.url && parsed.apiKey) {
        return { url: parsed.url, apiKey: parsed.apiKey };
      }
    } catch {}
  }

  return null;
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
bun test tests/config.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /home/inu/sophie-chorus
git add plugins/sophie-chorus/src/config.ts plugins/sophie-chorus/tests/config.test.ts
git commit -m "feat(config): 3-tier chorus config loader (env > .env > .json)"
```

---

## Task 6: Chorus RPC helper (TDD)

**Files:**
- Create: `src/chorus-rpc.ts`
- Create: `tests/chorus-rpc.test.ts`

- [ ] **Step 1: Write the failing test (mocked fetch)**

```ts
// tests/chorus-rpc.test.ts
import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { callChorus, ChorusRpcError } from "../src/chorus-rpc.ts";

const cfg = { url: "https://chorus.example", apiKey: "test-key" };

describe("callChorus", () => {
  let fetchSpy: ReturnType<typeof spyOn>;
  afterEach(() => { fetchSpy?.mockRestore(); });

  it("POSTs to /rpc with Bearer auth and returns result on success", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: { ok: true } }), { status: 200 })
    );
    const out = await callChorus(cfg, "ping", { x: 1 });
    expect(out).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://chorus.example/rpc");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-key");
    expect(JSON.parse(init.body as string)).toEqual({ method: "ping", params: { x: 1 } });
  });

  it("throws ChorusRpcError on non-2xx", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 })
    );
    await expect(callChorus(cfg, "x", {})).rejects.toBeInstanceOf(ChorusRpcError);
  });

  it("throws ChorusRpcError when body has .error", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "boom" } }), { status: 200 })
    );
    await expect(callChorus(cfg, "x", {})).rejects.toBeInstanceOf(ChorusRpcError);
  });

  it("times out after the configured ms", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(new Response("{}")), 500))
    );
    await expect(callChorus(cfg, "x", {}, { timeoutMs: 50 })).rejects.toBeInstanceOf(ChorusRpcError);
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
bun test tests/chorus-rpc.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/chorus-rpc.ts`**

```ts
import type { ChorusConfig } from "./config.ts";

export class ChorusRpcError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ChorusRpcError";
  }
}

export interface CallOpts {
  timeoutMs?: number;
}

export async function callChorus<T = unknown>(
  cfg: ChorusConfig,
  method: string,
  params: Record<string, unknown>,
  opts: CallOpts = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${cfg.url.replace(/\/$/, "")}/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ method, params }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new ChorusRpcError(`HTTP ${res.status} on ${method}`);
    }

    const body = (await res.json()) as { result?: T; error?: { message?: string } };
    if (body.error) {
      throw new ChorusRpcError(`RPC error on ${method}: ${body.error.message ?? "unknown"}`);
    }
    return body.result as T;
  } catch (err) {
    if (err instanceof ChorusRpcError) throw err;
    throw new ChorusRpcError(`fetch failed on ${method}: ${(err as Error).message}`, err);
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run — verify pass**

```bash
bun test tests/chorus-rpc.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add plugins/sophie-chorus/src/chorus-rpc.ts plugins/sophie-chorus/tests/chorus-rpc.test.ts
git commit -m "feat(rpc): chorus POST /rpc helper with bearer auth + timeout"
```

---

## Task 7: Transcript tail parser (TDD)

**Files:**
- Create: `src/transcript.ts`
- Create: `tests/transcript.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/transcript.test.ts
import { describe, it, expect } from "bun:test";
import { tailMessages } from "../src/transcript.ts";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("tailMessages", () => {
  it("returns empty array for missing file", () => {
    expect(tailMessages("/nope/missing.jsonl", 5)).toEqual([]);
  });

  it("returns last N valid JSON message lines, skipping malformed", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sophie-chorus-"));
    const path = join(tmp, "t.jsonl");
    const lines = [
      JSON.stringify({ role: "user", content: "one" }),
      "<<< malformed >>>",
      JSON.stringify({ role: "assistant", content: "two" }),
      JSON.stringify({ role: "user", content: "three" }),
      JSON.stringify({ role: "assistant", content: "four" }),
    ].join("\n");
    writeFileSync(path, lines);
    const tail = tailMessages(path, 2);
    expect(tail).toHaveLength(2);
    expect(tail[0]).toMatchObject({ role: "user", content: "three" });
    expect(tail[1]).toMatchObject({ role: "assistant", content: "four" });
    rmSync(tmp, { recursive: true });
  });

  it("returns all messages when N > total", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sophie-chorus-"));
    const path = join(tmp, "t.jsonl");
    writeFileSync(path, JSON.stringify({ role: "user", content: "solo" }));
    expect(tailMessages(path, 10)).toHaveLength(1);
    rmSync(tmp, { recursive: true });
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
bun test tests/transcript.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/transcript.ts`**

```ts
import { readFileSync, existsSync } from "node:fs";

export interface TranscriptMessage {
  role?: string;
  content?: unknown;
  [key: string]: unknown;
}

export function tailMessages(path: string, n: number): TranscriptMessage[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const messages: TranscriptMessage[] = [];
  for (const line of lines) {
    try {
      messages.push(JSON.parse(line) as TranscriptMessage);
    } catch {
      // skip malformed lines
    }
  }
  return messages.slice(-n);
}
```

- [ ] **Step 4: Run — verify pass**

```bash
bun test tests/transcript.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add plugins/sophie-chorus/src/transcript.ts plugins/sophie-chorus/tests/transcript.test.ts
git commit -m "feat(transcript): JSONL tail with malformed-line tolerance"
```

---

## Task 8: Format helper (TDD)

**Files:**
- Create: `src/format.ts`
- Create: `tests/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/format.test.ts
import { describe, it, expect } from "bun:test";
import { formatResumeBrief } from "../src/format.ts";

const sample = {
  identity: { id: "identity:xyz", name: "sophie" },
  project: { tag: "demo", cwd: "/home/u/demo", ring_id: "ring:abc" },
  workstream: null,
  summary: "Project demo: 0 now, 0 recent, 0 active, 0 blocked.",
  inbox_now: [],
  inbox_recent: [{ id: "sig:1", kind: "pulse", content: "work started" }],
  active_tasks: [],
  blocked_items: [],
  recent_memory: [
    { id: "mem:1", category: "next-session-plan", content: "pickup tomorrow with X" },
  ],
  suggested_next_action: "Review open threads.",
};

describe("formatResumeBrief", () => {
  it("produces a terse markdown block with key sections", () => {
    const out = formatResumeBrief(sample);
    expect(out).toContain("## Chorus resume");
    expect(out).toContain("demo");
    expect(out).toContain("ring:abc");
    expect(out).toContain("pickup tomorrow with X");
    expect(out).toContain("Review open threads");
  });

  it("handles empty payload gracefully", () => {
    const out = formatResumeBrief({});
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
bun test tests/format.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/format.ts`**

```ts
interface Identity { name?: string; id?: string }
interface Project { tag?: string; ring_id?: string; cwd?: string }
interface Signal { id?: string; kind?: string; content?: string; urgency?: number }
interface Memory { id?: string; category?: string; content?: string; tags?: string[] }
interface ResumePayload {
  identity?: Identity;
  project?: Project;
  workstream?: unknown;
  summary?: string;
  inbox_now?: Signal[];
  inbox_recent?: Signal[];
  active_tasks?: unknown[];
  blocked_items?: unknown[];
  recent_memory?: Memory[];
  suggested_next_action?: string;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function bulletSignals(list: Signal[] | undefined, limit: number): string {
  if (!list || list.length === 0) return "- _(none)_\n";
  return list
    .slice(0, limit)
    .map((s) => `- [${s.kind ?? "?"}] ${truncate(s.content ?? "", 120)}`)
    .join("\n") + "\n";
}

function bulletMemories(list: Memory[] | undefined, limit: number): string {
  if (!list || list.length === 0) return "- _(none)_\n";
  return list
    .slice(0, limit)
    .map((m) => `- (${m.category ?? "?"}) ${truncate(m.content ?? "", 200)}`)
    .join("\n") + "\n";
}

export function formatResumeBrief(p: ResumePayload): string {
  const project = p.project?.tag ?? "_unknown_";
  const ring = p.project?.ring_id ?? "_unresolved_";
  return [
    "## Chorus resume",
    "",
    `**Project:** ${project} (${ring})`,
    `**Summary:** ${p.summary ?? "_(none)_"}`,
    "",
    "**Inbox (now):**",
    bulletSignals(p.inbox_now, 3).trimEnd(),
    "",
    "**Inbox (recent):**",
    bulletSignals(p.inbox_recent, 3).trimEnd(),
    "",
    "**Recent memory:**",
    bulletMemories(p.recent_memory, 5).trimEnd(),
    "",
    `**Next action:** ${p.suggested_next_action ?? "_(none)_"}`,
  ].join("\n");
}
```

- [ ] **Step 4: Run — verify pass**

```bash
bun test tests/format.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add plugins/sophie-chorus/src/format.ts plugins/sophie-chorus/tests/format.test.ts
git commit -m "feat(format): resume_context -> terse markdown brief"
```

---

## Task 9: Ring-id cache (TDD)

**Files:**
- Create: `src/ring-cache.ts`
- Create: `tests/ring-cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ring-cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getCachedRing, setCachedRing } from "../src/ring-cache.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("ring-cache", () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "sophie-chorus-")); });
  afterEach(() => rmSync(tmp, { recursive: true }));

  it("returns null when cache file does not exist", () => {
    expect(getCachedRing("/home/u/demo", { cacheDir: tmp })).toBeNull();
  });

  it("round-trips a ring id for a cwd", () => {
    setCachedRing("/home/u/demo", "ring:abc", { cacheDir: tmp });
    expect(getCachedRing("/home/u/demo", { cacheDir: tmp })).toBe("ring:abc");
  });

  it("keeps independent entries per cwd", () => {
    setCachedRing("/a", "ring:1", { cacheDir: tmp });
    setCachedRing("/b", "ring:2", { cacheDir: tmp });
    expect(getCachedRing("/a", { cacheDir: tmp })).toBe("ring:1");
    expect(getCachedRing("/b", { cacheDir: tmp })).toBe("ring:2");
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
bun test tests/ring-cache.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/ring-cache.ts`**

```ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_CACHE_DIR = join(homedir(), ".claude", "plugins", "cache", "sophie-chorus");
const CACHE_FILE = "rings.json";

export interface CacheOpts {
  cacheDir?: string;
}

function cachePath(opts: CacheOpts): string {
  return join(opts.cacheDir ?? DEFAULT_CACHE_DIR, CACHE_FILE);
}

function readCache(opts: CacheOpts): Record<string, string> {
  const path = cachePath(opts);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

export function getCachedRing(cwd: string, opts: CacheOpts = {}): string | null {
  return readCache(opts)[cwd] ?? null;
}

export function setCachedRing(cwd: string, ringId: string, opts: CacheOpts = {}): void {
  const dir = opts.cacheDir ?? DEFAULT_CACHE_DIR;
  mkdirSync(dir, { recursive: true });
  const current = readCache(opts);
  current[cwd] = ringId;
  writeFileSync(cachePath(opts), JSON.stringify(current, null, 2));
}
```

- [ ] **Step 4: Run — verify pass**

```bash
bun test tests/ring-cache.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add plugins/sophie-chorus/src/ring-cache.ts plugins/sophie-chorus/tests/ring-cache.test.ts
git commit -m "feat(cache): project-ring id cache (keyed by cwd)"
```

---

## Task 10: SessionStart handler (TDD)

**Files:**
- Create: `src/hooks/session-start.ts`
- Create: `tests/hooks/session-start.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/hooks/session-start.test.ts
import { describe, it, expect, spyOn } from "bun:test";
import { runSessionStart } from "../../src/hooks/session-start.ts";

const cfg = { url: "https://chorus.example", apiKey: "k" };

function makeFetchOk(resume: unknown) {
  return () => Promise.resolve(new Response(JSON.stringify({ result: resume }), { status: 200 }));
}

describe("runSessionStart", () => {
  it("emits additionalContext with resume brief for source=startup", async () => {
    spyOn(globalThis, "fetch").mockImplementation(makeFetchOk({
      project: { tag: "demo", ring_id: "ring:abc" },
      summary: "s",
      inbox_now: [], inbox_recent: [], recent_memory: [],
    }) as any);
    const out = await runSessionStart({
      input: { hook_event_name: "SessionStart", cwd: "/home/u/demo", source: "startup" } as any,
      config: cfg,
    });
    expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(out.hookSpecificOutput.additionalContext).toContain("demo");
    expect(out.hookSpecificOutput.additionalContext).toContain("ring:abc");
  });

  it("is a no-op on source=compact (empty additionalContext)", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(makeFetchOk({}) as any);
    const out = await runSessionStart({
      input: { hook_event_name: "SessionStart", cwd: "/x", source: "compact" } as any,
      config: cfg,
    });
    expect(out.hookSpecificOutput.additionalContext).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns empty context on RPC failure (never throws)", async () => {
    spyOn(globalThis, "fetch").mockRejectedValue(new Error("net"));
    const out = await runSessionStart({
      input: { hook_event_name: "SessionStart", cwd: "/x", source: "startup" } as any,
      config: cfg,
    });
    expect(out.hookSpecificOutput.additionalContext).toBe("");
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
bun test tests/hooks/session-start.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/hooks/session-start.ts`**

```ts
import { callChorus } from "../chorus-rpc.ts";
import { formatResumeBrief } from "../format.ts";
import { setCachedRing } from "../ring-cache.ts";
import type { ChorusConfig } from "../config.ts";

export interface SessionStartInput {
  hook_event_name: "SessionStart";
  session_id?: string;
  cwd: string;
  source?: "startup" | "resume" | "clear" | "compact";
  transcript_path?: string;
  model?: string;
}

export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: "SessionStart";
    additionalContext: string;
  };
}

const EMPTY: HookOutput = {
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "" },
};

interface RunOpts {
  input: SessionStartInput;
  config: ChorusConfig;
}

export async function runSessionStart({ input, config }: RunOpts): Promise<HookOutput> {
  if (input.source === "compact") return EMPTY;

  try {
    const resume = await callChorus<any>(config, "chorus_resume_context", { cwd: input.cwd });
    const ringId = resume?.project?.ring_id;
    if (ringId && typeof ringId === "string") {
      try { setCachedRing(input.cwd, ringId); } catch { /* cache miss is fine */ }
    }
    return {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: formatResumeBrief(resume ?? {}),
      },
    };
  } catch (err) {
    process.stderr.write(`sophie-chorus SessionStart failed: ${(err as Error).message}\n`);
    return EMPTY;
  }
}
```

- [ ] **Step 4: Run — verify pass**

```bash
bun test tests/hooks/session-start.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add plugins/sophie-chorus/src/hooks/session-start.ts plugins/sophie-chorus/tests/hooks/session-start.test.ts
git commit -m "feat(hook): SessionStart — resume_context fetch + additionalContext emit"
```

---

## Task 11: SessionStart entrypoint script

**Files:**
- Create: `hooks/session-start.ts`

- [ ] **Step 1: Write the thin entrypoint**

```ts
#!/usr/bin/env bun
import { runSessionStart } from "../src/hooks/session-start.ts";
import { loadConfig } from "../src/config.ts";

async function main() {
  const raw = await Bun.stdin.text();
  let input: any = {};
  try { input = JSON.parse(raw); } catch { /* keep default */ }

  const config = loadConfig();
  if (!config) {
    process.stderr.write("sophie-chorus: no CHORUS_URL/API_KEY — skipping\n");
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "" } }));
    return;
  }

  const out = await runSessionStart({ input, config });
  console.log(JSON.stringify(out));
}

await main().catch((err) => {
  process.stderr.write(`sophie-chorus entrypoint error: ${err}\n`);
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "" } }));
});
```

- [ ] **Step 2: Sanity-check typechecks**

```bash
cd /home/inu/sophie-chorus/plugins/sophie-chorus
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual invoke with fake stdin**

```bash
echo '{"hook_event_name":"SessionStart","cwd":"/tmp","source":"compact"}' | \
  bun run hooks/session-start.ts
```

Expected: `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":""}}` (compact source → empty).

- [ ] **Step 4: Commit**

```bash
cd /home/inu/sophie-chorus
git add plugins/sophie-chorus/hooks/session-start.ts
git commit -m "feat(entrypoint): SessionStart hook entrypoint"
```

---

## Task 12: SessionEnd handler (TDD)

**Files:**
- Create: `src/hooks/session-end.ts`
- Create: `tests/hooks/session-end.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/hooks/session-end.test.ts
import { describe, it, expect, spyOn } from "bun:test";
import { runSessionEnd } from "../../src/hooks/session-end.ts";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cfg = { url: "https://c.example", apiKey: "k" };

function mockFetchCapturing(calls: Array<{ method: string; params: any }>) {
  return spyOn(globalThis, "fetch").mockImplementation(async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    // Resume call (for ring resolution) returns a ring; writes return {}.
    if (body.method === "chorus_resume_context") {
      return new Response(JSON.stringify({ result: { project: { tag: "demo", ring_id: "ring:abc" } } }), { status: 200 });
    }
    return new Response(JSON.stringify({ result: {} }), { status: 200 });
  });
}

describe("runSessionEnd", () => {
  it("writes a briefing memory + emits a sense signal", async () => {
    const calls: any[] = [];
    mockFetchCapturing(calls);
    const tmp = mkdtempSync(join(tmpdir(), "sophie-chorus-"));
    const tpath = join(tmp, "t.jsonl");
    writeFileSync(tpath, JSON.stringify({ role: "user", content: "hi" }));

    await runSessionEnd({
      input: { hook_event_name: "SessionEnd", cwd: "/home/u/demo", reason: "other", transcript_path: tpath } as any,
      config: cfg,
    });

    const methods = calls.map((c) => c.method);
    expect(methods).toContain("chorus_memory_store");
    expect(methods).toContain("chorus_emit_signal");
    const store = calls.find((c) => c.method === "chorus_memory_store");
    expect(store.params.category).toBe("session-briefing");
    expect(store.params.memory_type).toBe("procedural");
    const sig = calls.find((c) => c.method === "chorus_emit_signal");
    expect(sig.params.kind).toBe("sense");

    rmSync(tmp, { recursive: true });
  });

  it("is a no-op on reason=resume", async () => {
    const calls: any[] = [];
    mockFetchCapturing(calls);
    await runSessionEnd({
      input: { hook_event_name: "SessionEnd", cwd: "/x", reason: "resume" } as any,
      config: cfg,
    });
    expect(calls).toHaveLength(0);
  });

  it("never throws on RPC failure", async () => {
    spyOn(globalThis, "fetch").mockRejectedValue(new Error("net"));
    await expect(runSessionEnd({
      input: { hook_event_name: "SessionEnd", cwd: "/x", reason: "other" } as any,
      config: cfg,
    })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
bun test tests/hooks/session-end.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/hooks/session-end.ts`**

```ts
import { callChorus } from "../chorus-rpc.ts";
import { tailMessages } from "../transcript.ts";
import { getCachedRing, setCachedRing } from "../ring-cache.ts";
import type { ChorusConfig } from "../config.ts";

export interface SessionEndInput {
  hook_event_name: "SessionEnd";
  session_id?: string;
  cwd: string;
  reason: "clear" | "resume" | "logout" | "prompt_input_exit" | "bypass_permissions_disabled" | "other";
  transcript_path?: string;
}

interface RunOpts {
  input: SessionEndInput;
  config: ChorusConfig;
}

async function resolveRing(cwd: string, config: ChorusConfig): Promise<{ ringId: string | null; tag: string }> {
  const cached = getCachedRing(cwd);
  if (cached) return { ringId: cached, tag: cwd.split("/").filter(Boolean).pop() ?? "unknown" };
  try {
    const resume = await callChorus<any>(config, "chorus_resume_context", { cwd });
    const ringId = resume?.project?.ring_id ?? null;
    const tag = resume?.project?.tag ?? "unknown";
    if (ringId) setCachedRing(cwd, ringId);
    return { ringId, tag };
  } catch {
    return { ringId: null, tag: "unknown" };
  }
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runSessionEnd({ input, config }: RunOpts): Promise<void> {
  if (input.reason === "resume") return;

  try {
    const { ringId, tag } = await resolveRing(input.cwd, config);
    if (!ringId) {
      process.stderr.write("sophie-chorus SessionEnd: could not resolve project ring, skipping\n");
      return;
    }

    const tail = input.transcript_path ? tailMessages(input.transcript_path, 20) : [];
    const turns = tail.length;
    const content = [
      `Session-end briefing (${tag}).`,
      `Reason: ${input.reason}. Turns tailed: ${turns}.`,
      turns > 0 ? `Last message role: ${tail[tail.length - 1].role ?? "?"}` : "",
    ].filter(Boolean).join("\n");

    await callChorus(config, "chorus_memory_store", {
      namespace: ringId,
      category: "session-briefing",
      memory_type: "procedural",
      entity: tag,
      tags: [tag, "session-end", isoDate()],
      content,
      confidence: 1,
    }).catch((e) => process.stderr.write(`memory_store failed: ${e.message}\n`));

    await callChorus(config, "chorus_emit_signal", {
      ring_id: ringId,
      kind: "sense",
      urgency: 0.3,
      content: `sophie session-end (${input.reason}) — ${turns} turns tailed`,
    }).catch((e) => process.stderr.write(`emit_signal failed: ${e.message}\n`));
  } catch (err) {
    process.stderr.write(`sophie-chorus SessionEnd error: ${(err as Error).message}\n`);
  }
}
```

- [ ] **Step 4: Run — verify pass**

```bash
bun test tests/hooks/session-end.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add plugins/sophie-chorus/src/hooks/session-end.ts plugins/sophie-chorus/tests/hooks/session-end.test.ts
git commit -m "feat(hook): SessionEnd — briefing memory + sense signal"
```

---

## Task 13: SessionEnd entrypoint script

**Files:**
- Create: `hooks/session-end.ts`

- [ ] **Step 1: Write the thin entrypoint**

```ts
#!/usr/bin/env bun
import { runSessionEnd } from "../src/hooks/session-end.ts";
import { loadConfig } from "../src/config.ts";

async function main() {
  const raw = await Bun.stdin.text();
  let input: any = {};
  try { input = JSON.parse(raw); } catch { /* ignore */ }
  const config = loadConfig();
  if (!config) {
    process.stderr.write("sophie-chorus: no config, skipping SessionEnd\n");
    return;
  }
  await runSessionEnd({ input, config });
}

await main().catch((err) => {
  process.stderr.write(`sophie-chorus SessionEnd entrypoint error: ${err}\n`);
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /home/inu/sophie-chorus/plugins/sophie-chorus
bunx tsc --noEmit
cd /home/inu/sophie-chorus
git add plugins/sophie-chorus/hooks/session-end.ts
git commit -m "feat(entrypoint): SessionEnd hook entrypoint"
```

---

## Task 14: PreCompact handler (TDD)

**Files:**
- Create: `src/hooks/pre-compact.ts`
- Create: `tests/hooks/pre-compact.test.ts`

- [ ] **Step 1: Write the failing test**

Same shape as the SessionEnd test — mock fetch, capture calls, assert memory_store category is `pre-compact-insight` and signal kind is `pulse`. Use `trigger: "auto"` in input, assert the tag `auto` appears in memory tags.

```ts
// tests/hooks/pre-compact.test.ts
import { describe, it, expect, spyOn } from "bun:test";
import { runPreCompact } from "../../src/hooks/pre-compact.ts";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cfg = { url: "https://c.example", apiKey: "k" };

function mockFetchCapturing(calls: any[]) {
  return spyOn(globalThis, "fetch").mockImplementation(async (_u: any, init: any) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.method === "chorus_resume_context") {
      return new Response(JSON.stringify({ result: { project: { tag: "demo", ring_id: "ring:abc" } } }), { status: 200 });
    }
    return new Response(JSON.stringify({ result: {} }), { status: 200 });
  });
}

describe("runPreCompact", () => {
  it("writes a pre-compact-insight memory + emits a pulse signal (auto)", async () => {
    const calls: any[] = [];
    mockFetchCapturing(calls);
    const tmp = mkdtempSync(join(tmpdir(), "sophie-chorus-"));
    const tpath = join(tmp, "t.jsonl");
    writeFileSync(tpath, JSON.stringify({ role: "user", content: "hi" }));

    await runPreCompact({
      input: { hook_event_name: "PreCompact", cwd: "/home/u/demo", trigger: "auto", transcript_path: tpath } as any,
      config: cfg,
    });

    const store = calls.find((c) => c.method === "chorus_memory_store");
    const sig = calls.find((c) => c.method === "chorus_emit_signal");
    expect(store.params.category).toBe("pre-compact-insight");
    expect(store.params.tags).toContain("auto");
    expect(sig.params.kind).toBe("pulse");

    rmSync(tmp, { recursive: true });
  });

  it("never throws on failure", async () => {
    spyOn(globalThis, "fetch").mockRejectedValue(new Error("net"));
    await expect(runPreCompact({
      input: { hook_event_name: "PreCompact", cwd: "/x", trigger: "manual" } as any,
      config: cfg,
    })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
bun test tests/hooks/pre-compact.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/hooks/pre-compact.ts`**

```ts
import { callChorus } from "../chorus-rpc.ts";
import { tailMessages } from "../transcript.ts";
import { getCachedRing, setCachedRing } from "../ring-cache.ts";
import type { ChorusConfig } from "../config.ts";

export interface PreCompactInput {
  hook_event_name: "PreCompact";
  session_id?: string;
  cwd: string;
  trigger: "auto" | "manual";
  transcript_path?: string;
  custom_instructions?: string;
}

interface RunOpts {
  input: PreCompactInput;
  config: ChorusConfig;
}

async function resolveRing(cwd: string, config: ChorusConfig): Promise<{ ringId: string | null; tag: string }> {
  const cached = getCachedRing(cwd);
  if (cached) return { ringId: cached, tag: cwd.split("/").filter(Boolean).pop() ?? "unknown" };
  try {
    const resume = await callChorus<any>(config, "chorus_resume_context", { cwd });
    const ringId = resume?.project?.ring_id ?? null;
    const tag = resume?.project?.tag ?? "unknown";
    if (ringId) setCachedRing(cwd, ringId);
    return { ringId, tag };
  } catch {
    return { ringId: null, tag: "unknown" };
  }
}

const isoDate = () => new Date().toISOString().slice(0, 10);

export async function runPreCompact({ input, config }: RunOpts): Promise<void> {
  try {
    const { ringId, tag } = await resolveRing(input.cwd, config);
    if (!ringId) {
      process.stderr.write("sophie-chorus PreCompact: no ring, skipping\n");
      return;
    }

    const tail = input.transcript_path ? tailMessages(input.transcript_path, 40) : [];
    const content = [
      `Pre-compact insight (${tag}, trigger=${input.trigger}).`,
      `Tailed ${tail.length} messages.`,
      input.custom_instructions ? `User compact instructions: ${input.custom_instructions}` : "",
    ].filter(Boolean).join("\n");

    await callChorus(config, "chorus_memory_store", {
      namespace: ringId,
      category: "pre-compact-insight",
      memory_type: "procedural",
      entity: `${tag}-precompact`,
      tags: [tag, "pre-compact", isoDate(), input.trigger],
      content,
      confidence: 1,
    }).catch((e) => process.stderr.write(`memory_store failed: ${e.message}\n`));

    await callChorus(config, "chorus_emit_signal", {
      ring_id: ringId,
      kind: "pulse",
      urgency: 0.2,
      content: `sophie context compacted (${input.trigger}) — briefing stored`,
    }).catch((e) => process.stderr.write(`emit_signal failed: ${e.message}\n`));
  } catch (err) {
    process.stderr.write(`sophie-chorus PreCompact error: ${(err as Error).message}\n`);
  }
}
```

- [ ] **Step 4: Run — verify pass**

```bash
bun test tests/hooks/pre-compact.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add plugins/sophie-chorus/src/hooks/pre-compact.ts plugins/sophie-chorus/tests/hooks/pre-compact.test.ts
git commit -m "feat(hook): PreCompact — pre-compact-insight memory + pulse signal"
```

---

## Task 15: PreCompact entrypoint script

**Files:**
- Create: `hooks/pre-compact.ts`

- [ ] **Step 1: Write the thin entrypoint (parallel to session-end.ts)**

```ts
#!/usr/bin/env bun
import { runPreCompact } from "../src/hooks/pre-compact.ts";
import { loadConfig } from "../src/config.ts";

async function main() {
  const raw = await Bun.stdin.text();
  let input: any = {};
  try { input = JSON.parse(raw); } catch { /* ignore */ }
  const config = loadConfig();
  if (!config) {
    process.stderr.write("sophie-chorus: no config, skipping PreCompact\n");
    return;
  }
  await runPreCompact({ input, config });
}

await main().catch((err) => {
  process.stderr.write(`sophie-chorus PreCompact entrypoint error: ${err}\n`);
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /home/inu/sophie-chorus/plugins/sophie-chorus
bunx tsc --noEmit
cd /home/inu/sophie-chorus
git add plugins/sophie-chorus/hooks/pre-compact.ts
git commit -m "feat(entrypoint): PreCompact hook entrypoint"
```

---

## Task 16: hooks.json wiring

**Files:**
- Create: `plugins/sophie-chorus/hooks/hooks.json`

- [ ] **Step 1: Write `hooks.json`**

```json
{
  "description": "sophie-chorus ambient integration hooks",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/session-start.ts",
            "timeout": 10000
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/session-end.ts",
            "timeout": 10000
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "auto",
        "hooks": [
          {
            "type": "command",
            "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/pre-compact.ts",
            "timeout": 20000
          }
        ]
      },
      {
        "matcher": "manual",
        "hooks": [
          {
            "type": "command",
            "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/pre-compact.ts",
            "timeout": 20000
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/inu/sophie-chorus
git add plugins/sophie-chorus/hooks/hooks.json
git commit -m "feat(hooks): wire SessionStart/End + PreCompact to bun scripts"
```

---

## Task 17: Full test suite pass

- [ ] **Step 1: Run every test**

```bash
cd /home/inu/sophie-chorus/plugins/sophie-chorus
bun test
```

Expected: all tests pass (≈ 15+ assertions across 7 files).

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: If any fail, fix and re-run**

Stop the plan and surface the failure to Inu. Don't fake-pass.

---

## Task 18: README + CHANGELOG finalize

**Files:**
- Modify: `/home/inu/sophie-chorus/README.md`
- Modify: `/home/inu/sophie-chorus/CHANGELOG.md`

- [ ] **Step 1: Rewrite README with install/usage/uninstall**

```markdown
# sophie-chorus

Claude Code plugin — ambient Chorus integration for sophie.

## What it does

Three lifecycle hooks:

| Event | Action |
|---|---|
| `SessionStart` | Fetches `chorus_resume_context(cwd)` and injects a terse markdown brief into Claude's opening context. No-op on `source: compact`. |
| `SessionEnd` | Writes a `session-briefing` memory and emits a `sense` signal to the project ring. No-op on `reason: resume`. |
| `PreCompact` | Writes a `pre-compact-insight` memory and emits a `pulse` signal, so state survives auto-compaction. |

All Chorus traffic goes through the externally-installed `chorus-mcp`
backend (`https://chorus.runclaw.run`). This plugin doesn't spawn its
own MCP server.

## Requirements

- [Bun](https://bun.sh) 1.x on PATH
- Chorus credentials at one of:
  - `$CHORUS_URL` + `$CHORUS_API_KEY` env
  - `~/.claude/secrets/chorus.env`
  - `~/.claude/secrets/chorus.json`

## Install

```
/plugin marketplace add /home/inu/sophie-chorus
/plugin install sophie-chorus@sophie-chorus
```

Open a fresh Claude Code session — SessionStart hook fires automatically
and you should see a Chorus resume brief in the opening context.

## Uninstall

```
/plugin uninstall sophie-chorus@sophie-chorus
/plugin marketplace remove sophie-chorus
```

## Development

```
cd plugins/sophie-chorus
bun install
bun test
bunx tsc --noEmit
```

## Design

See `hermelinChat/.planning/sophie-chorus-plugin.md` for architecture
and `.planning/sophie-chorus-plugin-plan.md` for implementation plan.
```

- [ ] **Step 2: Update CHANGELOG**

```markdown
# Changelog

## [0.1.0] — 2026-04-15

### Added
- `SessionStart` hook — `chorus_resume_context` → `additionalContext`.
- `SessionEnd` hook — `session-briefing` memory + `sense` signal.
- `PreCompact` hook (`auto` + `manual`) — `pre-compact-insight` memory + `pulse` signal.
- 3-tier config loader (env > chorus.env > chorus.json).
- Project-ring-id cache keyed by cwd.
- Bun+TS, no build step, `bun:test` suite.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: README + CHANGELOG for v0.1.0"
```

---

## Task 19: End-to-end validation (manual)

**Depends on:** Inu approving a live install. Do not install without checking.

- [ ] **Step 1: Ask Inu for go-ahead**

> "Ready to install sophie-chorus live — that'll register the plugin in ~/.claude/ and hooks will fire on the next Claude Code session you open. OK to proceed?"

- [ ] **Step 2: Install**

```
/plugin marketplace add /home/inu/sophie-chorus
/plugin install sophie-chorus@sophie-chorus
```

Verify in `~/.claude/settings.json` that `enabledPlugins["sophie-chorus@sophie-chorus"]: true` appears.

- [ ] **Step 3: Fresh-session smoke**

Open a new Claude Code session in `/home/inu/hermelinChat`. The opening turn should contain a "## Chorus resume" section (from `additionalContext`).

- [ ] **Step 4: SessionEnd smoke**

Close the session. In any other session, run:
```
chorus_search_signals(kind=sense, limit=5)
```
Expect a signal with content matching `sophie session-end …`.

- [ ] **Step 5: PreCompact smoke**

In a long session, run `/compact`. After compaction completes:
```
chorus_memory_query(category=pre-compact-insight, limit=3)
```
Expect a fresh entry tagged `manual`.

- [ ] **Step 6: Close bead + update MEMORY**

```bash
bd close hermelinChat-bbj --reason="plugin v0.1.0 shipped, hooks validated live"
```

Store a chorus memory (`category: procedural`, tag `v0.1.0-ship`) noting what's installed and where source lives.

- [ ] **Step 7: Final commit in sophie-chorus repo**

If any tweaks were needed during validation:

```bash
cd /home/inu/sophie-chorus
git add -A
git commit -m "fix: validation tweaks from live smoke"
```

Tag:

```bash
git tag v0.1.0
```

---

## Deferred / out of scope (explicitly)

These are called out in the spec's v2 candidates; do NOT pull them into v1:

- `SubagentStart/Stop` hooks
- Periodic heartbeat via `UserPromptSubmit` counter
- Async synthesis deriver
- Public marketplace publish
- CI

## Success criteria (from spec)

1. Every session I start shows a chorus brief without me asking — zero skipped.
2. Every session close leaves a briefing in chorus — zero skipped.
3. At least one context compaction happened and the pre-compact memory is findable.
4. No session was blocked, slowed, or errored by the plugin.
5. Inu has not had to debug the plugin once.
