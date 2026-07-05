#!/usr/bin/env node
// Embed examples/*.json into index.html so the app's Examples dropdown works
// over file:// (fetch() can't read local files without a web server).
// Run after adding or editing any example: node tools/embed-examples.js
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'examples');
const idx = path.join(root, 'index.html');

const obj = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  obj[path.basename(f, '.json')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
}

const html = fs.readFileSync(idx, 'utf8');
const re = /(\/\* EXAMPLES:BEGIN \*\/)[\s\S]*?(\/\* EXAMPLES:END \*\/)/;
if (!re.test(html)) {
  console.error('EXAMPLES markers not found in index.html');
  process.exit(1);
}
fs.writeFileSync(idx, html.replace(re, (_, a, b) => a + JSON.stringify(obj) + b));
console.log(`Embedded ${Object.keys(obj).length} examples into index.html: ${Object.keys(obj).join(', ')}`);
