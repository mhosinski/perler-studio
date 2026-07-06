# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->


## Session Start

At the beginning of every session, run these steps in order:

**1. Read `docs/GENESIS.md` in full** (use the Read tool — do not truncate with
`sed`/`head`). It holds the original intent: inspirations, philosophy, the *why*
before any code. Ground yourself in it before making any recommendation or
design decision.

**2. Run `bd prime`** — this outputs the full beads workflow reference
(commands, rules, memories). Read the entire output; do not skip or summarize.
Run it manually at the start of every session; there is no reliable startup
hook for this.

```bash
bd prime
```

**3. Load handoff notes** — the last session's mechanics and where to resume.

```bash
bd recall handoff-next-session
```

**4. Read `README.md`** — it is authoritative for user-facing behavior; keep it
that way when behavior changes.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT
complete until `git push` succeeds. (This section is this repository's explicit
opt-in to the team-maintainer profile in the managed Beads block above: agents
close beads, run gates, commit, and push as part of session close. A current
"do not commit"/"do not push" instruction still wins.)

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed):
   ```bash
   node --test                            # full suite; must be green
   node tools/preview.js examples/snowflake.json   # when rendering or startup changed
   ```
   If `tools/core.js` changed, `node tools/embed-core.js` must have been run
   (the drift test enforces this).
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY. Never rebase a dirty tree: fetch,
   check whether the remote is ahead (`git log --oneline main..origin/main`),
   and if it is empty a plain `git push` is a clean fast-forward. Only
   reconcile if the remote has diverged, and never auto-stash user WIP.
   ```bash
   git push
   git status  # MUST show "up to date with origin"
   ```
   Pushing `main` deploys GitHub Pages — publishing is part of "done" here.
   Watch the run and verify the live site per the deploy memory (never re-run
   a failed pages run; dispatch a fresh one). Then sync the tracker:
   ```bash
   bd dolt push
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Update `handoff-next-session` (see shape below)

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

### Handoff Shape

The handoff memory records state and rationale, not tasks — tasks live in beads
issues; the handoff is the bridge that tells the next session which bead to
pick up and what context it needs. There is exactly one handoff (`bd remember
--key` upserts — always current, never a pile of stale ones). Follow this shape:

- **Header line:** date, one-phrase session summary, repo/build state, and any
  **pending gate** (e.g. "user was about to test X; confirm before building on it")
- **WHAT LANDED:** each completed item with its bead ID, key values/decisions,
  and *why* — enough that the next session doesn't re-derive or re-litigate
- **NEXT STEPS in order:** prioritized, with bead IDs; note which beads stay
  open and which are close-eligible pending confirmation
- **PROCESS:** workflow lessons hardened this session — mistakes made and the
  corrected procedure — so process improvements compound

```bash
bd remember "handoff-next-session: <date>, <summary>; <repo state>; <pending gate>. WHAT LANDED: ... NEXT STEPS in order: ... PROCESS: ..." --key handoff-next-session
```

## Parking Work (Deferred Tails)

A feature push typically reaches ~80% before hitting diminishing returns and the
work with higher leverage moves elsewhere. That is a deliberate, healthy pivot —
not abandonment. Park the remaining tail instead of forcing it to completion or
losing track of it.

**To park an initiative's tail** (when it's "good enough for now"):

1. `bd update <remaining open descendant ids> --status deferred` — moves the tail
   out of the active working set. Add a `--reason` noting why/where you stopped.
2. **Keep the epic itself `open` — do NOT close it.** An open epic with done
   children and a deferred tail is the truthful record: substantial work done,
   remainder deliberately on ice. Closing it would read as finished and risk
   `bd epic close-eligible` treating parked work as complete.
3. `bd note <epic>` — one line on what remains and why, so the narrative survives.

**Views** (aliases in `~/.zshrc`):

```bash
bda   # bd list --status open,in_progress,blocked --limit 0  → active set (hides deferred/closed)
bdp   # bd list --status deferred --limit 0                  → parked backlog on demand
```

**To resume:** `bd children <epic>` (or `bdp`), then `bd update <ids> --status open`
to pull items back into the active set.

**Why `deferred`, not `closed`:** `deferred` (frozen) means "deliberately on ice
for later" — it leaves `bda`/`bd ready`, stays local, searchable, and instantly
resurfaceable, and does not inflate an epic's completion. `closed` means *done*;
using it for parked work loses the fact that real items remain.

## Testing Philosophy

Use tests to protect core rules and formulas, not to simulate the full runtime.

In this project the split is sharp: everything in `tools/core.js` — symmetry
orbits, connectivity/contact math, bead expansion and validation, the
quantization pipeline, the share codec — is pure logic that runs under
`node --test` with no browser. That is where tests belong, plus the embed-drift
test that keeps the app's copy of the core honest.

Avoid brittle automated tests for behavior that depends on live browser state:
SVG rendering, pointer/touch gestures, the share sheet, localStorage flows,
layout at breakpoints. For those, use the headless-Chrome harness pattern
(`tools/preview.js` and scratch harnesses that inject a script and screenshot —
see PROCESS notes in past handoffs) plus concise manual smoke-test notes in the
bead or handoff. Real-device iOS checks are a named pending gate when touch
behavior changes.

When adding a feature, extract pure helpers into the core only when it makes
the rule easier to test or reuse. Do not add abstractions solely to satisfy a
test.

## Feature Implementation Order

For every new feature, implement in this sequence (adapted for a serverless
single-file app):

1. Shared constants / palette / schema additions in `tools/core.js`
2. Pure logic in `tools/core.js` (no DOM, no node APIs beyond web-compatible
   globals — the core runs in both browser and node)
3. `node tools/embed-core.js` to re-embed (the drift test enforces this)
4. CLI wrapper in `tools/` when the feature has a scripted use
5. App UI wiring in `index.html` (DOM, events, CSS — thin over the core)
6. Focused `node --test` coverage for rules, formulas, validation, and codecs
7. Headless-Chrome harness screenshot for browser behavior; real-device smoke
   test for touch; deploy and verify the live site

## Build & Test

There is **no build step and no dependency install** — the app is a single
`index.html` that runs from disk. This is a deliberate constraint, not an
omission.

```bash
open index.html                          # run the app (works over file://, offline)
node --test                              # run the test suite (test/, built-in runner, no install)
node tools/inspect.js <pattern.json>     # structure + buildability check; exits 2 on loose islands (--strict for guaranteed-contact only)
node tools/quantize.js <image.png>       # image → pattern JSON (PNG only; see README for flags)
node tools/preview.js <pattern.json>     # render to PNG via headless Chrome ($CHROME overrides the binary)
node tools/embed-examples.js             # REQUIRED after adding/editing examples/*.json — regenerates the embedded block in index.html
node tools/embed-core.js                 # REQUIRED after editing tools/core.js — re-embeds it into index.html (a test enforces this)
```

Run `node --test` before handing off any change to pattern logic, and
`tools/preview.js` when a change affects rendering or app startup.

**Deploy:** pushing to `main` publishes to GitHub Pages via
`.github/workflows/pages.yml`. For user-facing fixes, publishing is part of
"done." If a deploy flakes, do NOT `gh run rerun --failed` (the duplicated
artifact hard-fails the deploy) — trigger a fresh run with
`gh workflow run pages.yml` and verify against
https://mhosinski.github.io/perler-studio/.

## Architecture Overview

AI-assisted perler/fuse-bead pattern design, built on one principle: **an LLM
emits structured pattern JSON; a deterministic renderer draws it.** No AI-generated
imagery of beads, ever.

- **`index.html`** — the entire app: vanilla JS, SVG renderer, no framework.
  Two board geometries (`polar` rings and `square` grid), wedge-symmetry
  expansion (paint one peg, all symmetric copies follow), undo/redo,
  Procreate-style touch gestures, a live fused-connectivity ("holds together")
  check, and a Procreate-style gallery: designs persist continuously to
  `localStorage` (v2 id-keyed store); there is no Save button.
- **`tools/core.js`** — the shared pattern core: the color catalog, symmetry
  expansion, bead-list expansion/validation, the fused-connectivity model
  (contact constants 1.15/1.06), canonical pattern JSON, and the image
  quantization pipeline (`quantizeImage`, used by both the app's "From image"
  button and tools/quantize.js). Single source of truth: embedded into
  `index.html` between `CORE:BEGIN/END` markers (run `node
  tools/embed-core.js` after editing — a test fails on drift) and
  `require()`'d by the node tools. Edit the logic HERE, never in the
  embedded copy.
- **`tools/`** — dependency-free node scripts for the authoring loop:
  edit JSON → `inspect.js` (buildability) → `preview.js` (aesthetics) →
  `embed-examples.js` (ship it in the dropdown).
- **`examples/*.json`** — bundled patterns, embedded into `index.html` at
  build time because `fetch()` can't read local files over `file://`.
- **`test/`** — `node --test` suite covering the core (symmetry orbits,
  connectivity fixtures, expansion validation, embed drift).

The pattern JSON schema, contact model, and calibration notes are documented
in `README.md` — keep it authoritative for user-facing behavior.

## Conventions & Patterns

- **Zero dependencies, everywhere.** No npm packages in the app or in
  `tools/`. New tools must run on bare node; the app must keep working over
  `file://` (script tags are fine; `fetch()` of local files is not — embed at
  build time instead, like the examples).
- **Determinism is the product.** Anything that maps pattern data to pixels
  or to buildability must be exact and reproducible. Randomness, when a
  feature needs it, must be seeded/derived (see the per-peg stripe rotation).
- **Comments explain *why*, not what** — platform quirks (iOS pointer
  capture, Safari storage eviction), invariants (undo must not bleed across
  designs), and non-obvious constants get comments; mechanics don't.
- **Destructive actions stay behind explicit buttons** — no gestures for
  clear/delete, and cleared/deleted state should be recoverable where
  feasible (see `beforeClear`).
- **`localStorage` writes go through read-modify-write** (`readStore` /
  `writeStore`) so a second open tab is never wholesale clobbered.
