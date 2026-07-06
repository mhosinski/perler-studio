// Tests for the PNG codec and the image->pattern quantizer pipeline.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const png = require('../tools/png.js');
const core = require('../tools/core.js');

const QUANTIZE = path.join(__dirname, '..', 'tools', 'quantize.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perler-test-'));

// Paint an RGBA image from a rows-of-letters sketch and a letter->color map.
// '.' means transparent.
function imageFrom(rows, colors, cellPx = 8) {
  const W = rows[0].length * cellPx, H = rows.length * cellPx;
  const pixels = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = rows[Math.floor(y / cellPx)][Math.floor(x / cellPx)];
    const c = colors[ch];
    if (!c) continue; // transparent
    const i = (y * W + x) * 4;
    pixels[i] = c[0]; pixels[i + 1] = c[1]; pixels[i + 2] = c[2]; pixels[i + 3] = 255;
  }
  return png.encode(W, H, pixels);
}

function runQuantize(pngBuf, extra = []) {
  const img = path.join(tmp, `in-${Math.abs(extra.join('').split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 7))}.png`);
  fs.writeFileSync(img, pngBuf);
  const out = execFileSync('node', [QUANTIZE, img, ...extra], { encoding: 'utf8' });
  return JSON.parse(out);
}

/* ---------------- png codec ---------------- */

test('png: encode/decode round-trips RGBA pixels', () => {
  const pixels = Buffer.alloc(3 * 2 * 4);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37) % 256;
  const { width, height, pixels: got } = png.decode(png.encode(3, 2, pixels));
  assert.equal(width, 3);
  assert.equal(height, 2);
  assert.deepEqual([...got], [...pixels]);
});

test('png: rejects non-PNG input with a clear error', () => {
  assert.throws(() => png.decode(Buffer.from('not a png at all')), /not a PNG/);
});

/* ---------------- quantizer ---------------- */

test('quantize: solid shape on transparency maps to catalog colors on the right pegs', () => {
  // A 4x4 red square centered on an 8x8 transparent image -> 8x8 board
  const rows = [
    '........',
    '........',
    '..rrrr..',
    '..rrrr..',
    '..rrrr..',
    '..rrrr..',
    '........',
    '........',
  ];
  const p = runQuantize(imageFrom(rows, { r: [208, 43, 46] }), ['--board', 'square:8x8']);
  assert.equal(p.board.type, 'square');
  assert.equal(p.beads.length, 16);
  assert.ok(p.beads.every(b => b.color === 'red'), 'nearest catalog color for #d02b2e is red');
  assert.ok(p.beads.every(b => b.row >= 2 && b.row <= 5 && b.col >= 2 && b.col <= 5));
});

test('quantize: --bg auto removes an opaque background', () => {
  const rows = [
    'wwwwwwww',
    'wwwwwwww',
    'wwkkkkww',
    'wwkkkkww',
    'wwkkkkww',
    'wwkkkkww',
    'wwwwwwww',
    'wwwwwwww',
  ];
  const img = imageFrom(rows, { w: [255, 255, 255], k: [43, 43, 43] });
  const withBg = runQuantize(img, ['--board', 'square:8x8']);
  assert.equal(withBg.beads.length, 64, 'without --bg the whole board fills');
  const noBg = runQuantize(img, ['--board', 'square:8x8', '--bg', 'auto']);
  assert.equal(noBg.beads.length, 16);
  assert.ok(noBg.beads.every(b => b.color === 'black'));
});

test('quantize: output is deterministic', () => {
  const rows = ['rgb.', 'gbr.', 'brg.', '....'];
  const img = imageFrom(rows, { r: [220, 40, 40], g: [30, 150, 80], b: [40, 90, 170] });
  const a = runQuantize(img, ['--board', 'square:4x4']);
  const b = runQuantize(img, ['--board', 'square:4x4']);
  assert.deepEqual(a, b);
});

