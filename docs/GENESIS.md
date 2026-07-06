# GENESIS

*Original intent, recorded 2026-07-06, two days after the first commit, while
the why is still fresh. Agents: read this in full at session start. When a
design decision is ambiguous, this document is the tiebreaker.*

## Why this exists

My wife makes perler bead pieces. The beads, the pegboards, the ironing — the
physical craft is hers. What was missing was the step before the first bead
goes down: getting from "I want to make a snowflake" to a pattern you can
actually follow and actually build.

The obvious move — ask an AI to generate a bead pattern — fails in a specific,
instructive way. Image models hand back a *picture* of beads: smeared,
off-grid, uncountable, unbuildable. Chat models asked to place beads one by
one grind through minutes of enumeration and produce mediocrity (a request for
"a piece of swiss cheese" once took multiple minutes of line-by-line bead
listing, for an unimpressive result). The insight this project is built on:
**let the AI propose structure, never pixels — and let a deterministic
renderer draw it.** The LLM emits pattern JSON; the renderer turns it into
exactly what will sit on the pegboard. Zero AI in the drawing step, ever.

That split turned out to be the whole product. Everything since — the
symmetry system, the buildability checker, the image quantizer, sharing — is
that one principle growing new limbs.

## What matters most

**Usability and simplicity outrank everything else.** That is the explicit
ranking, and it is the one thing that should survive any rewrite.

The project's well-known technical constraints — no server, single
`index.html`, zero dependencies, deterministic output, physical-truth
rendering — are *not* sacred. They are the current means to usability and
simplicity, and they have earned their keep so far: no server means nothing to
maintain and nothing between my wife and her patterns; a single file means it
works offline at the craft table; determinism means the screen never lies
about what the board will look like. Each constraint stands while it serves
the ranking and falls the day it fights it. If a future feature genuinely
needs a server to be *simpler to use*, the server wins.

Corollary for agents: when a proposal trades usability away to preserve an
architectural purity, the proposal is wrong. Argue from the person at the
craft table, not from the codebase.

## Who it's for, and what success looks like

In order:

1. **My wife.** Success is her reaching for this unprompted when she starts a
   piece — the tool disappearing into the hobby. Finished, ironed pieces on
   the table that wouldn't exist without it.
2. **Our household.** Designs texted back and forth, patterns made together.
3. **A distant third: anyone else.** It's public and free (MIT, GitHub
   Pages), and if strangers find it useful, wonderful — but no feature should
   ever be justified by hypothetical users at the expense of the real ones.

## What this is deliberately NOT

**Not a product.** No monetization, no growth goals, no analytics, no
engagement mechanics, no roadmap-by-market. It is a personal tool that
happens to be public. Decisions get made by what makes the craft better, not
by what a product manager would do.

Softer leanings (current posture, not walls): it's bead-first rather than a
general pixel editor — the palette is a real catalog, the boards are real
boards, buildability is a first-class concern. Sharing is person-to-person
links, not a community feed. AI is an on-ramp, not a dependency — the app is
fully useful with no AI in the loop.

## Reference points

- **Procreate** is the UX north star for the editing experience: the gallery
  model (no Save button, no unsaved state), the touch gestures (two-finger
  tap undo), destructive actions kept deliberately out of reach of gestures.
- **The real craft supplies the physics.** The contact model (what fuses when
  ironed), board calibration ("pegboards are not standardized across
  brands"), bead counts for shopping — the app models the hobby as it
  actually is, circular mandala/doily boards included. The founding demo was
  a wagon-wheel mandala recreated from a photo of a real piece.
