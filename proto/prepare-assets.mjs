// Copies the font files out of node_modules into public/fonts, and the logo from the deployed site.
// Run once after `npm install`, before `node build.mjs`.
import fs from 'node:fs';
const F = [
  ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter.woff2'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', 'jbmono-400.woff2'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2', 'jbmono-500.woff2'],
];
fs.mkdirSync('public/fonts', { recursive: true });
for (const [src, dst] of F) fs.copyFileSync('node_modules/' + src, 'public/fonts/' + dst);
console.log('fonts ready. The logo is docs/logo.svg in the repo (public/index.html expects logo.svg: copy it to public/).');
