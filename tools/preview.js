#!/usr/bin/env node
// Render a pattern JSON to a PNG using the app's own renderer via headless
// Chrome — the previz loop for iterating on designs without opening a browser.
// Usage: node tools/preview.js <pattern.json> [out.png]
// Set $CHROME to override the Chrome binary path.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CHROME = process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/preview.js <pattern.json> [out.png]');
  process.exit(1);
}
const out = path.resolve(process.argv[3] || file.replace(/\.json$/, '') + '.png');

const pat = fs.readFileSync(file, 'utf8');
JSON.parse(pat); // fail fast on invalid JSON

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const page = html.replace(
  '</body>',
  `<script>loadFromJSON(${JSON.stringify(pat)});</script>\n</body>`
);
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'perler-')), 'preview.html');
fs.writeFileSync(tmp, page);

execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--window-size=1400,1000',
  `--screenshot=${out}`, 'file://' + tmp,
], { stdio: 'ignore' });
console.log(out);
