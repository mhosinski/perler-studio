// Minimal dependency-free PNG codec on node:zlib, just enough for the
// quantizer pipeline and test fixtures. Decode covers the images that matter
// here (8-bit gray/gray+alpha/RGB/RGBA/palette, non-interlaced — what image
// models and screenshots produce); everything else fails with a clear error.
// Encode writes 8-bit RGBA, filter 0.
'use strict';
const zlib = require('zlib');

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/* ---------------- decode ---------------- */

// Returns { width, height, pixels } where pixels is RGBA, 4 bytes per pixel.
function decode(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG file');
  let pos = 8;
  let ihdr = null, palette = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        bitDepth: data[8], colorType: data[9], interlace: data[12],
      };
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len; // length + type + data + crc
  }
  if (!ihdr) throw new Error('missing IHDR');
  if (ihdr.bitDepth !== 8) throw new Error(`unsupported bit depth ${ihdr.bitDepth} (only 8)`);
  if (ihdr.interlace) throw new Error('interlaced PNGs are not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.colorType];
  if (!channels) throw new Error(`unsupported color type ${ihdr.colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width: W, height: H } = ihdr;
  const stride = W * channels;
  if (raw.length !== H * (stride + 1)) throw new Error('corrupt PNG data');

  // Undo per-scanline filters (spec filters 0-4)
  const img = Buffer.alloc(H * stride);
  const bpp = channels;
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = img.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? img.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { // Paeth
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error(`unknown filter ${f}`);
      out[x] = v & 0xff;
    }
  }

  // Expand to RGBA
  const pixels = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const s = i * channels, d = i * 4;
    if (ihdr.colorType === 0) {
      pixels[d] = pixels[d + 1] = pixels[d + 2] = img[s]; pixels[d + 3] = 255;
    } else if (ihdr.colorType === 2) {
      pixels[d] = img[s]; pixels[d + 1] = img[s + 1]; pixels[d + 2] = img[s + 2]; pixels[d + 3] = 255;
    } else if (ihdr.colorType === 3) {
      const p = img[s] * 3;
      if (!palette || p + 2 >= palette.length) throw new Error('palette index out of range');
      pixels[d] = palette[p]; pixels[d + 1] = palette[p + 1]; pixels[d + 2] = palette[p + 2];
      pixels[d + 3] = trns && img[s] < trns.length ? trns[img[s]] : 255;
    } else if (ihdr.colorType === 4) {
      pixels[d] = pixels[d + 1] = pixels[d + 2] = img[s]; pixels[d + 3] = img[s + 1];
    } else {
      pixels[d] = img[s]; pixels[d + 1] = img[s + 1]; pixels[d + 2] = img[s + 2]; pixels[d + 3] = img[s + 3];
    }
  }
  return { width: W, height: H, pixels };
}

/* ---------------- encode ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

// pixels: RGBA buffer, 4 bytes per pixel, row-major.
function encode(width, height, pixels) {
  if (pixels.length !== width * height * 4) throw new Error('pixel buffer size mismatch');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { decode, encode };
