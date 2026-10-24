// Agent harness (plan 2.3): drives the web build through window.__somniaControl, with mocked desktop IPC.
// DEV/TEST ONLY. Starts `vite` with VITE_SOMNIA_CONTROL=1 and the starter fixture; never touches a release build.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function startServer({ port = 1431 } = {}) {
  const proc = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--host', '127.0.0.1', '--strictPort'], {
    cwd: root, env: { ...process.env, VITE_SOMNIA_CONTROL: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => proc.kill('SIGTERM') }; } catch { /* not up yet */ }
    if (proc.exitCode !== null) throw new Error('vite exited early');
    await sleep(500);
  }
  proc.kill('SIGTERM');
  throw new Error('vite did not start');
}

/** Opens the app with the starter project and returns a handle around the control hook. */
export async function openApp({ url, outDir = 'tests/artifacts/agent-harness', viewport = { width: 1440, height: 900 } }) {
  mkdirSync(join(root, outDir), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('somnia.fixture', 'starter'); });
  await page.goto(url);
  await page.waitForFunction(() => !!window.__somniaControl, null, { timeout: 30000 });
  const ctl = {
    inspect: () => page.evaluate(() => window.__somniaControl.inspect()),
    getState: p => page.evaluate(x => window.__somniaControl.getState(x), p),
    runCommand: (id, params) => page.evaluate(([i, p]) => window.__somniaControl.runCommand(i, p), [id, params]),
    listCommands: () => page.evaluate(() => window.__somniaControl.listCommands()),
    activity: () => page.evaluate(() => window.__somniaControl.recentActivity()),
    screenshot: async name => { const path = join(root, outDir, `${name}.png`); await page.screenshot({ path }); return path; },
  };
  return { page, browser, ctl, errors, close: () => browser.close() };
}
