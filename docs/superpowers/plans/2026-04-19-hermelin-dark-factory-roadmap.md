# hermelin Dark Factory Roadmap

> For overnight Hermes work in an isolated worktree. Use this roadmap as the durable mission bundle, not as a vague aspiration list.

## Mission

Move hermelinChat forward rhythmically while Inu sleeps:
- one honest slice at a time
- verification after each slice
- commit and push when healthy
- leave clear notes so morning review is fast

The point is not theatrical autonomy. The point is steady shipped movement.

## Current grounding

Repo: `/home/inu/hermelinChat`
Primary branch: `feat/v2-phase1`
Product direction: Aurora-first desktop house for Hermes, with first-class workspaces, honest continuity, real tools, and room for agent-native CLI surfaces.

Already landed recently:
- workspace strip / continuity slices
- right-pane stack shell
- real Plan/Tasks pane content from live bd + dark-factory context
- startup interstitial continuity improvements

## Finish line for this overnight stream

By morning, the ideal outcome is not “everything done.”
It is:
1. at least one more real shipped slice, pushed
2. notes that explain exactly what moved, what was verified, and what the next move is
3. no fake status, no hidden breakage, no stranded local-only work pretending to be progress

## Hard rules

1. Keep slices small and landable.
2. Do not rewrite the shell from scratch.
3. Preserve honesty in continuity language and recovery UX.
4. Use bd for discovered work and status changes.
5. Run focused verification first, then broader verification before ending a slice.
6. Commit and push healthy work.
7. If blocked, write the block plainly in `.dark-factory/notes.md` and stop instead of thrashing.
8. Prefer one real merged-quality improvement over three half-finished branches of thought.

## Workstream order

### 1. Trustworthy startup and continuity shell

Highest-value near-term slices if still unfinished or rough:
- `hermelinChat-o46` — connection interstitial: progress, trust, recovery affordances
- continuity polish where restored workspace, session, and surfaces must not contradict each other
- any small verification/hardening slice that makes startup behavior clearer in real Tauri

Selection rule:
- take the smallest slice that increases user trust at startup without reopening architecture

Definition of done for a slice:
- behavior is clearer in UI
- tests/builds pass
- notes explain what changed and how it was verified

### 2. Agent-native CLI workspace substrate

Primary exploration target after startup shell is not the sharpest win:
- `hermelinChat-5mz` — mount CLI-Anything style harnesses as hermelin tools
- `hermelinChat-678` — extend workspace/artifact bridge with workspace and pane control affordances

What “progress” means here:
- not hand-wavy research
- a concrete design or implementation slice that makes hermelin more able to host self-describing CLIs
- examples: a roadmap/spec clarification, a thin substrate, a mounted tool-session concept, or one narrow bridge API improvement

Selection rule:
- choose the smallest slice that makes CLI-native workspaces more real, not more conceptual

### 3. High-leverage shell polish

Good fallback slices when the above are blocked:
- `hermelinChat-0k4` — live pane/window headers: branch, cwd, token budget, last activity
- `hermelinChat-ec2` — per-server MCP App theme override toggle
- `hermelinChat-bip` only if its dependency path is honestly ready

Selection rule:
- prefer visible, testable, low-drift improvements

## Decision rubric for each cycle

At the start of each cycle:
1. inspect `bd ready --json`
2. inspect repo state and current notes
3. choose exactly one slice
4. state in notes why that slice was chosen over the others

During the cycle:
1. implement the smallest real change
2. run targeted tests
3. run broader verification appropriate to the slice
4. commit if healthy
5. push if healthy
6. update notes with result and next move

At the end of the cycle:
- if work is still moving honestly, choose the next slice
- if movement has stalled or the repo is in a good pushed state, stop

## Preferred rhythm

The rhythm we want:
- inspect
- choose
- implement
- verify
- commit
- push
- note
- sleep

No hype. No giant refactors at 3am. Just tempo.

## Known constraints

- Root untracked files `.claude/` and `AGENTS.md` are intentional and should be left alone.
- Avoid parallel edits on the same hot files.
- Tauri/browser differences matter for startup behavior; trust desktop truth over browser-only impressions.
- Rust tests that mutate process-global env vars need serialization discipline.

## Suggested first picks tonight

Priority order:
1. `hermelinChat-o46` if there is still a sharp trust/clarity gap at startup
2. `hermelinChat-5mz` if startup is already in a decent place and we want the next substrate move
3. `hermelinChat-0k4` for a clean, high-signal shell upgrade

## Stop conditions

Stop the overnight run when any of these become true:
- a clean pushed slice is landed and the next move is genuinely ambiguous
- the next candidate slice requires user taste/input that cannot be recovered from repo context
- verification reveals breakage that cannot be fixed honestly in the same session
- the worker starts looping without real delta

## Morning handoff format

Leave notes with these sections:
- What shipped
- What passed
- What failed
- What was learned
- Exact next move

That is the whole game.