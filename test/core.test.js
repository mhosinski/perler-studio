// Tests for the shared pattern core. Zero dependencies: node --test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const core = require('../tools/core.js');

const POLAR = { type: 'polar', name: 'circle-14', rings: Array.from({ length: 14 }, (_, r) => r === 0 ? 1 : 6 * r) };
const SQUARE = { type: 'square', name: 'square-8x8', width: 8, height: 8 };

/* ---------------- symCopies ---------------- */

test('polar: no symmetry returns just the key', () => {
  assert.deepEqual(core.symCopies(POLAR, '3,5', { fold: 1, mirror: false }), ['3,5']);
});

test('polar: center peg is its own orbit under any symmetry', () => {
  assert.deepEqual(core.symCopies(POLAR, '0,0', { fold: 6, mirror: true }), ['0,0']);
});

test('polar: fold 6 on a 12-peg ring rotates in steps of 2', () => {
  const got = core.symCopies(POLAR, '2,1', { fold: 6, mirror: false }).sort();
  assert.deepEqual(got, ['2,1', '2,11', '2,3', '2,5', '2,7', '2,9']);
});

test('polar: mirror reflects across 12 o\'clock (index n-i)', () => {
  const got = core.symCopies(POLAR, '2,1', { fold: 1, mirror: true }).sort();
  assert.deepEqual(got, ['2,1', '2,11']);
});

test('polar: fold is skipped when the ring count is not divisible', () => {
  // ring 2 has 12 pegs; fold 5 does not divide 12
  assert.deepEqual(core.symCopies(POLAR, '2,3', { fold: 5, mirror: false }), ['2,3']);
});

test('square: fold 2 adds the 180-degree rotation', () => {
  const got = core.symCopies(SQUARE, '1,2', { fold: 2, mirror: false }).sort();
  assert.deepEqual(got, ['1,2', '6,5']);
});

test('square: fold 4 on a square board gives the 4 rotations', () => {
  const got = core.symCopies(SQUARE, '1,2', { fold: 4, mirror: false }).sort();
  assert.deepEqual(got, ['1,2', '2,6', '5,1', '6,5']);
});

test('square: mirror reflects across the vertical axis', () => {
  const got = core.symCopies(SQUARE, '1,2', { fold: 1, mirror: true }).sort();
  assert.deepEqual(got, ['1,2', '1,5']);
});

/* ---------------- expandBeads ---------------- */

test('expandBeads: snowflake example expands its wedge to the full pattern', () => {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', 'snowflake.json'), 'utf8'));
  const { beads, skipped } = core.expandBeads(j.board, j.beads, j.symmetry);
  assert.equal(skipped, 0);
  assert.equal(beads.size, 127); // 17 wedge beads -> 127 under fold 6 + mirror
  const { lenient } = core.connectivity(j.board, [...beads.keys()]);
  assert.equal(lenient.length, 1); // shipped examples must hold together
});

test('expandBeads: negative polar indices normalize into range', () => {
  const { beads } = core.expandBeads(POLAR, [{ ring: 2, index: -1, color: 'red' }], { fold: 1, mirror: false });
  assert.deepEqual([...beads.keys()], ['2,11']);
});

test('expandBeads: out-of-board and malformed beads are skipped, not fatal', () => {
  const { beads, skipped } = core.expandBeads(POLAR, [
    { ring: 99, index: 0, color: 'red' },   // ring out of range
    { ring: 1.5, index: 0, color: 'red' },  // non-integer
    null,                                   // malformed entry
    { ring: 1, index: 0, color: 'red' },    // valid
  ], { fold: 1, mirror: false });
  assert.equal(skipped, 3);
  assert.equal(beads.size, 1);
});

test('expandBeads: square bounds are enforced', () => {
  const { beads, skipped } = core.expandBeads(SQUARE, [
    { row: 8, col: 0, color: 'red' },
    { row: 0, col: -1, color: 'red' },
    { row: 7, col: 7, color: 'red' },
  ], { fold: 1, mirror: false });
  assert.equal(skipped, 2);
  assert.deepEqual([...beads.keys()], ['7,7']);
});

test('expandBeads: isValidColor filters beads when provided', () => {
  const { beads, skipped } = core.expandBeads(SQUARE, [
    { row: 0, col: 0, color: 'nope' },
    { row: 0, col: 1, color: 'red' },
  ], { fold: 1, mirror: false }, c => c === 'red');
  assert.equal(skipped, 1);
  assert.deepEqual([...beads.keys()], ['0,1']);
});

/* ---------------- connectivity ---------------- */

test('connectivity: orthogonal square neighbors touch, diagonals do not', () => {
  const both = core.connectivity(SQUARE, ['0,0', '0,1']);
  assert.equal(both.lenient.length, 1);
  assert.equal(both.strict.length, 1);
  const diag = core.connectivity(SQUARE, ['0,0', '1,1']); // sqrt(2) > 1.15
  assert.equal(diag.lenient.length, 2);
});

test('connectivity: same-ring neighbors and radially aligned rings fuse (strict)', () => {
  // ring 6 has 36 pegs: adjacent chord = 12*sin(pi/36) ~ 1.047 < 1.06
  const ring = core.connectivity(POLAR, ['6,0', '6,1']);
  assert.equal(ring.strict.length, 1);
  // radially aligned pegs on adjacent rings sit exactly 1.0 apart
  const radial = core.connectivity(POLAR, ['1,0', '2,0']);
  assert.equal(radial.strict.length, 1);
});

test('connectivity: stagger contact counts as lenient but not strict', () => {
  // ring 2 index 1 (30deg) vs ring 3 index 1 (20deg): distance ~1.087,
  // between REACH_STRICT (1.06) and REACH_LENIENT (1.15)
  const res = core.connectivity(POLAR, ['2,1', '3,1']);
  assert.equal(res.lenient.length, 1);
  assert.equal(res.strict.length, 2);
});

test('connectivity: components come back largest-first with island keys addressable', () => {
  const res = core.connectivity(SQUARE, ['0,0', '0,1', '0,2', '5,5']);
  assert.equal(res.lenient.length, 2);
  assert.equal(res.lenient[0].length, 3);
  assert.deepEqual(res.lenient[1].map(i => res.keys[i]), ['5,5']);
});

/* ---------------- pegXY convention ---------------- */

test('pegXY: polar index 0 sits at 12 o\'clock, indices go clockwise (y down)', () => {
  const [x0, y0] = core.pegXY(POLAR, '3,0');
  assert.ok(Math.abs(x0) < 1e-9 && y0 < 0, `index 0 must point up, got (${x0}, ${y0})`);
  // ring 3 has 18 pegs; a quarter turn clockwise (index 4.5 -> use ring 2, 12 pegs, index 3)
  const [x3, y3] = core.pegXY(POLAR, '2,3');
  assert.ok(x3 > 0 && Math.abs(y3) < 1e-9, `quarter turn must point right (3 o'clock), got (${x3}, ${y3})`);
});

/* ---------------- embed drift ---------------- */

test('index.html embeds the current tools/core.js (run node tools/embed-core.js)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const m = html.match(/\/\* CORE:BEGIN[^\n]*\*\/\n([\s\S]*?)\n\/\* CORE:END \*\//);
  assert.ok(m, 'CORE markers missing from index.html');
  const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'core.js'), 'utf8').trimEnd();
  assert.equal(m[1], src, 'embedded core is stale — run: node tools/embed-core.js');
});
