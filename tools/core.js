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

  // Physical position of a peg, pitch = 1, y down. Polar: index 0 at
  // 12 o'clock, indices clockwise — this MUST match the renderer (which now
  // derives from here); a convention mismatch rotates every image import.
  function pegXY(board, key) {
    const [a, b] = key.split(',').map(Number);
    if (board.type === 'polar') {
      const ang = Math.PI * (2 * b / board.rings[a] - 0.5);
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

  // Fill adjacency (paint bucket). Square: plain 4-neighbor. Polar: any peg
  // on the same or an adjacent ring within STRICT reach — the lenient stagger
  // threshold would let an empty-region fill leak across gaps the renderer
  // draws as visibly separated; fill boundaries must match what the eye sees.
  function pegNeighbors(board, key) {
    const [a, b] = key.split(',').map(Number);
    const out = [];
    if (board.type !== 'polar') {
      if (a > 0) out.push((a - 1) + ',' + b);
      if (a < board.height - 1) out.push((a + 1) + ',' + b);
      if (b > 0) out.push(a + ',' + (b - 1));
      if (b < board.width - 1) out.push(a + ',' + (b + 1));
      return out;
    }
    const [x, y] = pegXY(board, key);
    for (let r = Math.max(0, a - 1); r <= Math.min(board.rings.length - 1, a + 1); r++) {
      const n = board.rings[r];
      for (let i = 0; i < n; i++) {
        if (r === a && i === b) continue;
        const [px, py] = pegXY(board, r + ',' + i);
        const dx = x - px, dy = y - py;
        if (dx * dx + dy * dy <= REACH_STRICT * REACH_STRICT) out.push(r + ',' + i);
      }
    }
    return out;
  }

  // Region fill: the contiguous pegs sharing the start peg's state — its
  // color id, or empty (undefined) — reachable via pegNeighbors. Pure: returns
  // the keys; the caller decides what to set them to. `beads` is a
  // key -> color Map; startKey must be a real peg on the board.
  function floodFill(board, beads, startKey) {
    const target = beads.get(startKey);
    const seen = new Set([startKey]);
    const stack = [startKey], out = [];
    while (stack.length) {
      const k = stack.pop();
      out.push(k);
      for (const nb of pegNeighbors(board, k)) {
        if (!seen.has(nb) && beads.get(nb) === target) { seen.add(nb); stack.push(nb); }
      }
    }
    return out;
  }

  /* ---- Pattern JSON (canonical export shape) ---- */
  function patternJSON(board, beads) {
    const arr = [];
    for (const [key, color] of beads) {
      const [a, b] = key.split(',').map(Number);
      arr.push(board.type === 'polar'
        ? { ring: a, index: b, color }
        : { row: a, col: b, color });
    }
    arr.sort((p, q) => (p.ring ?? p.row) - (q.ring ?? q.row) || (p.index ?? p.col) - (q.index ?? q.col));
    const b = board.type === 'polar'
      ? { type: 'polar', name: board.name || 'circle', rings: board.rings }
      : { type: 'square', name: board.name || 'square', width: board.width, height: board.height };
    return { version: 1, board: b, beads: arr };
  }

  /* ---- Image quantization ----
     Shared by the app's "Import image" (canvas pixels) and tools/quantize.js
     (png.js pixels). Pure math — no fs, no canvas, no DOM. */

  // sRGB <-> linear <-> CIELAB (D65)
  const srgbToLinear = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  function linearToLab(r, g, b) {
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  const hexToLab = hex => linearToLab(
    srgbToLinear(parseInt(hex.slice(1, 3), 16)),
    srgbToLinear(parseInt(hex.slice(3, 5), 16)),
    srgbToLinear(parseInt(hex.slice(5, 7), 16)));
  const labDist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  // Deterministic k-means in Lab: k-means++ seeding via a fixed LCG, so the
  // same image always quantizes to the same pattern.
  function kmeans(points, k) {
    if (points.length <= k) return points.map(p => p.slice());
    let seed = 42;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const centers = [points[0].slice()];
    while (centers.length < k) {
      const d = points.map(p => Math.min(...centers.map(c => labDist2(p, c))));
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
          const d = labDist2(p, centers[c]);
          if (d < bd) { bd = d; bi = c; }
        }
        const s = sums[bi];
        s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
      }
      let moved = 0;
      for (let c = 0; c < centers.length; c++) {
        if (!sums[c][3]) continue;
        const nc = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
        moved += labDist2(nc, centers[c]);
        centers[c] = nc;
      }
      if (moved < 1e-6) break;
    }
    return centers;
  }

  // Area-average each peg's image region in linear RGB with alpha weighting;
  // mostly-transparent cells become empty pegs. `fit` controls how the board's
  // bounding box maps onto the image:
  //   'contain' — preserve aspect, whole image visible; board cells beyond
  //             the image get no beads (letterbox). Default for square boards.
  //   'cover'   — preserve aspect, fill the whole board; image edges crop.
  //             Default for polar boards (their historical behavior: the
  //             centered min-square of the image fills the circle's bbox).
  //   'stretch' — map edge-to-edge, aspect be damned.
  // Cell area falling outside the image counts as transparent, so letterbox
  // bands fall out of the alpha threshold naturally.
  function samplePegs(img, board, fit) {
    const { width: W, height: H, pixels } = img;
    let bw, bh;
    if (board.type === 'square') { bw = board.width; bh = board.height; }
    else { bw = bh = 2 * (board.rings.length - 0.5); }
    const mode = fit || (board.type === 'square' ? 'contain' : 'cover');
    let sx, sy; // image px per board unit
    if (mode === 'stretch') { sx = W / bw; sy = H / bh; }
    else if (mode === 'contain') { sx = sy = Math.max(W / bw, H / bh); }
    else { sx = sy = Math.min(W / bw, H / bh); }
    const ox = (W - bw * sx) / 2, oy = (H - bh * sy) / 2;

    const cells = [];
    if (board.type === 'square') {
      for (let r = 0; r < board.height; r++) for (let c = 0; c < board.width; c++) {
        cells.push({
          key: r + ',' + c,
          x0: ox + c * sx, x1: ox + (c + 1) * sx,
          y0: oy + r * sy, y1: oy + (r + 1) * sy,
        });
      }
    } else {
      const R = board.rings.length - 0.5;
      board.rings.forEach((count, r) => {
        for (let i = 0; i < count; i++) {
          const key = r + ',' + i;
          const [px, py] = pegXY(board, key);
          const x = ox + (px + R) * sx, y = oy + (py + R) * sy;
          cells.push({ key, x0: x - sx / 2, x1: x + sx / 2, y0: y - sy / 2, y1: y + sy / 2 });
        }
      });
    }
    const out = new Map();
    for (const cell of cells) {
      const fx0 = Math.floor(cell.x0), fx1 = Math.ceil(cell.x1);
      const fy0 = Math.floor(cell.y0), fy1 = Math.ceil(cell.y1);
      const nTotal = Math.max(0, fx1 - fx0) * Math.max(0, fy1 - fy0);
      const x0 = Math.max(0, fx0), x1 = Math.min(W, fx1);
      const y0 = Math.max(0, fy0), y1 = Math.min(H, fy1);
      let r = 0, g = 0, b = 0, a = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        const w = pixels[i + 3] / 255;
        r += srgbToLinear(pixels[i]) * w;
        g += srgbToLinear(pixels[i + 1]) * w;
        b += srgbToLinear(pixels[i + 2]) * w;
        a += w;
      }
      if (!nTotal || a / nTotal < 0.5) continue;
      out.set(cell.key, linearToLab(r / a, g / a, b / a));
    }
    return out;
  }

  // img: {width, height, pixels} with RGBA bytes (canvas ImageData works).
  // opts: colors (max clusters), bg ('none' | 'auto' | '#rrggbb'),
  //       fit ('contain' | 'cover' | 'stretch', see samplePegs),
  //       sym ({fold, mirror}, polar orbit majority vote), dropIslands.
  // Returns { beads, islands, droppedBeads } — islands counts loose components
  // left in the result (always 0 with dropIslands).
  function quantizeImage(img, board, opts = {}) {
    const colors = Math.max(2, Math.min(24, opts.colors || 8));
    const samples = samplePegs(img, board, opts.fit);
    if (!samples.size) return { beads: new Map(), islands: 0, droppedBeads: 0 };

    let bgLab = null;
    if (opts.bg === 'auto') {
      const { width: W, height: H, pixels } = img;
      let r = 0, g = 0, b = 0;
      for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) {
        const i = (y * W + x) * 4;
        r += srgbToLinear(pixels[i]); g += srgbToLinear(pixels[i + 1]); b += srgbToLinear(pixels[i + 2]);
      }
      bgLab = linearToLab(r / 4, g / 4, b / 4);
    } else if (/^#[0-9a-f]{6}$/i.test(opts.bg || '')) {
      bgLab = hexToLab(opts.bg);
    }

    // k-means first, then snap each cluster to the nearest solid catalog
    // color (striped beads are never auto-assigned). No dithering: dither
    // noise reads as random beads on a pegboard.
    const centers = kmeans([...samples.values()], colors);
    const catalog = SOLID_COLORS.map(([id, , hex]) => ({ id, lab: hexToLab(hex) }));
    const clusterColor = centers.map(c => {
      let best = null, bd = Infinity;
      for (const cat of catalog) {
        const d = labDist2(c, cat.lab);
        if (d < bd) { bd = d; best = cat.id; }
      }
      return best;
    });
    const bgCluster = bgLab === null ? -1
      : centers.reduce((bi, c, i) => labDist2(c, bgLab) < labDist2(centers[bi], bgLab) ? i : bi, 0);

    let beads = new Map();
    for (const [key, lab] of samples) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = labDist2(lab, centers[c]);
        if (d < bd) { bd = d; bi = c; }
      }
      if (bi === bgCluster) continue;
      beads.set(key, clusterColor[bi]);
    }

    // Polar symmetry: majority-vote each orbit (deterministic tie-break by
    // first occurrence; mostly-empty orbits stay empty).
    const sym = opts.sym;
    if (sym && (sym.fold > 1 || sym.mirror)) {
      const done = new Set();
      const voted = new Map();
      for (const key of beads.keys()) {
        if (done.has(key)) continue;
        const orbit = symCopies(board, key, sym);
        const tally = new Map();
        let filled = 0;
        for (const k of orbit) {
          done.add(k);
          const c = beads.get(k);
          if (!c) continue;
          filled++;
          tally.set(c, (tally.get(c) || 0) + 1);
        }
        if (filled <= orbit.length / 2) continue;
        let win = null, wn = 0;
        for (const [c, n] of tally) if (n > wn) { win = c; wn = n; }
        for (const k of orbit) voted.set(k, win);
      }
      beads = voted;
    }

    const conn = connectivity(board, [...beads.keys()]);
    const loose = conn.lenient.slice(1);
    let droppedBeads = 0;
    if (opts.dropIslands) {
      for (const comp of loose) for (const i of comp) { beads.delete(conn.keys[i]); droppedBeads++; }
    }
    return { beads, islands: opts.dropIslands ? 0 : loose.length, droppedBeads };
  }

  /* ---- Share-link codec ----
     gzip + base64url of a JSON payload, for pattern-in-URL sharing
     (#d=<code>). Token format: 'G' (gzip) or 'R' (raw) + base64url + a
     pad-count digit. The trailing digit matters: message-app linkifiers trim
     trailing '-'/'_' from tapped links (which truncated real shares), so the
     token must always end alphanumeric. Legacy 'g'/'r' tokens still decode. */
  const toB64 = bytes => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  };
  const fromB64u = str =>
    Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

  const toToken = (flag, bytes) => {
    const b64 = toB64(bytes);
    const pad = (b64.match(/=+$/) || [''])[0].length;
    return flag + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + pad;
  };

  async function encodeShare(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'undefined') return toToken('R', bytes);
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return toToken('G', new Uint8Array(await new Response(stream).arrayBuffer()));
  }

  async function decodeShare(code) {
    const flag = code[0];
    let body;
    if (flag === 'G' || flag === 'R') body = code.slice(1, -1); // drop pad digit
    else if (flag === 'g' || flag === 'r') body = code.slice(1); // legacy tokens
    else throw new Error('unknown share-link format');
    let bytes = fromB64u(body);
    if (flag === 'G' || flag === 'g') {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  /* ---- Compact share payload (v2) ----
     Color table + one char per peg ('.' = empty) in canonical board order —
     gzips ~10x smaller than pattern JSON for dense boards, which keeps even
     photo-import share URLs text-message sized. */
  const PEG_IDX = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  function boardKeys(board) {
    const keys = [];
    if (board.type === 'polar') {
      board.rings.forEach((n, r) => { for (let i = 0; i < n; i++) keys.push(r + ',' + i); });
    } else {
      for (let r = 0; r < board.height; r++) for (let c = 0; c < board.width; c++) keys.push(r + ',' + c);
    }
    return keys;
  }

  // Returns null when the pattern can't be packed (too many distinct colors);
  // callers fall back to the v1 {v:1, name, pattern} payload.
  function packShare(name, pattern) {
    const board = pattern.board;
    const { beads } = expandBeads(board, pattern.beads,
      pattern.symmetry && Number.isInteger(pattern.symmetry.fold)
        ? { fold: pattern.symmetry.fold, mirror: !!pattern.symmetry.mirror }
        : { fold: 1, mirror: false });
    const colors = [...new Set(beads.values())];
    if (colors.length > PEG_IDX.length) return null;
    const p = boardKeys(board)
      .map(k => { const c = beads.get(k); return c ? PEG_IDX[colors.indexOf(c)] : '.'; })
      .join('');
    return { v: 2, n: name, b: board, c: colors, p };
  }

  // Accepts v2 compact payloads and v1 {v:1, name, pattern} payloads.
  function unpackShare(obj) {
    if (obj && obj.v === 2) {
      const board = obj.b;
      const keys = boardKeys(board);
      if (typeof obj.p !== 'string' || obj.p.length !== keys.length || !Array.isArray(obj.c)) {
        throw new Error('malformed pattern data');
      }
      const beads = [];
      for (let i = 0; i < keys.length; i++) {
        const ch = obj.p[i];
        if (ch === '.') continue;
        const idx = PEG_IDX.indexOf(ch);
        const color = idx >= 0 ? obj.c[idx] : null;
        if (!color) throw new Error('malformed pattern data');
        const [a, b] = keys[i].split(',').map(Number);
        beads.push(board.type === 'polar' ? { ring: a, index: b, color } : { row: a, col: b, color });
      }
      return { name: obj.n, pattern: { version: 1, board, beads } };
    }
    return { name: obj && obj.name, pattern: obj && obj.pattern };
  }

  return {
    SOLID_COLORS, STRIPED_COLORS, PALETTE, PAL, colorInfo,
    REACH_LENIENT, REACH_STRICT, pegXY, symCopies, expandBeads, connectivity,
    pegNeighbors, floodFill,
    patternJSON, quantizeImage, encodeShare, decodeShare, packShare, unpackShare,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PerlerCore;
