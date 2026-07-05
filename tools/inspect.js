#!/usr/bin/env node
// Inspect a pattern JSON without a browser: expand wedge symmetry exactly like
// the app, print per-ring occupancy and color counts, and check that the fused
// piece holds together (connected components by physical bead contact).
//
// Usage: node tools/inspect.js <pattern.json> [--strict]
//
// Contact model (pitch = 1): same-ring neighbors sit ~1.047 apart and radially
// aligned pegs on adjacent rings sit 1.0 apart — both fuse reliably. Staggered
// pegs on adjacent rings sit up to ~1.13 apart and usually fuse because ironing
// spreads each bead. Default threshold 1.15 counts stagger contact; --strict
// (1.06) counts only guaranteed contact.
'use strict';
const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/inspect.js <pattern.json> [--strict]');
  process.exit(1);
}
const strict = process.argv.includes('--strict');
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const board = j.board;
const s = j.symmetry && Number.isInteger(j.symmetry.fold)
  ? { fold: j.symmetry.fold, mirror: !!j.symmetry.mirror }
  : { fold: 1, mirror: false };

function polarCopies(r, i) {
  const n = board.rings[r];
  if (n === 1) return [[r, 0]];
  let idxs = [((i % n) + n) % n];
  if (s.fold > 1 && n % s.fold === 0) {
    const base = idxs[0], step = n / s.fold;
    idxs = [];
    for (let k = 0; k < s.fold; k++) idxs.push((base + k * step) % n);
  }
  if (s.mirror) idxs = idxs.concat(idxs.map(x => (n - x) % n));
  return [...new Set(idxs)].map(x => [r, x]);
}

// Expand to key -> color
const beads = new Map();
for (const b of j.beads) {
  if (board.type === 'polar') {
    for (const [r, x] of polarCopies(b.ring, b.index)) beads.set(r + ',' + x, b.color);
  } else {
    beads.set(b.row + ',' + b.col, b.color);
  }
}

// Occupancy display
if (board.type === 'polar') {
  console.log(`polar board, ${board.rings.length} rings, ${board.rings.reduce((a, b) => a + b, 0)} pegs`);
  board.rings.forEach((n, r) => {
    let row = '', filled = 0;
    for (let i = 0; i < n; i++) {
      const hit = beads.has(r + ',' + i);
      if (hit) filled++;
      row += hit ? '#' : '.';
    }
    console.log(String(r).padStart(2), `${String(filled).padStart(3)}/${String(n).padStart(3)}`, row);
  });
} else {
  console.log(`square board ${board.width}x${board.height}`);
  for (let r = 0; r < board.height; r++) {
    let row = '';
    for (let c = 0; c < board.width; c++) row += beads.has(r + ',' + c) ? '#' : '.';
    console.log(row);
  }
}

// Color counts
const tally = new Map();
for (const c of beads.values()) tally.set(c, (tally.get(c) || 0) + 1);
console.log('\ncolors:');
for (const [c, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.padEnd(18)} ${n}`);
}
console.log(`  ${'TOTAL'.padEnd(18)} ${beads.size}`);

// Connectivity by physical distance (pitch = 1)
const pos = new Map();
for (const key of beads.keys()) {
  const [a, b] = key.split(',').map(Number);
  if (board.type === 'polar') {
    const ang = 2 * Math.PI * b / board.rings[a];
    pos.set(key, [a * Math.cos(ang), a * Math.sin(ang)]);
  } else {
    pos.set(key, [b, a]);
  }
}
const keys = [...beads.keys()];
const limit = strict ? 1.06 : 1.15;
const adj = new Map(keys.map(k => [k, []]));
for (let i = 0; i < keys.length; i++) {
  const [xi, yi] = pos.get(keys[i]);
  for (let k = i + 1; k < keys.length; k++) {
    const [xk, yk] = pos.get(keys[k]);
    const dx = xi - xk, dy = yi - yk;
    if (dx * dx + dy * dy <= limit * limit) {
      adj.get(keys[i]).push(keys[k]);
      adj.get(keys[k]).push(keys[i]);
    }
  }
}
const seen = new Set();
const comps = [];
for (const k of keys) {
  if (seen.has(k)) continue;
  const stack = [k], comp = [];
  seen.add(k);
  while (stack.length) {
    const cur = stack.pop();
    comp.push(cur);
    for (const nb of adj.get(cur)) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
  }
  comps.push(comp);
}
comps.sort((a, b) => b.length - a.length);
const mode = strict ? 'strict (guaranteed contact only)' : 'lenient (counts stagger contact)';
console.log(`\nconnectivity [${mode}]: ${comps.length} component(s)`);
if (comps.length > 1) {
  for (const c of comps.slice(1, 6)) {
    console.log(`  island of ${c.length}: ${c.slice(0, 8).join('  ')}${c.length > 8 ? ' …' : ''}`);
  }
  console.log('  → these beads may fall off after fusing');
  process.exitCode = 2;
} else {
  console.log('  piece holds together');
}
