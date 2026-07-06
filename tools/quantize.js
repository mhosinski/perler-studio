#!/usr/bin/env node
// Image → pattern JSON: deterministically resample a raster image onto the
// peg grid. The AI (or a camera) produces reference imagery; this quantizer
// produces the buildable pattern — same principle as the renderer split.
//
// Usage: node tools/quantize.js <image.png> [options]
//   --board square:WxH | polar:N   target board (default square:29x29)
//   --colors N                     max palette colors in the result (default 8)
//   --sym F | F,mirror             polar only: enforce fold symmetry by
//                                  majority-voting each symmetry orbit
//   --bg auto | #rrggbb | none     treat this color as empty pegs (default
//                                  none; transparent pixels are always empty)
//   --drop-islands                 keep only the largest connected component
//   --out file.json                write pattern JSON (default: stdout)
//
// Pipeline: area-average each peg's image region (in linear RGB, so edges
// don't darken) → CIELAB → k-means down to --colors clusters FIRST → map each
// cluster to the nearest catalog color → NO dithering (dither noise reads as
// random beads on a pegboard). Deterministic throughout: same image + flags =
// same pattern.
'use strict';
const fs = require('fs');
const core = require('./core.js');
const png = require('./png.js');

/* ---------------- CLI ---------------- */
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
let board;
{
  const m = boardSpec.match(/^square:(\d+)x(\d+)$/) || boardSpec.match(/^polar:(\d+)$/);
  if (!m) { console.error(`bad --board "${boardSpec}" (square:WxH or polar:N)`); process.exit(1); }
  board = boardSpec.startsWith('square')
    ? { type: 'square', name: `square-${m[1]}x${m[2]}`, width: +m[1], height: +m[2] }
    : { type: 'polar', name: 'circle-' + m[1], rings: Array.from({ length: +m[1] }, (_, r) => r === 0 ? 1 : 6 * r) };
}
const nColors = Math.max(2, Math.min(24, +opt('colors', 8) || 8));
const bgSpec = opt('bg', 'none');
const dropIslands = args.includes('--drop-islands');
let sym = { fold: 1, mirror: false };
{
  const s = opt('sym', null);
  if (s) {
    if (board.type !== 'polar') { console.error('--sym only applies to polar boards'); process.exit(1); }
    const m = s.match(/^(\d+)(,mirror)?$/);
    if (!m) { console.error(`bad --sym "${s}" (F or F,mirror)`); process.exit(1); }
    sym = { fold: +m[1], mirror: !!m[2] };
  }
}

/* ---------------- Color math (sRGB <-> linear <-> CIELAB, D65) ---------------- */
const s2l = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
function linToLab(r, g, b) {
  // linear RGB -> XYZ (D65) -> Lab
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const hexToLab = hex => linToLab(s2l(parseInt(hex.slice(1, 3), 16)), s2l(parseInt(hex.slice(3, 5), 16)), s2l(parseInt(hex.slice(5, 7), 16)));
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/* ---------------- Sampling ---------------- */
const { width: W, height: H, pixels } = png.decode(fs.readFileSync(file));

// Fit the board's bounding box to the image's central square (polar) or the
// full frame (square), then area-average each peg's cell in linear RGB with
// alpha weighting. Returns null when the cell is mostly transparent.
function samplePegs() {
  const out = new Map(); // key -> {lab, rgb}
  const cells = [];
  if (board.type === 'square') {
    for (let r = 0; r < board.height; r++) for (let c = 0; c < board.width; c++) {
      cells.push({
        key: r + ',' + c,
        x0: c * W / board.width, x1: (c + 1) * W / board.width,
        y0: r * H / board.height, y1: (r + 1) * H / board.height,
      });
    }
  } else {
    const R = board.rings.length - 0.5;         // board radius in pitch units
    const side = Math.min(W, H);
    const scale = side / (2 * R);               // px per pitch
    const cx = W / 2, cy = H / 2, half = scale / 2;
    for (const [key] of pegKeys()) {
      const [px, py] = core.pegXY(board, key);
      const x = cx + px * scale, y = cy + py * scale;
      cells.push({ key, x0: x - half, x1: x + half, y0: y - half, y1: y + half });
    }
  }
  for (const cell of cells) {
    const x0 = Math.max(0, Math.floor(cell.x0)), x1 = Math.min(W, Math.ceil(cell.x1));
    const y0 = Math.max(0, Math.floor(cell.y0)), y1 = Math.min(H, Math.ceil(cell.y1));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      const w = pixels[i + 3] / 255;
      r += s2l(pixels[i]) * w; g += s2l(pixels[i + 1]) * w; b += s2l(pixels[i + 2]) * w;
      a += w; n++;
    }
    if (!n || a / n < 0.5) continue; // mostly transparent -> empty peg
    const rgb = [r / a, g / a, b / a];
    out.set(cell.key, { rgb, lab: linToLab(...rgb) });
  }
  return out;
}
function pegKeys() {
  const out = [];
  if (board.type === 'polar') {
    board.rings.forEach((count, r) => { for (let i = 0; i < count; i++) out.push([r + ',' + i]); });
  } else {
    for (let r = 0; r < board.height; r++) for (let c = 0; c < board.width; c++) out.push([r + ',' + c]);
  }
  return out;
}

