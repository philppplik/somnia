// Release guard (plan 2.2): a bundle built WITHOUT VITE_SOMNIA_CONTROL=1 must not contain the control hook.
// Usage: node scripts/check-no-control.mjs [distDir]   (default: dist). Pass --expect-present to assert the opposite for control builds.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
const expectPresent = args.includes('--expect-present');
const dir = args.find(a => !a.startsWith('--')) ?? 'dist';
const NEEDLE = '__somniaControl';
function* walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) yield* walk(p); else if (/\.(m?js|html|css|map)$/.test(n)) yield p; } }
const hits = [];
let scanned = 0;
for (const f of walk(dir)) { scanned++; if (readFileSync(f, 'utf8').includes(NEEDLE)) hits.push(f); }
if (scanned === 0) { console.error(`check-no-control: no files under ${dir}. Build first.`); process.exit(2); }
if (expectPresent) {
  if (!hits.length) { console.error(`check-no-control: expected ${NEEDLE} in the control build, found none (${scanned} files).`); process.exit(1); }
  console.log(`check-no-control: ${NEEDLE} present in ${hits.length} file(s), as expected for a control build.`);
} else {
  if (hits.length) { console.error(`check-no-control: ${NEEDLE} found in a release bundle:\n${hits.join('\n')}`); process.exit(1); }
  console.log(`check-no-control: ok, ${NEEDLE} absent from ${scanned} files in ${dir}.`);
}
