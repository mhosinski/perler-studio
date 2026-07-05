#!/usr/bin/env node
// Inspect a pattern JSON without a browser: expand wedge symmetry exactly like
// the app, print per-ring occupancy and color counts, and check that the fused
// piece holds together (connected components by physical bead contact).
//
// Usage: node tools/inspect.js <pattern.json> [--strict]
//
// Symmetry expansion and the contact model are the app's own — both come from
// the shared core (tools/core.js). Default threshold counts stagger contact
// between adjacent rings (ironing spreads beads); --strict counts only
// guaranteed contact.
'use strict';
const fs = require('fs');
const core = require('./core.js');

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

// Expand to key -> color (beads on invalid pegs are dropped, like the app)
const { beads, skipped } = core.expandBeads(board, j.beads, s);
if (skipped) console.error(`warning: ${skipped} invalid bead(s) skipped`);

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
const res = core.connectivity(board, [...beads.keys()]);
const comps = strict ? res.strict : res.lenient;
const mode = strict ? 'strict (guaranteed contact only)' : 'lenient (counts stagger contact)';
console.log(`\nconnectivity [${mode}]: ${comps.length} component(s)`);
if (comps.length > 1) {
  for (const c of comps.slice(1, 6)) {
    const names = c.map(i => res.keys[i]);
    console.log(`  island of ${c.length}: ${names.slice(0, 8).join('  ')}${c.length > 8 ? ' …' : ''}`);
  }
  console.log('  → these beads may fall off after fusing');
  process.exitCode = 2;
} else {
  console.log('  piece holds together');
}
