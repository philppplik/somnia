import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandDispatcher } from '../commandDispatcher';
import { createDeployCommandSpecs } from '../deploy/commandSpecs';
import { captureGesture, registerDeployConfirmPresenter } from '../deploy/confirmation';
import { createPublishStore } from '../deploy/publishStore';
import type { DeployTarget, DeployTargetStatus } from '../deploy/contract';
import { createFakeDeployBackend, FAKE_FINGERPRINT } from './fakeBackend';

const target = (id: string): DeployTarget => ({ id, name: id, host: '203.0.113.10', port: 22, user: 'somnia', domain: 'example.com', kind: 'static', keySlot: `deploy-key:${id}` });
const ready = (id: string): DeployTargetStatus => ({ target: target(id), state: 'ready', fingerprint: FAKE_FINGERPRINT });
const files = [
  { path: 'index.html', size: 100, sha256: 'a'.repeat(64), change: 'changed' as const },
  { path: 'hero.webp', size: 400, sha256: 'b'.repeat(64), change: 'added' as const },
  { path: 'old.css', size: 10, sha256: 'c'.repeat(64), change: 'removed' as const },
];

function world(extra: Partial<Parameters<typeof createFakeDeployBackend>[0]> = {}, build?: Parameters<typeof createPublishStore>[0]['build']) {
  const fake = createFakeDeployBackend({ targets: [ready('s1')], files, ...extra });
  const d = new CommandDispatcher();
  for (const s of createDeployCommandSpecs({ backend: () => fake.backend })) d.register(s);
  let asked = 0;
  const off = registerDeployConfirmPresenter({ confirmPlan: async () => { asked++; return captureGesture({ isTrusted: true }); }, confirmHostKey: async () => null, confirmHostKeyReplace: async () => null });
  const store = createPublishStore({ run: (id, p) => d.runCommand(id, p, { origin: 'ui' }), backend: fake.backend, onProgress: () => () => {}, build });
  return { ...fake, store, off, asked: () => asked, d };
}

test('dryRun stages the plan, uploads nothing and never opens the confirmation dialog', async () => {
  const w = world();
  try {
    await w.store.refresh();
    const plan = await w.store.dryRun('s1');
    assert.ok(plan);
    assert.deepEqual(w.calls.filter(c => !c.startsWith('save')), ['plan:s1']);
    assert.equal(w.asked(), 0);
    assert.equal(w.store.getState().busy, null);
    assert.equal(w.store.getState().result, null);
    assert.equal(w.store.getState().selectedId, 's1');
  } finally { w.off(); }
});

test('dryRun builds first when the project needs a build, and a failed build never reaches deploy.plan', async () => {
  let phase = 'done'; const ran: string[] = [];
  const build = { needed: () => true, run: async () => { ran.push('build'); }, getSnapshot: () => phase === 'done' ? { phase: 'done', summary: { fileCount: 3, totalBytes: 510 } } : { phase: 'error', errorKey: 'frameworks.err.x' }, subscribe: () => () => {} };
  const w = world({}, build);
  try {
    await w.store.refresh();
    assert.ok(await w.store.dryRun('s1'));
    assert.deepEqual(ran, ['build']);
    phase = 'error';
    const before = w.calls.length;
    assert.equal(await w.store.dryRun('s1'), null);
    assert.equal(w.calls.length, before);
    assert.equal(w.store.getState().failure?.during, 'plan');
    assert.equal(w.store.getState().busy, null);
  } finally { w.off(); }
});

test('dryRun is ignored while another action runs and clears an older staged plan first', async () => {
  const w = world();
  try {
    await w.store.refresh();
    w.store.stagePlan({ planHash: 'x'.repeat(64), action: 'publish', targetId: 's1', fingerprint: FAKE_FINGERPRINT, buildId: 'old', files: [] });
    const p = w.store.dryRun('s1');
    assert.equal(w.store.getState().staged, null);
    assert.equal(w.store.getState().busy, 'plan');
    assert.equal(await w.store.dryRun('s1'), null);
    await p;
    assert.equal(w.store.getState().staged?.buildId, 'fake-build');
  } finally { w.off(); }
});

test('updateTarget saves a changed copy: id, host and key slot stay, an empty domain removes it', async () => {
  const w = world();
  try {
    await w.store.refresh();
    assert.equal(await w.store.updateTarget('s1', { domain: 'new.example.org' }), true);
    let t = w.targets.get('s1')!.target;
    assert.deepEqual([t.id, t.host, t.keySlot, t.domain], ['s1', '203.0.113.10', 'deploy-key:s1', 'new.example.org']);
    assert.equal(w.targets.get('s1')!.state, 'ready');
    assert.equal(await w.store.updateTarget('s1', { domain: '' }), true);
    t = w.targets.get('s1')!.target;
    assert.equal('domain' in t, false);
    assert.equal(await w.store.updateTarget('missing', { domain: 'a.com' }), false);
  } finally { w.off(); }
});

test('publish through the panel still asks for the confirmation exactly once', async () => {
  const w = world();
  try {
    await w.store.refresh();
    await w.store.publish('s1');
    assert.equal(w.asked(), 1);
    assert.equal(w.store.getState().result?.kind, 'publish');
    assert.equal(w.store.getState().result?.outcome.url, 'https://example.com');
  } finally { w.off(); }
});
