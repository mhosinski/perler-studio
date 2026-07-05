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


## Build & Test

There is **no build step and no dependency install** — the app is a single
`index.html` that runs from disk. This is a deliberate constraint, not an
omission.

```bash
open index.html                          # run the app (works over file://, offline)
node --test                              # run the test suite (test/, built-in runner, no install)
node tools/inspect.js <pattern.json>     # structure + buildability check; exits 2 on loose islands (--strict for guaranteed-contact only)
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
- **`tools/core.js`** — the shared pattern core: symmetry expansion,
  bead-list expansion/validation, and the fused-connectivity model
  (contact constants 1.15/1.06). Single source of truth: embedded into
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
