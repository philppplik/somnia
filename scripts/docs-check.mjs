#!/usr/bin/env node
// Fails when a relative Markdown link in docs/ or README.md points to a missing file.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scope = process.argv.slice(2);
const targets = scope.length ? scope.map((p) => resolve(root, p)) : [join(root, 'docs'), join(root, 'README.md')];

function* walk(p) {
  if (statSync(p).isFile()) { if (p.endsWith('.md')) yield p; return; }
  for (const e of readdirSync(p, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    yield* walk(join(p, e.name));
  }
}

const ignoreFile = join(root, 'docs', '.docs-check-ignore');
const ignored = new Set(existsSync(ignoreFile) ? readFileSync(ignoreFile, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : []);

let bad = 0;
for (const t of targets) {
  for (const f of walk(t)) {
    const text = readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      let href = m[1];
      if (/^(https?:|mailto:|#)/.test(href)) continue;
      href = href.split('#')[0];
      if (!href) continue;
      if (ignored.has(`${f.replace(root + '/', '')} ${m[1]}`)) continue;
      if (!existsSync(resolve(dirname(f), decodeURI(href)))) {
        console.log(`${f.replace(root + '/', '')}: broken link ${m[1]}`);
        bad++;
      }
    }
  }
}
console.log(bad ? `${bad} broken link(s)` : 'docs links ok');
process.exit(bad ? 1 : 0);
