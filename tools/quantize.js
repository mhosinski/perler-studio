#!/usr/bin/env node
// Image → pattern JSON from the command line. The pipeline itself (sampling,
// Lab k-means, catalog mapping, symmetry voting, island handling) lives in the
// shared core — the app's "Import image" runs the exact same code; this
// wrapper just adds PNG decoding (node has no canvas) and flag parsing.
//
// Usage: node tools/quantize.js <image.png> [options]
//   --board square:WxH | polar:N   target board (default square:29x29)
//   --colors N                     max palette colors in the result (default 8)
//   --sym F | F,mirror             polar only: enforce fold symmetry by
//                                  majority-voting each symmetry orbit
//   --bg auto | #rrggbb | none     treat this color as empty pegs (default
//                                  none; transparent pixels are always empty)
//   --fit contain | cover | stretch  how the image maps to the board (default
//                                  contain: preserve aspect, letterbox with
//                                  empty pegs; cover crops; stretch distorts)
//   --drop-islands                 keep only the largest connected component
//   --out file.json                write pattern JSON (default: stdout)
//
// Deterministic throughout: same image + flags = same pattern.
'use strict';
const fs = require('fs');
const core = require('./core.js');
const png = require('./png.js');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
function opt(name, dflt) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
}
if (!file) {
  console.error('usage: node tools/quantize.js <image.png> [--board square:WxH|polar:N] [--colors N] [--sym F[,mirror]] [--bg auto|#hex|none] [--drop-islands] [--out file.json]');
  process.exit(1);
}

const boardSpec = opt('board', 'square:29x29');
const m = boardSpec.match(/^square:(\d+)x(\d+)$/) || boardSpec.match(/^polar:(\d+)$/);
if (!m) { console.error(`bad --board "${boardSpec}" (square:WxH or polar:N)`); process.exit(1); }
const board = boardSpec.startsWith('square')
  ? { type: 'square', name: `square-${m[1]}x${m[2]}`, width: +m[1], height: +m[2] }
  : { type: 'polar', name: 'circle-' + m[1], rings: Array.from({ length: +m[1] }, (_, r) => r === 0 ? 1 : 6 * r) };

const bg = opt('bg', 'none');
if (bg !== 'none' && bg !== 'auto' && !/^#[0-9a-f]{6}$/i.test(bg)) {
  console.error(`bad --bg "${bg}" (auto, #rrggbb, or none)`); process.exit(1);
}
const fit = opt('fit', null);
if (fit && !['contain', 'cover', 'stretch'].includes(fit)) {
  console.error(`bad --fit "${fit}" (contain, cover, or stretch)`); process.exit(1);
}
let sym = null;
{
  const s = opt('sym', null);
  if (s) {
    if (board.type !== 'polar') { console.error('--sym only applies to polar boards'); process.exit(1); }
    const sm = s.match(/^(\d+)(,mirror)?$/);
    if (!sm) { console.error(`bad --sym "${s}" (F or F,mirror)`); process.exit(1); }
    sym = { fold: +sm[1], mirror: !!sm[2] };
  }
}

const img = png.decode(fs.readFileSync(file));
const { beads, islands, droppedBeads } = core.quantizeImage(img, board, {
  colors: +opt('colors', 8) || 8,
  bg, sym, fit,
  dropIslands: args.includes('--drop-islands'),
});
if (!beads.size) { console.error('nothing to quantize — image fully transparent or all background'); process.exit(1); }
if (droppedBeads) console.error(`dropped ${droppedBeads} island bead(s)`);
if (islands) console.error(`warning: ${islands} loose island(s) won't fuse to the main piece — re-run with --drop-islands to remove, or fix by hand in the app`);

const tally = new Map();
for (const c of beads.values()) tally.set(c, (tally.get(c) || 0) + 1);
console.error(`${beads.size} beads, ${tally.size} colors: ` +
  [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}(${n})`).join(' '));

const pattern = core.patternJSON(board, beads);
const outFile = opt('out', null);
if (outFile) { fs.writeFileSync(outFile, JSON.stringify(pattern, null, 1)); console.error('wrote ' + outFile); }
else console.log(JSON.stringify(pattern, null, 1));