/* ---------------- Deterministic k-means in Lab ---------------- */
function kmeans(points, k) {
  if (points.length <= k) return points.map(p => p.slice());
  // Deterministic k-means++ seeding via a fixed LCG
  let seed = 42;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const centers = [points[0].slice()];
  while (centers.length < k) {
    const d = points.map(p => Math.min(...centers.map(c => dist2(p, c))));
    const total = d.reduce((s, v) => s + v, 0);
    if (total === 0) break;
    let t = rand() * total, i = 0;
    while (t > d[i]) t -= d[i++];
    centers.push(points[Math.min(i, points.length - 1)].slice());
  }
  for (let iter = 0; iter < 32; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of points) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(p, centers[c]);
        if (d < bd) { bd = d; bi = c; }
      }
      const s = sums[bi];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    let moved = 0;
    for (let c = 0; c < centers.length; c++) {
      if (!sums[c][3]) continue;
      const nc = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      moved += dist2(nc, centers[c]);
      centers[c] = nc;
    }
    if (moved < 1e-6) break;
  }
  return centers;
}

/* ---------------- Pipeline ---------------- */
const samples = samplePegs();
if (!samples.size) { console.error('image is fully transparent — nothing to quantize'); process.exit(1); }

// Optional background removal: pegs whose sampled color is nearest the
// background get dropped. "auto" uses the average of the four image corners.
let bgLab = null;
if (bgSpec === 'auto') {
  let r = 0, g = 0, b = 0;
  for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) {
    const i = (y * W + x) * 4;
    r += s2l(pixels[i]); g += s2l(pixels[i + 1]); b += s2l(pixels[i + 2]);
  }
  bgLab = linToLab(r / 4, g / 4, b / 4);
} else if (/^#[0-9a-f]{6}$/i.test(bgSpec)) {
  bgLab = hexToLab(bgSpec);
} else if (bgSpec !== 'none') {
  console.error(`bad --bg "${bgSpec}" (auto, #rrggbb, or none)`); process.exit(1);
}

// k-means the sampled colors, then map each cluster center to the nearest
// solid catalog color (striped beads are never auto-assigned).
const centers = kmeans([...samples.values()].map(s => s.lab), nColors);
const catalog = core.SOLID_COLORS.map(([id, , hex]) => ({ id, lab: hexToLab(hex) }));
const clusterColor = centers.map(c => {
  let best = null, bd = Infinity;
  for (const cat of catalog) {
    const d = dist2(c, cat.lab);
    if (d < bd) { bd = d; best = cat.id; }
  }
  return best;
});
const bgCluster = bgLab === null ? -1
  : centers.reduce((bi, c, i) => dist2(c, bgLab) < dist2(centers[bi], bgLab) ? i : bi, 0);

let beads = new Map();
for (const [key, s] of samples) {
  let bi = 0, bd = Infinity;
  for (let c = 0; c < centers.length; c++) {
    const d = dist2(s.lab, centers[c]);
    if (d < bd) { bd = d; bi = c; }
  }
  if (bi === bgCluster) continue;
  beads.set(key, clusterColor[bi]);
}

// Polar symmetry: majority-vote each orbit (ties break by first occurrence,
// deterministic because orbits enumerate in a fixed order).
if (sym.fold > 1 || sym.mirror) {
  const done = new Set();
  const voted = new Map();
  for (const key of beads.keys()) {
    if (done.has(key)) continue;
    const orbit = core.symCopies(board, key, sym);
    const tally = new Map();
    let filled = 0;
    for (const k of orbit) {
      done.add(k);
      const c = beads.get(k);
      if (!c) continue;
      filled++;
      tally.set(c, (tally.get(c) || 0) + 1);
    }
    if (filled <= orbit.length / 2) continue; // mostly-empty orbit stays empty
    let win = null, wn = 0;
    for (const [c, n] of tally) if (n > wn) { win = c; wn = n; }
    for (const k of orbit) voted.set(k, win);
  }
  beads = voted;
}

// Buildability: flag islands (or drop all but the main component).
const conn = core.connectivity(board, [...beads.keys()]);
if (conn.lenient.length > 1) {
  const loose = conn.lenient.slice(1);
  if (dropIslands) {
    for (const comp of loose) for (const i of comp) beads.delete(conn.keys[i]);
    console.error(`dropped ${loose.length} island(s), ${loose.reduce((s, c) => s + c.length, 0)} bead(s)`);
  } else {
    console.error(`warning: ${loose.length} loose island(s) won't fuse to the main piece (${loose.reduce((s, c) => s + c.length, 0)} beads) — re-run with --drop-islands to remove, or fix by hand in the app`);
  }
}

/* ---------------- Output ---------------- */
const arr = [];
for (const [key, color] of beads) {
  const [a, b] = key.split(',').map(Number);
  arr.push(board.type === 'polar' ? { ring: a, index: b, color } : { row: a, col: b, color });
}
arr.sort((p, q) => (p.ring ?? p.row) - (q.ring ?? q.row) || (p.index ?? p.col) - (q.index ?? q.col));
const pattern = { version: 1, board, beads: arr };

const tally = new Map();
for (const c of beads.values()) tally.set(c, (tally.get(c) || 0) + 1);
console.error(`${beads.size} beads, ${tally.size} colors: ` +
  [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}(${n})`).join(' '));

const outFile = opt('out', null);
if (outFile) { fs.writeFileSync(outFile, JSON.stringify(pattern, null, 1)); console.error('wrote ' + outFile); }
else console.log(JSON.stringify(pattern, null, 1));
