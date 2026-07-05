#!/usr/bin/env node
// Embed tools/core.js into index.html so the app stays a single file that
// works over file:// (same approach as embed-examples.js).
// Run after editing tools/core.js: node tools/embed-core.js
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const idx = path.join(root, 'index.html');

const core = fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8').trimEnd();

const html = fs.readFileSync(idx, 'utf8');
const re = /(\/\* CORE:BEGIN[^\n]*\*\/)[\s\S]*?(\/\* CORE:END \*\/)/;
if (!re.test(html)) {
  console.error('CORE markers not found in index.html');
  process.exit(1);
}
fs.writeFileSync(idx, html.replace(re, (_, a, b) => a + '\n' + core + '\n' + b));
console.log('Embedded tools/core.js into index.html');
