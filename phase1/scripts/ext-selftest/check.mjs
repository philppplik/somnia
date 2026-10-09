#!/usr/bin/env node
// Usage: node scripts/ext-selftest/check.mjs -- <app-binary> [args...]
// Starts a local "evil" listener, runs the packaged app with SOMNIA_EXT_SELFTEST=<tmp>/out.json, then validates out.json
// and asserts the listener saw ZERO connections (independent proof the network was blocked).
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {readFileSync, existsSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export function validateReport(r, hits = 0) {
  const f = [];
  if (!r || r.schema !== 1) f.push('bad or missing schema');
  else {
    if (!r.ok) f.push(...(r.failures?.length ? r.failures : ['report says ok=false']));
    for (const k of ['worker', 'panel', 'navigation']) if (!r[k]) f.push(`${k}: missing from report`);
    if (r.csp_mode !== 'prod') f.push('not run under the prod CSP');
  }
  if (hits > 0) f.push(`evil listener saw ${hits} connection(s)`);
  return f;
}

async function main() {
  const i = process.argv.indexOf('--'); const cmd = process.argv.slice(i + 1);
  if (i < 0 || !cmd.length) { console.error('usage: check.mjs -- <app> [args]'); process.exit(64); }
  let hits = 0;
  const srv = createServer(s => { hits++; s.destroy(); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const out = join(mkdtempSync(join(tmpdir(), 'somnia-ext-')), 'out.json');
  const child = spawn(cmd[0], cmd.slice(1), {stdio: 'inherit', env: {...process.env, SOMNIA_EXT_SELFTEST: out, SOMNIA_EXT_SELFTEST_EVIL: `http://127.0.0.1:${port}`}});
  const timer = setTimeout(() => child.kill('SIGKILL'), Number(process.env.SELFTEST_TIMEOUT_MS ?? 120000));
  const code = await new Promise(r => child.on('exit', r)); clearTimeout(timer); srv.close();
  if (!existsSync(out)) { console.error(`FAIL: app exited (${code}) without writing ${out}`); process.exit(1); }
  const failures = validateReport(JSON.parse(readFileSync(out, 'utf8')), hits);
  console.log(readFileSync(out, 'utf8'));
  if (failures.length) { console.error('FAIL:\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('ext self-test OK');
}
if (import.meta.url === `file://${process.argv[1]}`) main();
