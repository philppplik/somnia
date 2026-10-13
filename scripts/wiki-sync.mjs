#!/usr/bin/env node
// Builds GitHub wiki pages from docs/guide/*.md.
// Usage: node scripts/wiki-sync.mjs <wiki-checkout-dir>
// Writes pages into the directory. It never commits or pushes; review the diff and push yourself.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guide = join(root, 'docs', 'guide');
const out = resolve(process.argv[2] ?? '');
if (!process.argv[2]) { console.error('usage: wiki-sync.mjs <wiki-checkout-dir>'); process.exit(1); }
mkdirSync(out, { recursive: true });

const repo = 'https://github.com/philppplik/somnia/blob/main';
const pageName = (f) => f === 'README.md' ? 'Home' : f.replace(/\.md$/, '').split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('-');
const files = readdirSync(guide).filter((f) => f.endsWith('.md')).sort();
const names = new Map(files.map((f) => [f, pageName(f)]));

function rewrite(text) {
  return text.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (m, label, href) => {
    if (/^(https?:|mailto:|#)/.test(href)) return m;
    const [path, hash] = href.split('#');
    const base = path.split('/').pop();
    if (!path.includes('/') && names.has(base)) return `[${label}](${names.get(base)}${hash ? '#' + hash : ''})`;
    // Anything outside docs/guide points at the repository file.
    const abs = resolve(guide, path);
    const rel = abs.replace(root + '/', '');
    return `[${label}](${repo}/${rel}${hash ? '#' + hash : ''})`;
  });
}

const banner = '<!-- Generated from docs/guide by scripts/wiki-sync.mjs. Edit the guide, not this page. -->\n\n';
for (const f of files) writeFileSync(join(out, names.get(f) + '.md'), banner + rewrite(readFileSync(join(guide, f), 'utf8')));

const side = ['**Somnia**', '', ...files.map((f) => `- [[${names.get(f)}]]`.replace(/\[\[(.+)\]\]/, (_, n) => `[${n === 'Home' ? 'Home' : n.replace(/-/g, ' ')}](${n})`)), '', `[Repository](https://github.com/philppplik/somnia) · [Releases](https://github.com/philppplik/somnia/releases)`, ''];
writeFileSync(join(out, '_Sidebar.md'), side.join('\n'));
console.log(`wrote ${files.length} pages to ${out}`);
