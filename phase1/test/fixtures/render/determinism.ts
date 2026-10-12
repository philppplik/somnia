import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readdirSync, readFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {manifest} from './corpus';
// Plan step 3.6: render every fixture twice (two separate Playwright runs, same machine and browser)
// and require byte-identical PNGs. Does not read, write or update the reference goldens.
const here = path.dirname(fileURLToPath(import.meta.url));
const phase1 = path.resolve(here, '../../..');
const out = path.join(phase1, 'test-results', 'render-determinism-captures');
rmSync(out, {recursive: true, force: true});
const hashes: Array<Map<string, string>> = [];
for (const run of [1, 2]) {
  const dir = path.join(out, `run${run}`);
  const r = spawnSync('npx', ['playwright', 'test', '--config', path.join(here, 'playwright.determinism.config.ts')],
    {cwd: phase1, stdio: 'inherit', shell: process.platform === 'win32', env: {...process.env, SOMNIA_RENDER_CAPTURE_DIR: dir}});
  if (r.status !== 0) { console.error(`determinism: capture run ${run} failed`); process.exit(1); }
  hashes.push(new Map(readdirSync(dir).sort().map(f => [f, createHash('sha256').update(readFileSync(path.join(dir, f))).digest('hex')])));
}
const expected = manifest.fixtures.reduce((n, f) => n + f.viewports.length, 0);
const [a, b] = hashes;
const problems: string[] = [];
if (a.size !== expected || b.size !== expected) problems.push(`expected ${expected} captures per run, got ${a.size} and ${b.size}`);
for (const [file, hash] of a) if (b.get(file) !== hash) problems.push(`differs between runs: ${file}`);
if (problems.length) { console.error(`determinism FAILED\n${problems.join('\n')}\nCaptures kept in ${out}`); process.exit(1); }
console.log(`determinism OK: ${expected} captures identical across 2 runs`);
