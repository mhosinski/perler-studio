# Perler Pattern Studio

A proof-of-concept for AI-assisted perler/fuse-bead pattern design that actually works,
built on one principle: **the LLM emits structured data; a deterministic renderer draws
the picture.** No AI-generated images of beads, ever — that's how you get smeared,
off-grid, uncountable "beads."

## Quick start

Open `index.html` in a browser. No build step, no dependencies, works offline.

```
open index.html
```

It loads with a demo pattern (inspired by a real circular-board mandala) so you can see
the renderer working immediately. The **Example** dropdown in the sidebar loads any of
the bundled patterns from `examples/`.

> Because the app runs over `file://`, it can't fetch `examples/*.json` at runtime —
> the examples are embedded into `index.html` at build time. After adding or editing an
> example, run `node tools/embed-examples.js` to refresh the dropdown.

## How it works

```
board template (JSON)  ─┐
                        ├─►  deterministic SVG renderer  ─►  buildable pattern
bead assignments (JSON) ─┘        (zero AI in this step)
```

1. **Board templates.** Two geometries:
   - `polar` — circular pegboards. Pegs live on concentric rings; ring `r` has
     `rings[r]` pegs, evenly spaced, index 0 at 12 o'clock, clockwise. The default
     template is 14 rings with 6·n pegs per ring (547 pegs), which matches the
     6-fold-symmetric layout of typical circular boards.
   - `square` — classic square pegboards (the standard interlocking Perler plate
     is 29×29).
2. **Patterns are peg→color assignments**, using colors from an embedded catalog of
   ~46 named Perler colors (screen hexes are approximations).
3. **The renderer** converts `(ring, index)` to `(x, y)` with basic trig and draws
   donut-shaped beads as SVG. What you see is exactly what you build.

## The LLM workflow

1. Set up your board (type, ring count) and click **Copy LLM prompt**. This generates
   a complete prompt containing the exact board definition, the allowed color ids, the
   output schema, and the symmetry rules — with a `<DESCRIBE THE DESIGN YOU WANT HERE>`
   slot at the end.
2. Paste it into any chatbot (Claude, ChatGPT, Gemini), fill in the design request.
3. Paste the JSON it returns into the text panel and click **Load JSON from text**.
4. Judge the render, edit by hand or ask the model for revisions, repeat.

### Symmetry is the killer feature

Circular boards are made for mandalas, and the pattern format supports specifying just
one wedge:

```json
{ "symmetry": { "fold": 6, "mirror": true },
  "beads": [ { "ring": 5, "index": 2, "color": "light-blue" } ] }
```

That one bead becomes 12 (6 rotations × mirror). The LLM only has to get a single 60°
wedge right and perfect symmetry is guaranteed by construction. See
`examples/snowflake.json` — 17 wedge beads expand to a full snowflake — and the three
doily samples (`classic-doily`, `rose-doily`, `winter-doily`), each defined in ~30-40
wedge beads.

### Physical connectivity matters

A fused piece only holds together where beads touch: along contiguous arcs within a
ring, and radially where pegs of adjacent rings line up (which is guaranteed along the
symmetry spokes). Isolated beads and floating mid-wedge islands literally fall off
after ironing. The doily examples follow this rule — solid anchor rings, eyelet bands
cut into solid bands, arcs anchored to spoke columns, and rim scallops whose endpoints
meet the shoulder arcs — and the generated LLM prompt instructs models to do the same.
`tools/inspect.js` checks this automatically.

The same symmetry tools work for hand-painting: set Fold/Mirror in the sidebar and
every peg you paint places all its symmetric copies.

## Pattern JSON schema

```json
{
  "version": 1,
  "board": {
    "type": "polar",
    "name": "circle-14",
    "rings": [1, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78]
  },
  "symmetry": { "fold": 6, "mirror": false },
  "beads": [
    { "ring": 2, "index": 5, "color": "orange" }
  ]
}
```

- Square boards use `{ "type": "square", "width": 29, "height": 29 }` and beads use
  `{ "row": r, "col": c, "color": "..." }`.
- `symmetry` is optional and only used at import time to expand a wedge; exported JSON
  is always the fully expanded ground truth.
- `color` is a palette id (see the sidebar swatch titles) or a raw `#rrggbb` hex.

## Calibrating to a real board

Pegboards are **not standardized across brands**, especially shaped ones. To match a
real circular plate:

1. Count the rings on the physical board (including the center peg).
2. Count the pegs on two or three rings. If ring *n* has 6·n pegs, the default template
   is already correct — just set the ring count.
3. If not, expand "Custom pegs-per-ring" and enter the exact counts, e.g.
   `1,6,12,18,24,...`, then **Rebuild board**.

Everything downstream (renderer, symmetry, LLM prompt) adapts automatically.

## Tools

Dependency-free node scripts in `tools/`, extracted from the design-iteration loop:

- `node tools/inspect.js <pattern.json> [--strict]` — expands wedge symmetry exactly
  like the app and prints per-ring occupancy, color counts, and a **connectivity
  check** (connected components by physical bead contact). Exits non-zero if beads
  would fall off after fusing. The default threshold counts stagger contact between
  adjacent rings (ironing spreads beads); `--strict` counts only guaranteed contact,
  useful as an "iron this part carefully" warning.
- `node tools/preview.js <pattern.json> [out.png]` — renders a pattern to PNG through
  the app's own renderer via headless Chrome (`$CHROME` overrides the binary path).
  This is the previz loop: author JSON → preview → adjust, no browser clicking.
- `node tools/embed-examples.js` — regenerates the embedded examples block in
  `index.html` from `examples/*.json`.

The recommended authoring loop for new patterns: edit JSON → `inspect` (structure +
buildability) → `preview` (aesthetics) → embed.

## Ideas for the next iteration

- Image → pattern quantizer (deterministic: downsample + nearest-palette-color; polar
  sampling for circular boards). No LLM needed for this mode.
- Restrict the palette to owned colors + inventory counts ("do I have 96 white beads?").
- More board shapes (hexagon, heart, star plates) — each is just a new template.
- Printable build sheet: ring-by-ring bead list for following along while placing.
- PNG export.

## License

MIT — see [LICENSE](LICENSE).