test('quantize: --colors caps the resulting color count', () => {
  // 6 distinct hues, quantized down to 3 clusters
  const rows = ['rgbcmy'];
  const img = imageFrom(rows, {
    r: [220, 40, 40], g: [40, 170, 60], b: [40, 80, 200],
    c: [60, 200, 210], m: [200, 60, 180], y: [240, 210, 40],
  });
  const p = runQuantize(img, ['--board', 'square:6x1', '--colors', '3']);
  const used = new Set(p.beads.map(b => b.color));
  assert.ok(used.size <= 3, `expected <=3 colors, got ${[...used].join(', ')}`);
});

test('quantize: --drop-islands keeps only the main component', () => {
  const rows = [
    'rrr....k',
    'rrr.....',
    'rrr.....',
    '........',
  ];
  const img = imageFrom(rows, { r: [220, 40, 40], k: [43, 43, 43] });
  const flagged = runQuantize(img, ['--board', 'square:8x4']);
  assert.equal(flagged.beads.length, 10, 'island is kept (flagged on stderr) by default');
  const dropped = runQuantize(img, ['--board', 'square:8x4', '--drop-islands']);
  assert.equal(dropped.beads.length, 9);
  assert.ok(dropped.beads.every(b => b.col <= 2));
});

test('quantize: polar --sym majority-votes orbits into exact symmetry', () => {
  // A blue disc with one red blemish: fold-6 voting must erase the blemish.
  const size = 48;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - size / 2 + 0.5, dy = y - size / 2 + 0.5;
    if (Math.hypot(dx, dy) > size / 2 - 1) continue;
    const i = (y * size + x) * 4;
    const blemish = x > size * 0.75 && Math.abs(dy) < 3;
    pixels[i] = blemish ? 220 : 47; pixels[i + 1] = blemish ? 40 : 95; pixels[i + 2] = blemish ? 40 : 165;
    pixels[i + 3] = 255;
  }
  const p = runQuantize(png.encode(size, size, pixels), ['--board', 'polar:5', '--sym', '6']);
  assert.ok(p.beads.length > 0);
  assert.ok(p.beads.every(b => b.color !== 'red'), 'blemish outvoted by its orbit');
  // exact symmetry: every bead's fold-6 orbit is uniformly present and colored
  const byKey = new Map(p.beads.map(b => [b.ring + ',' + b.index, b.color]));
  for (const b of p.beads) {
    for (const k of core.symCopies(p.board, b.ring + ',' + b.index, { fold: 6, mirror: false })) {
      assert.equal(byKey.get(k), b.color, `orbit of ${b.ring},${b.index} not uniform at ${k}`);
    }
  }
});

test('core.quantizeImage: callable directly with raw RGBA (the app path, no CLI)', () => {
  // 2x1 image: red pixel, transparent pixel -> 2x1 board
  const pixels = Buffer.from([220, 40, 40, 255, 0, 0, 0, 0]);
  const board = { type: 'square', name: 'square-2x1', width: 2, height: 1 };
  const { beads, islands } = core.quantizeImage({ width: 2, height: 1, pixels }, board, { colors: 4 });
  assert.deepEqual([...beads.entries()], [['0,0', 'red']]);
  assert.equal(islands, 0);
});

test('core.quantizeImage: CLI and direct call produce identical patterns', () => {
  const rows = ['rgb.', 'gbr.', 'brg.', '....'];
  const img = imageFrom(rows, { r: [220, 40, 40], g: [30, 150, 80], b: [40, 90, 170] });
  const viaCli = runQuantize(img, ['--board', 'square:4x4']);
  const decoded = png.decode(img);
  const board = { type: 'square', name: 'square-4x4', width: 4, height: 4 };
  const direct = core.patternJSON(board, core.quantizeImage(decoded, board, { colors: 8, bg: 'none' }).beads);
  assert.deepEqual(direct, viaCli);
});

