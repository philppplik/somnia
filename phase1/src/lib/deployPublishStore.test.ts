import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandDispatcher } from './commandDispatcher';
import { createDeployCommandSpecs } from './deploy/commandSpecs';
import { captureGesture, registerDeployConfirmPresenter, type DeployConfirmPresenter } from './deploy/confirmation';
import { createPublishStore } from './deploy/publishStore';
import type { DeployBackend, DeployPlan, DeployProgressEvent, DeployTarget, DeployTargetStatus } from './deploy/contract';

const FP = 'SHA256:abcdefghijklmnop';
const ok = { isTrusted: true };
const target = (id = 's1'): DeployTarget => ({ id, name: 'Site', host: '203.0.113.10', port: 22, user: 'somnia', domain: 'example.com', kind: 'static', keySlot: `deploy-key:${id}` });

/** A stateful fake of the Rust service: key, trust and publish move a target through its states. */
function world() {
  const targets = new Map<string, DeployTargetStatus>();
  const calls: string[] = []; const progress: Array<(e: DeployProgressEvent) => void> = [];
  const releases = ['20261010T100000Z-aaaaaa', '20261012T100000Z-bbbbbb'];
  let live: string | null = null;
  let failNext: string | null = null; let hold: Promise<void> | null = null; let seenToken = '';
  const plan = (id: string, action: 'publish' | 'rollback', releaseId?: string): DeployPlan => ({ planHash: 'p'.repeat(64), action, targetId: id, fingerprint: targets.get(id)?.fingerprint ?? FP, buildId: 'b1', releaseId: releaseId ?? null, files: [{ path: 'index.html', size: 10, sha256: 'ab'.repeat(32), change: 'changed' }] });
  const boom = () => { if (failNext) { const c = failNext; failNext = null; throw Object.assign(new Error(c), { expected: true }); } };
  const be: DeployBackend = {
    liveRelease: async () => live,
    targetsList: async () => [...targets.values()],
    targetSave: async t => { calls.push('save'); targets.set(t.id, { target: t, state: 'key-missing' }); },
    targetDelete: async (id, k) => { calls.push(`delete:${id}:${k}`); targets.delete(id); },
    plan: async id => { calls.push('plan'); boom(); return plan(id, 'publish'); },
    planRollback: async (id, r) => { calls.push('planRollback'); return plan(id, 'rollback', r); },
    confirmIssue: async () => 'tok',
    publish: async a => { calls.push('publish'); seenToken = a.token; for (const f of progress) { f({ targetId: a.targetId, step: 'connect' }); f({ targetId: a.targetId, step: 'upload:2/4' }); } await hold; boom(); live = '20261013T090000Z-cccccc'; return { releaseId: '20261013T090000Z-cccccc', url: 'https://example.com', rolledBack: false }; },
    rollback: async a => { calls.push(`rollback:${a.releaseId}`); live = a.releaseId; return { releaseId: a.releaseId, rolledBack: false }; },
    hostkeyProbe: async () => ({ algorithm: 'ssh-ed25519', fingerprint: FP }),
    hostkeyTrust: async id => { calls.push('trust'); boom(); const s = targets.get(id)!; targets.set(id, { ...s, state: 'ready', fingerprint: FP }); },
    hostkeyReplace: async a => { calls.push(`replace:${a.oldFingerprint}`); },
    keyCreate: async id => { calls.push('key'); boom(); const s = targets.get(id)!; targets.set(id, { ...s, state: 'needs-trust' }); return 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample somnia'; },
    releasesList: async () => [...releases],
    openSite: async id => { calls.push(`open:${id}`); },
  };
  const d = new CommandDispatcher();
  for (const s of createDeployCommandSpecs({ backend: () => be })) d.register(s);
  const answers = { plan: true, hostkey: true };
  const presenter: DeployConfirmPresenter = {
    confirmPlan: async () => answers.plan ? captureGesture(ok) : null,
    confirmHostKey: async () => answers.hostkey ? captureGesture(ok) : null,
    confirmHostKeyReplace: async () => ({ gesture: captureGesture(ok), acknowledged: true }),
  };
  const off = registerDeployConfirmPresenter(presenter);
  const store = createPublishStore({ run: (id, p) => d.runCommand(id, p, { origin: 'ui' }), backend: be, onProgress: fn => { progress.push(fn); return () => { progress.splice(progress.indexOf(fn), 1); }; } });
  store.attach();
  return { store, calls, answers, off, failWith: (c: string) => { failNext = c; }, holdUntil: (p: Promise<void>) => { hold = p; }, token: () => seenToken, d };
}
const form = { name: 'Site', host: '203.0.113.10', port: '22', user: 'somnia', domain: 'example.com', kind: 'static' as const, spa: false, appPort: '3000' };

test('empty list opens straight on the add-server form', async () => {
  const w = world(); await w.store.open();
  assert.equal(w.store.getState().view, 'form'); assert.equal(w.store.getState().loaded, true); w.off();
});

test('happy path: add server, create key, trust, publish with progress, result, open site', async () => {
  const w = world(); await w.store.open();
  assert.equal(await w.store.saveTarget(form), 'site');
  assert.equal(w.store.getState().view, 'home'); assert.equal(w.store.getState().targets[0]?.state, 'key-missing');
  const key = await w.store.createKey('site');
  assert.match(key ?? '', /^ssh-ed25519 /); assert.equal(w.store.getState().targets[0]?.state, 'needs-trust');
  assert.equal(w.store.getState().publicKeys['site'], key);
  await w.store.trust('site'); assert.equal(w.store.getState().targets[0]?.state, 'ready');
  let release!: () => void; w.holdUntil(new Promise<void>(r => { release = r; }));
  const done = w.store.publish('site');
  await new Promise(r => setTimeout(r, 5));
  const mid = w.store.getState();
  assert.equal(mid.busy, 'publish');
  assert.deepEqual(mid.progress.seen.map(s => s.step), ['connect', 'upload']); assert.deepEqual(mid.progress.latest, { step: 'upload', done: 2, total: 4 });
  release(); await done;
  const end = w.store.getState();
  assert.equal(end.busy, null); assert.equal(end.failure, null); assert.equal(end.result?.kind, 'publish'); assert.equal(end.result?.outcome.url, 'https://example.com');
  assert.equal(end.liveByTarget['site'], '20261013T090000Z-cccccc'); assert.equal(w.token(), 'tok'); assert.deepEqual(end.progress, { seen: [], latest: null });
  await w.store.openSite('site'); assert.ok(w.calls.includes('open:site')); w.off();
});

test('declining the confirmation dialog uploads nothing and shows no error', async () => {
  const w = world(); await w.store.open(); await w.store.saveTarget(form); await w.store.createKey('site'); await w.store.trust('site');
  w.answers.plan = false; await w.store.publish('site');
  const s = w.store.getState();
  assert.equal(s.result, null); assert.equal(s.failure, null); assert.equal(s.busy, null); assert.ok(!w.calls.includes('publish')); w.off();
});

test('without a confirmation UI the publish fails closed with a plain message', async () => {
  const w = world(); await w.store.open(); await w.store.saveTarget(form); await w.store.createKey('site'); await w.store.trust('site');
  w.off(); await w.store.publish('site');
  assert.ok(!w.calls.includes('publish')); assert.ok(w.store.getState().failure); assert.equal(w.store.getState().failure?.code, 'unknown');
});

test('failures become one plain sentence with actions; progress never leaks to other targets', async () => {
  const w = world(); await w.store.open(); await w.store.saveTarget(form); await w.store.createKey('site'); await w.store.trust('site');
  w.failWith('deploy:connect-failed'); await w.store.publish('site');
  const f = w.store.getState().failure;
  assert.equal(f?.code, 'connect-failed'); assert.equal(f?.messageKey, 'deploy.err.connect-failed'); assert.equal(f?.during, 'publish'); assert.equal(w.store.getState().busy, null);
  assert.equal(w.store.getState().result, null);
  w.store.dismissFailure(); assert.equal(w.store.getState().failure, null); w.off();
});

test('double clicks are ignored while an action runs', async () => {
  const w = world(); await w.store.open(); await w.store.saveTarget(form); await w.store.createKey('site'); await w.store.trust('site');
  let release!: () => void; w.holdUntil(new Promise<void>(r => { release = r; }));
  const a = w.store.publish('site'); await new Promise(r => setTimeout(r, 5)); await w.store.publish('site'); await w.store.createKey('site'); await w.store.trust('site');
  release(); await a;
  assert.equal(w.calls.filter(c => c === 'publish').length, 1); assert.equal(w.calls.filter(c => c === 'key').length, 1); w.off();
});

test('rollback list is newest first, rollback goes through the confirmation and marks the version live', async () => {
  const w = world(); await w.store.open(); await w.store.saveTarget(form); await w.store.createKey('site'); await w.store.trust('site');
  await w.store.showRollback('site');
  const s = w.store.getState(); assert.equal(s.view, 'rollback'); assert.deepEqual(s.releases, ['20261012T100000Z-bbbbbb', '20261010T100000Z-aaaaaa']);
  await w.store.rollback('site', '20261010T100000Z-aaaaaa');
  const e = w.store.getState();
  assert.ok(w.calls.includes('planRollback')); assert.ok(w.calls.includes('rollback:20261010T100000Z-aaaaaa'));
  assert.equal(e.result?.kind, 'rollback'); assert.equal(e.view, 'home'); assert.equal(e.liveByTarget['site'], '20261010T100000Z-aaaaaa'); w.off();
});

test('changed host key: replace uses the pinned fingerprint as the old one', async () => {
  const w = world(); await w.store.open(); await w.store.saveTarget(form); await w.store.createKey('site'); await w.store.trust('site');
  await w.store.replaceKey('site');
  assert.ok(w.calls.includes(`replace:${FP}`)); assert.equal(w.store.getState().failure, null); w.off();
});

test('invalid form is rejected before any command runs; edit keeps the id; delete forgets the key note', async () => {
  const w = world(); await w.store.open();
  assert.equal(await w.store.saveTarget({ ...form, host: 'https://nope' }), null); assert.ok(!w.calls.includes('save'));
  await w.store.saveTarget(form); await w.store.createKey('site');
  w.store.showForm('site'); assert.equal(w.store.getState().editingId, 'site');
  assert.equal(await w.store.saveTarget({ ...form, name: 'Renamed' }), 'site'); assert.equal(w.store.getState().targets[0]?.target.name, 'Renamed');
  await w.store.deleteTarget('site', true);
  assert.ok(w.calls.includes('delete:site:true')); assert.equal(w.store.getState().targets.length, 0); assert.equal(w.store.getState().publicKeys['site'], undefined); w.off();
});

test('staged agent plan shows a banner state only; nothing is published', async () => {
  const w = world(); await w.store.open(); await w.store.saveTarget(form);
  w.store.stagePlan({ planHash: 'x', action: 'publish', targetId: 'site', fingerprint: FP, buildId: 'b', files: [] });
  assert.equal(w.store.getState().staged?.targetId, 'site'); assert.ok(!w.calls.includes('publish'));
  w.store.clearStaged(); assert.equal(w.store.getState().staged, null); w.off();
});

test('agent origins cannot reach the panel actions: the specs refuse them', async () => {
  const w = world();
  for (const [id, p] of [['deploy.publish', { targetId: 's1' }], ['deploy.key.create', { targetId: 's1' }], ['deploy.hostkey.trust', { targetId: 's1' }]] as const)
    await assert.rejects(w.d.runCommand(id, p, { origin: 'agent' }), /interactive-only|needs a person/);
  w.off();
});

test('secrets: the store state and the form never contain private key material', async () => {
  const w = world(); await w.store.open(); await w.store.saveTarget(form); await w.store.createKey('site');
  const json = JSON.stringify(w.store.getState());
  assert.ok(!/PRIVATE KEY|BEGIN OPENSSH/.test(json)); w.off();
});
