/**
 * Dreamweaver parity checklist generator (engine-hardening plan, step 7.2).
 *
 * `tsx scripts/gen-dreamweaver-parity.ts` writes docs/dreamweaver-parity.md.
 * `--check` fails when the file is stale. It also fails if the catalog is invalid. Commands in the
 * inventory that no catalog row mentions are listed as a warning only, so new commands do not
 * block CI but are visible.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import '../src/lib/studios';
import { listStudios } from '../src/lib/studios/registry';
import { FEATURES } from './dreamweaver-parity/catalog';
import { evaluate, render, validateCatalog, type Inputs } from './dreamweaver-parity/model';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const inventoryPath = join(repoRoot, 'docs', 'ui-commands.json');
const outPath = join(repoRoot, 'docs', 'dreamweaver-parity.md');

const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8')) as { commands: { id: string }[] };
const commandIds = new Set(inventory.commands.map(c => c.id));

const inputs: Inputs = {
  commandIds,
  studioIds: new Set(listStudios().map(s => s.id)),
  pathExists: p => existsSync(join(repoRoot, p)),
  sourceRegisters: (p, id) => existsSync(join(repoRoot, p)) && readFileSync(join(repoRoot, p), 'utf8').includes(`'${id}'`),
};

const problems = validateCatalog(FEATURES);
if (problems.length) {
  console.error(`Invalid parity catalog:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

const rows = FEATURES.map(f => evaluate(f, inputs));
const next = render(rows);

const referenced = new Set(FEATURES.flatMap(f => f.commands ?? []));
const uncatalogued = [...commandIds].filter(id => !referenced.has(id));
if (uncatalogued.length) console.warn(`warning: ${uncatalogued.length} inventory commands are not in the parity catalog: ${uncatalogued.join(', ')}`);

if (process.argv.includes('--check')) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (current !== next) {
    console.error('docs/dreamweaver-parity.md is out of date. Run: npm run inventory:dreamweaver-parity');
    process.exit(1);
  }
  console.log(`check:dreamweaver-parity OK (${rows.length} features in sync)`);
} else {
  writeFileSync(outPath, next);
  console.log(`Wrote ${rows.length} features to docs/dreamweaver-parity.md`);
}