test('core.patternJSON: sorted, versioned, board normalized', () => {
  const board = { type: 'square', width: 3, height: 3 }; // no name
  const beads = new Map([['2,1', 'red'], ['0,2', 'blue'], ['0,0', 'red']]);
  const p = core.patternJSON(board, beads);
  assert.equal(p.version, 1);
  assert.equal(p.board.name, 'square');
  assert.deepEqual(p.beads.map(b => `${b.row},${b.col}`), ['0,0', '0,2', '2,1']);
});

test('quantize: polar sampling preserves image orientation (top of image = 12 o\'clock)', () => {
  // Red band across the top of the image, black band across the bottom.
  const size = 64;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (y < size / 4) { pixels[i] = 208; pixels[i + 1] = 43; pixels[i + 2] = 46; pixels[i + 3] = 255; }
    else if (y >= size * 3 / 4) { pixels[i] = 43; pixels[i + 1] = 43; pixels[i + 2] = 43; pixels[i + 3] = 255; }
  }
  const p = runQuantize(png.encode(size, size, pixels), ['--board', 'polar:4']);
  const at = (ring, index) => p.beads.find(b => b.ring === ring && b.index === index)?.color;
  // Outer ring (3) has 18 pegs: index 0 = 12 o'clock, index 9 = 6 o'clock.
  assert.equal(at(3, 0), 'red', 'top of image must land at 12 o\'clock');
  assert.equal(at(3, 9), 'black', 'bottom of image must land at 6 o\'clock');
});

test('fit=contain (square default): wide images letterbox instead of squashing', () => {
  // 2:1 solid red image onto an 8x8 board -> middle 4 rows beaded, 2 empty
  // rows top and bottom, no distortion
  const rows = ['rrrr', 'rrrr'];
  const img = imageFrom(rows, { r: [220, 40, 40] }, 32); // 128x64
  const p = runQuantize(img, ['--board', 'square:8x8']);
  const rowsUsed = new Set(p.beads.map(b => b.row));
  assert.deepEqual([...rowsUsed].sort(), [2, 3, 4, 5]);
  assert.equal(p.beads.length, 32, 'the 4 middle rows fill fully');
});

test('fit=cover: wide images crop their sides and fill the board', () => {
  // left third red, middle third black, right third white; cover on a square
  // board keeps the middle and crops into the outer thirds
  const rows = ['rrrrrrkkkkkkwwwwww'];
  const img = imageFrom(rows, { r: [220, 40, 40], k: [43, 43, 43], w: [253, 253, 252] }, 16); // 288x16
  const p = runQuantize(img, ['--board', 'square:6x6', '--fit', 'cover']);
  assert.equal(p.beads.length, 36, 'cover fills every peg');
  const middle = p.beads.filter(b => b.col >= 2 && b.col <= 3);
  assert.ok(middle.every(b => b.color === 'black'), 'image center survives the crop');
});

test('fit=stretch: preserves the old edge-to-edge mapping', () => {
  const rows = ['rrrrrrrrrrrrrrrr', 'rrrrrrrrrrrrrrrr'];
  const img = imageFrom(rows, { r: [220, 40, 40] }, 16);
  const p = runQuantize(img, ['--board', 'square:8x8', '--fit', 'stretch']);
  assert.equal(p.beads.length, 64, 'stretch fills the whole board');
});

test('fit: polar boards default to cover (historical center-crop behavior)', () => {
  // solid blue landscape image: cover fills the disc completely
  const rows = ['bbbbbbbbbbbb', 'bbbbbbbbbbbb', 'bbbbbbbbbbbb'];
  const img = imageFrom(rows, { b: [47, 95, 165] }, 16); // 192x48
  const p = runQuantize(img, ['--board', 'polar:3']);
  assert.equal(p.beads.length, 1 + 6 + 12, 'every peg beaded');
});

test('quantize: output passes expandBeads validation cleanly', () => {
  const rows = ['rr', 'rr'];
  const p = runQuantize(imageFrom(rows, { r: [220, 40, 40] }), ['--board', 'square:2x2']);
  const { skipped } = core.expandBeads(p.board, p.beads, { fold: 1, mirror: false }, c => !!core.colorInfo(c));
  assert.equal(skipped, 0);
});
