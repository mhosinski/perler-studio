// Shared pattern core: peg geometry, wedge-symmetry expansion, and the
// fused-connectivity model. Single source of truth, consumed two ways:
//   - embedded into index.html between CORE markers (node tools/embed-core.js
//     after editing this file)
//   - require()'d by node tools (inspect.js, future quantize.js)
// Keys are "ring,index" (polar) or "row,col" (square) strings throughout.
'use strict';

const PerlerCore = (() => {
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

  return { REACH_LENIENT, REACH_STRICT, pegXY, symCopies, expandBeads, connectivity };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PerlerCore;
