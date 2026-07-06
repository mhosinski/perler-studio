// Shared pattern core: peg geometry, wedge-symmetry expansion, and the
// fused-connectivity model. Single source of truth, consumed two ways:
//   - embedded into index.html between CORE markers (node tools/embed-core.js
//     after editing this file)
//   - require()'d by node tools (inspect.js, future quantize.js)
// Keys are "ring,index" (polar) or "row,col" (square) strings throughout.
'use strict';

const PerlerCore = (() => {
  /* ---- Palette (approximate Perler catalog colors) ---- */
  const SOLID_COLORS = [
    ['white', 'White', '#fdfdfc'],
    ['cream', 'Cream', '#ede8c8'],
    ['yellow', 'Yellow', '#fcd905'],
    ['cheddar', 'Cheddar', '#ffb632'],
    ['orange', 'Orange', '#f97e20'],
    ['butterscotch', 'Butterscotch', '#dfa356'],
    ['hot-coral', 'Hot Coral', '#ff424c'],
    ['red', 'Red', '#d02b2e'],
    ['cherry', 'Cherry', '#b02342'],
    ['cranapple', 'Cranapple', '#7e2b47'],
    ['raspberry', 'Raspberry', '#ad3f77'],
    ['bubblegum', 'Bubblegum', '#ec6fa9'],
    ['pink', 'Pink', '#dd6ba4'],
    ['light-pink', 'Light Pink', '#f8c9d8'],
    ['magenta', 'Magenta', '#f13596'],
    ['purple', 'Purple', '#654e9f'],
    ['pastel-lavender', 'Pastel Lavender', '#b1a0d6'],
    ['plum', 'Plum', '#a54f9e'],
    ['dark-blue', 'Dark Blue', '#2b3f87'],
    ['blue', 'Blue', '#2f5fa5'],
    ['cobalt', 'Cobalt', '#0f5bbd'],
    ['light-blue', 'Light Blue', '#3d9ae0'],
    ['pastel-blue', 'Pastel Blue', '#8cb5e2'],
    ['robins-egg', "Robin's Egg", '#9cd6dc'],
    ['turquoise', 'Turquoise', '#17a6b7'],
    ['toothpaste', 'Toothpaste', '#bfe3e0'],
    ['parrot-green', 'Parrot Green', '#0f9e8a'],
    ['dark-green', 'Dark Green', '#0e6b3c'],
    ['green', 'Green', '#169b4e'],
    ['bright-green', 'Bright Green', '#4fbe53'],
    ['light-green', 'Light Green', '#71c968'],
    ['pastel-green', 'Pastel Green', '#a9dcae'],
    ['kiwi-lime', 'Kiwi Lime', '#9ccb3b'],
    ['prickly-pear', 'Prickly Pear', '#cbdf46'],
    ['sand', 'Sand', '#e6d3a7'],
    ['tan', 'Tan', '#ceac83'],
    ['light-brown', 'Light Brown', '#8f6b4a'],
    ['brown', 'Brown', '#57402f'],
    ['rust', 'Rust', '#a04a34'],
    ['salmon', 'Salmon', '#f98973'],
    ['peach', 'Peach', '#f9c5a6'],
    ['gray', 'Gray', '#9a9c9e'],
    ['pewter', 'Pewter', '#7d8288'],
    ['dark-gray', 'Dark Gray', '#53575d'],
    ['black', 'Black', '#2b2b2b'],
    ['gold', 'Gold', '#bb9241'],
  ];

  // Two-tone striped beads (pinwheel-segmented). Pattern JSON still stores a
  // single color id; only rendering knows an entry has two colors.
  const STRIPED_COLORS = [
    ['striped-yellow-green', 'Striped Yellow/Green', '#f5df2e', '#a8cf45'],
    ['striped-orange-red', 'Striped Orange/Red', '#f9941d', '#e8492b'],
    ['striped-pink', 'Striped Pink', '#ee5fa4', '#f7c6d8'],
    ['striped-purple', 'Striped Purple', '#a88fd6', '#e7e2f2'],
  ];

  const PALETTE = [
    ...SOLID_COLORS.map(([id, name, hex]) => ({ id, name, hex, colors: [hex] })),
    ...STRIPED_COLORS.map(([id, name, a, b]) => ({ id, name, hex: a, colors: [a, b] })),
  ];

  const PAL = Object.fromEntries(PALETTE.map(p => [p.id, p]));

  function colorInfo(c) {
    if (PAL[c]) return PAL[c];
    if (/^#[0-9a-f]{6}$/i.test(c)) return { id: c, name: c, hex: c, colors: [c] };
    return null;
  }

  // Contact model (pitch = 1): same-ring neighbors sit ~1.047 apart, radially
  // aligned pegs on adjacent rings 1.0, staggered pegs on adjacent rings up to
  // ~1.13 (usually fuse — ironing spreads beads).
  const REACH_LENIENT = 1.15, REACH_STRICT = 1.06;

  // Physical position of a peg, pitch = 1.
  function pegXY(board, key) {
    const [a, b] = key.split(',').map(Number);
    if (board.type === 'polar') {
      const ang = 2 * Math.PI * b / board.rings[a];
      return [a * Math.cos(ang), a * Math.sin(ang)];
    }
    return [b, a];
  }

  // All pegs painted when `key` is painted under symmetry `sym` ({fold, mirror}).
  function symCopies(board, key, sym) {
    const out = new Set([key]);
    if (board.type === 'polar') {
      const [r, i] = key.split(',').map(Number);
      const n = board.rings[r];
      if (n > 1) {
        let idxs = [i];
        if (sym.fold > 1 && n % sym.fold === 0) {
          idxs = [];
          const step = n / sym.fold;
          for (let k = 0; k < sym.fold; k++) idxs.push((i + k * step) % n);
        }
        if (sym.mirror) idxs = idxs.concat(idxs.map(x => (n - x) % n));
        idxs.forEach(x => out.add(r + ',' + x));
      }
    } else {
      const [r, c] = key.split(',').map(Number);
      const W = board.width, H = board.height;
      let pts = [[r, c]];
      if (sym.fold === 2) pts.push([H - 1 - r, W - 1 - c]);
      if (sym.fold === 4 && W === H) pts = [[r, c], [c, W - 1 - r], [H - 1 - r, W - 1 - c], [W - 1 - c, r]];
      if (sym.mirror) pts = pts.concat(pts.map(([a, b]) => [a, W - 1 - b]));
      pts.forEach(([a, b]) => out.add(a + ',' + b));
    }
    return [...out];
  }

  // Expand a pattern's bead list (possibly a single wedge) into the full
  // key -> color map. Beads referencing invalid pegs — or colors rejected by
  // isValidColor, when given — are counted in `skipped`, never thrown on.
  function expandBeads(board, beadList, sym, isValidColor) {
    const beads = new Map();
    let skipped = 0;
    for (const bd of beadList) {
      if (!bd || (isValidColor && !isValidColor(bd.color))) { skipped++; continue; }
      let key;
      if (board.type === 'polar') {
        if (!Number.isInteger(bd.ring) || !Number.isInteger(bd.index) ||
            bd.ring < 0 || bd.ring >= board.rings.length) { skipped++; continue; }
        const n = board.rings[bd.ring];
        key = bd.ring + ',' + (((bd.index % n) + n) % n);
      } else {
        if (!Number.isInteger(bd.row) || !Number.isInteger(bd.col) ||
            bd.row < 0 || bd.row >= board.height || bd.col < 0 || bd.col >= board.width) { skipped++; continue; }
        key = bd.row + ',' + bd.col;
      }
      for (const k of symCopies(board, key, sym)) beads.set(k, bd.color);
    }
    return { beads, skipped };
  }

  // Fused-connectivity check: connected components by physical bead contact,
  // as arrays of indices into `keys`, largest component first, at both
  // thresholds. (Pairwise O(n²); acceptable at current board caps — see
  // perler-ye5 before raising them.)
  function connectivity(board, keys) {
    const pos = keys.map(k => pegXY(board, k));
    const n = keys.length;
    const near = Array.from({ length: n }, () => []);
    const strong = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1];
        const d2 = dx * dx + dy * dy;
        if (d2 <= REACH_LENIENT * REACH_LENIENT) {
          near[i].push(j); near[j].push(i);
          if (d2 <= REACH_STRICT * REACH_STRICT) { strong[i].push(j); strong[j].push(i); }
        }
      }
    }
    const components = links => {
      const seen = new Array(n).fill(false), out = [];
      for (let i = 0; i < n; i++) {
        if (seen[i]) continue;
        const stack = [i], comp = [];
        seen[i] = true;
        while (stack.length) {
          const cur = stack.pop();
          comp.push(cur);
          for (const nb of links[cur]) if (!seen[nb]) { seen[nb] = true; stack.push(nb); }
        }
        out.push(comp);
      }
      return out.sort((a, b) => b.length - a.length);
    };
    return { keys, lenient: components(near), strict: components(strong) };
  }

  return {
    SOLID_COLORS, STRIPED_COLORS, PALETTE, PAL, colorInfo,
    REACH_LENIENT, REACH_STRICT, pegXY, symCopies, expandBeads, connectivity,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PerlerCore;
