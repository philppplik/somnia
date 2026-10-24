import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPublishStore } from './deploy/publishStore';
import { describeBuildFailure } from './deploy/publishModel';
import type { DeployTargetStatus } from './deploy/contract';

type Snap = { phase: string; errorKey?: string; errorPath?: string; summary?: { fileCount: number; totalBytes: number } };
const status: DeployTargetStatus = { target: { id: 's1', name: 'Site', host: '203.0.113.10', port: 22, user: 'somnia', domain: 'example.com', kind: 'static', keySlot: 'deploy-key:s1' }, state: 'ready', fingerprint: 'SHA256:abc' };

function rig(buildOutcome: Snap | 'none', needed = true) {
  const order: string[] = []; const phases: string[] = [];
  let snap: Snap = { phase: 'idle' }; const subs = new Set<() => void>();
  const emit = (s: Snap) => { snap = s; subs.forEach(f => f()); };
  const store = createPublishStore({
    run: async (id) => { order.push(id); return { releaseId: 'r1', rolledBack: false, url: 'https://example.com' }; },
    backend: { targetsList: async () => [status], releasesList: async () => [], openSite: async () => {} },
    onProgress: () => () => {},
    ...(buildOutcome === 'none' ? {} : { build: {
      needed: () => needed,
      run: async () => { order.push('build'); emit({ phase: 'installing' }); emit({ phase: 'building' }); emit({ phase: 'collecting' }); await Promise.resolve(); emit(buildOutcome); },
      getSnapshot: () => snap, subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    } }),
  });
  store.subscribe(() => { const p = store.getState().build.phase; if (p && phases[phases.length - 1] !== p) phases.push(p); });
  return { store, order, phases };
}
const done: Snap = { phase: 'done', summary: { fileCount: 12, totalBytes: 4096 } };

test('build runs first, then deploy.publish; progress shows install, build, check phases', async () => {
  const r = rig(done); await r.store.open({ targetId: 's1', view: 'home' });
  await r.store.publish('s1');
  assert.deepEqual(r.order, ['build', 'deploy.publish']);
  assert.deepEqual(r.phases, ['building', 'installing', 'building', 'collecting', 'done']);
  assert.equal(r.store.getState().result?.outcome.releaseId, 'r1'); assert.equal(r.store.getState().build.phase, null);
});

test('a failed build blocks publish: deploy.publish never runs, plain message, retry offered', async () => {
  const r = rig({ phase: 'failed', errorKey: 'frameworks.build.failed' }); await r.store.open({ targetId: 's1', view: 'home' });
  await r.store.publish('s1');
  assert.deepEqual(r.order, ['build']);
  const s = r.store.getState();
  assert.equal(s.busy, null); assert.equal(s.result, null); assert.equal(s.failure?.code, 'build'); assert.equal(s.failure?.messageKey, 'frameworks.build.failed');
  assert.deepEqual(s.failure?.actions, ['retry', 'dismiss']);
});

test('a refused artifact (.env and friends) blocks publish and names the file', async () => {
  const r = rig({ phase: 'failed', errorKey: 'frameworks.artifact.forbidden', errorPath: 'assets/.env' }); await r.store.open({ targetId: 's1', view: 'home' });
  await r.store.publish('s1');
  assert.deepEqual(r.order, ['build']);
  assert.equal(r.store.getState().failure?.messageKey, 'frameworks.artifact.forbidden'); assert.equal(r.store.getState().failure?.path, 'assets/.env');
});

test('a build that finished without a manifest summary is treated as failed', async () => {
  const r = rig({ phase: 'done' }); await r.store.open({ targetId: 's1', view: 'home' });
  await r.store.publish('s1'); assert.deepEqual(r.order, ['build']);
});

test('projects that need no build, or a missing builder, publish directly', async () => {
  const a = rig(done, false); await a.store.open({ targetId: 's1', view: 'home' }); await a.store.publish('s1'); assert.deepEqual(a.order, ['deploy.publish']);
  const b = rig('none'); await b.store.open({ targetId: 's1', view: 'home' }); await b.store.publish('s1'); assert.deepEqual(b.order, ['deploy.publish']);
});

test('after a failed build a second click builds again (no stale success)', async () => {
  const r = rig({ phase: 'failed', errorKey: 'frameworks.build.timeout' }); await r.store.open({ targetId: 's1', view: 'home' });
  await r.store.publish('s1'); await r.store.publish('s1');
  assert.deepEqual(r.order, ['build', 'build']);
});

test('unknown error keys never reach the screen', () => {
  assert.equal(describeBuildFailure('something <b>else</b>').messageKey, 'frameworks.build.failed');
  assert.equal(describeBuildFailure('frameworks.artifact.link', 'a/b').messageKey, 'frameworks.artifact.link');
});

test('every key of the build step exists in all five locales', () => {
  const keys = ['installing', 'building', 'collecting', 'done'].map(k => `deploy.progress.build.${k}`).concat(['deploy.progress.compare', 'deploy.progress.compare.done'])
    .concat(['noIndex', 'forbidden', 'link', 'tooLarge', 'distMissing', 'notStatic'].map(k => `frameworks.artifact.${k}`), ['frameworks.build.failed', 'frameworks.build.timeout']);
  for (const l of ['en', 'de', 'es', 'fr', 'pt-BR']) {
    const t = JSON.parse(readFileSync(new URL(`../locales/${l}.json`, import.meta.url), 'utf8')) as Record<string, string>;
    for (const k of keys) assert.ok(t[k], `${l} ${k}`);
  }
});

test('install memo: first publish installs, same dependencies skip, changed dependencies or a failed build install again', async () => {
  const { createInstallMemo } = await import('./deploy/publishModel');
  const m = createInstallMemo();
  assert.equal(m.needsInstall('p', 'a'), true); m.record('p', 'a', true);
  assert.equal(m.needsInstall('p', 'a'), false); assert.equal(m.needsInstall('p', 'b'), true); assert.equal(m.needsInstall('q', 'a'), true);
  m.record('p', 'a', false); assert.equal(m.needsInstall('p', 'a'), true);
});
