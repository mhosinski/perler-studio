# Security Posture — Perler Studio

*Written 2026-08-15. Answers the six questions in
`ai-toolkit/project-seed/SECURITY-baseline.md`; re-verify at each milestone
(§6). Companion to `docs/GENESIS.md` (intent: a personal tool that happens to
be public — no server, no accounts, no analytics) and CLAUDE.md (how). Hard
rules are the bd memories `rule-secrets-out-of-band` and
`rule-untrusted-content-to-agents`; this doc holds the specifics. Short by
design: there is little here to protect, and this doc says so rather than
inventing controls.*

## 1. Data — what's sensitive, where it lives, who can reach it

**What we hold.** Bead patterns — board geometry plus a list of `[position,
color-id]` pairs — and the names their author gave them. No accounts, no
personal data, no purchase or contact information. The only "whose" is
household craft designs, and the founding intent is that they are shared as
links.

**Where it lives.**

- **The user's own browser.** Designs persist in `localStorage`
  (`perler-studio:designs2`, `perler-studio:active`; legacy
  `perler-studio:designs` / `perler-studio:current` migrated on load). Never
  uploaded: the app makes **no network calls at all** — no `fetch`, no XHR,
  no third-party scripts (verified 2026-08-15 by grep of `index.html`; the
  only URLs in the file are the SVG namespace and the site's own base for
  share links).
- **Share links.** The whole pattern travels gzip+base64url in the URL
  *fragment* (`#d=<token>`), which browsers never send to the server —
  GitHub Pages sees the path only. A PNG of the board may go along through
  the native share sheet, at the sender's choice.
- **The repo — public.** `github.com/mhosinski/perler-studio` is public
  (MIT). Everything committed is world-readable, and that includes the
  tracked beads files (`.beads/config.yaml`, `.beads/interactions.jsonl`,
  `.beads/hooks/*`) **and the beads database itself**, which `bd dolt push`
  publishes to `refs/dolt/data` on the same remote: issues, notes, memories
  and the `handoff-next-session` text are public. Nothing private belongs in
  a bead here — not a path with a name in it, not a device detail, not a
  token. Gitignored and never tracked: `.beads/dolt/`, `.beads/backup/`,
  `.beads-credential-key`, `.env*`, key material (`gitignore-baseline`).
- **The live site.** `https://mhosinski.github.io/perler-studio/`, static
  files served by GitHub Pages from `main`. It holds only the app and the
  bundled `examples/*.json`.

**Retention.** Nothing server-side to prune. `localStorage` is the user's to
clear (Delete in the gallery, or the browser's site data); Safari may evict
it on its own, which is why the app treats the gallery as continuous save
and share links as the backup path.

## 2. Secrets — inventory and rotation

The project itself has **no secrets**: no API keys, no tokens, no passwords,
no service accounts. The LLM step is the human copy-pasting a generated
prompt into a chatbot of their choice — no provider key ever enters the app
or the repo. What remains is the authority to publish:

| Key | Lives in | Scope / purpose | Rotate how; consequence |
| --- | -------- | --------------- | ----------------------- |
| GitHub SSH key + `gh` auth | Mike's Mac (`~/.ssh`, `gh auth`) — never in the repo | Push to `main` (= deploy the public site), `gh workflow run pages.yml`, `bd dolt push` | Revoke the key / `gh auth logout` in GitHub settings, generate a new one. Consequence: no deploys until re-added; the site keeps serving the last build. |
| GitHub Actions OIDC token | Minted per run by GitHub (`id-token: write`, `pages: write`, `contents: read`) | Lets `actions/deploy-pages@v4` publish the artifact | Not stored anywhere; nothing to rotate. |
| `.beads-credential-key` | Would live in `.beads/` (gitignored by bd and by the seed baseline) | bd federation peer auth — not in use here | n/a. |

Local dev copies: none. Secret scanning: gitleaks pre-commit appended to
`.beads/hooks/pre-commit` by the seed's `install-hooks.sh` (2026-08-15) —
the backstop; `rule-secrets-out-of-band` is the plan.

## 3. Access — what gates each surface

- **Readers:** everyone. The site is public and unauthenticated by design
  (GENESIS: "public and free"). There is no login, no session, no cookie,
  no per-user state beyond the browser's own `localStorage`. **Every path is
  ungated**, and that is the complete list — a future path that *needs* a
  gate (an upload, an account) is a design change that reopens §1–§4, not a
  patch.
- **Writers:** the repo's collaborators — Mike alone. `main` deploys through
  `.github/workflows/pages.yml` into the `github-pages` environment; nothing
  deploys from any other branch. Branch protection is not configured (solo
  repo, no CI gate; see the finding in §6).
- **Sessions/tokens:** none.

## 4. Trust boundaries — third parties and agents

**External services** — the whole list is GitHub: the repo, Actions (the
deploy runner) and Pages (the host). The app talks to nothing at runtime.
Chatbots (Claude, ChatGPT, Gemini) are used *by the human*, by copy-paste,
outside the app; the app has no connector, no key, and works fully with no
AI in the loop (GENESIS: "AI is an on-ramp, not a dependency"). Headless
Chrome (`tools/preview.js`, `$CHROME`) renders a local temp file — no
network.

**What agents may do here without asking:** commit and push (CLAUDE.md
Session Completion is the explicit team-maintainer opt-in) — and pushing
`main` **is** publishing to a public URL, so a push is a deploy; dispatch a
fresh Pages run (`gh workflow run pages.yml`, never re-run a failed one);
`bd dolt push`. **Must confirm first:** adding *any* dependency or network
call (both are architecture changes under "Zero dependencies, everywhere"
and "no server"), changing repo visibility or GitHub settings, editing the
workflow's `permissions`, force-pushing. **Never:** commit anything from
`~/.ssh`, `gh` config, or a chatbot session transcript; write a secret or a
private detail into a bead (public, §1).

**Authority held by automated agents/routines:** none beyond a Claude Code
session on the Mac. There is no cloud routine, bot, or scheduled job. The
Actions workflow has `contents: read` and cannot write to the repo.

**Untrusted content and the control that bounds it** — the app is
client-side, so "agent with authority" here means the app itself acting on
the user's gallery, and the Claude Code session acting on the repo:

| Input | Origin | Bound by |
| ----- | ------ | -------- |
| Share links (`#d=…`) | anyone who sends one | `decodeShare` → `unpackShare` → the same validator as pasted JSON: board type/dimensions checked, `expandBeads` drops any bead whose color is not a catalog id or a strict `#rrggbb`; names are `String(...).slice(0,40)` and rendered via `textContent`. The only `innerHTML` sinks (bead counts, connectivity notes) receive catalog names and integers, never input text. Result: opening a hostile link can at worst add a junk design to the gallery, which Delete removes. |
| Pasted LLM JSON, imported gallery JSON, imported images | the user's own chatbot / files | Same validator; images are decoded by the browser's `<img>`/canvas, quantized locally, never uploaded. |
| Repo content read by an agent (README, GENESIS, beads, examples) | household-authored | Not outside content today. If a stranger's issue/PR ever feeds a session, treat it as data (`rule-untrusted-content-to-agents`); the human review before push is the control. |

**The toolchain itself:** `bd` hooks in `.beads/hooks/` (third-party OSS,
marker-managed, tracked), `.claude/settings.json` (`bd prime --hook-json`
on SessionStart), `.codex/hooks.json` (`bd codex-hook …`),
`.agents/skills/beads` (installed by `bd setup codex`), and the global
`ai-toolkit` hooks — all from bd or our own repo. GitHub Actions used:
`actions/checkout@v4`, `configure-pages@v5`, `upload-pages-artifact@v3`,
`deploy-pages@v4`, pinned by major tag (§6). No MCP servers or connectors
are needed for this project; leave them unauthenticated.

## 5. Dependencies and supply chain

**Zero runtime or dev dependencies — deliberately.** No `package.json`, no
lockfile, no install step; the app is one `index.html`, the tools run on bare
Node (built-ins only: `fs`, `path`, `os`, `zlib`, `child_process`; PNG
decoding is the hand-rolled `tools/png.js` over `node:zlib`). Local Node is 24.x; nothing
pins it (`engines`/`.nvmrc` would be the first thing to add if a tool ever
needs a Node feature). The entire supply chain is therefore: the browser,
Node, headless Chrome for previews, and the four GitHub Actions above on
`ubuntu-latest`. Band per `feedback-surface-dependency-debt`: n/a for
packages; at each checkpoint glance at the four actions' current majors and
Node's LTS line. No audit tool applies; no `docs/DEPENDENCIES.md`.

## 6. Review cadence and incident notes

**Milestone checkpoint** (same moment as the come-up-for-air review):
re-read this doc against reality — a network call? a dependency? a new
input format? a new agent authority? — then `/security-review` on the
milestone's diff; findings become beads and the checkpoint date is updated
below.

**If something breaks / leaks:**

1. Bad or unwanted deploy → `git revert`, push, verify the live site (a
   fresh `gh workflow run pages.yml` if Pages flakes).
2. Mac or SSH key in question → revoke the key in GitHub, `gh auth logout`,
   re-key; nothing else holds deploy authority.
3. A secret or private detail lands in a commit or a bead → it is public
   the moment it is pushed; rotate it *at its source* and rewrite only if
   the value is still live — the repo history and `refs/dolt/data` are not
   reliably scrubbable. Who to tell: nobody's data but ours is here.

Where to look: `gh run list --workflow pages.yml`, `git log`,
`.beads/interactions.jsonl` (the tracker's audit trail).

**Findings log:**

| Date | Finding | Disposition |
| ---- | ------- | ----------- |
| 2026-08-15 | Repo is public and beads sync publishes the whole tracker (issues, notes, memories, handoff) to `refs/dolt/data`; `.beads/interactions.jsonl` is tracked | Accepted — nothing private has business here; recorded so `rule-secrets-out-of-band` is read as covering beads too |
| 2026-08-15 | Share links and pasted JSON are outside input into a client-side app; traced every `innerHTML` sink | No issue — colors are catalog-validated before they reach a sink, names go through `textContent`; documented as the control |
| 2026-08-15 | GitHub Actions pinned by major tag, not SHA; no branch protection | Accepted — workflow holds no secrets and only `contents: read`; worst case is a bad build of a public static site, reverted by a push |
| 2026-08-15 | No secrets to rotate; no network calls; gitleaks pre-commit installed | — |

*Last checkpoint: 2026-08-15 — first application of the seed's posture
questions; no code changes required.*
