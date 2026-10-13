import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandDispatcher, isCommandDispatchError } from './commandDispatcher';
import type { CommandOrigin } from './commandSpec';
import { AgentToolRegistry } from './agent/toolRegistry';
import { registerCommandTools } from './agent/commandTools';
import type { DeployBackend, DeployPlan, DeployTarget } from './deploy/contract';
import { __setGestureClock, captureGesture, consumeGesture, DeployConfirmationError, registerDeployConfirmPresenter, type DeployConfirmPresenter } from './deploy/confirmation';
import { createDeployCommandSpecs, HUMAN_ORIGINS, subscribeStagedPlans } from './deploy/commandSpecs';

const target: DeployTarget = { id: 's1', name: 'Site', host: '203.0.113.10', port: 22, user: 'somnia', domain: 'example.com', kind: 'static', keySlot: 'deploy-key:s1' };
const plan: DeployPlan = { planHash: 'h'.repeat(64), action: 'publish', targetId: 's1', fingerprint: 'SHA256:abcdefghijkl', buildId: 'b1', files: [{ path: 'index.html', size: 3, sha256: 'ab'.repeat(32), change: 'changed' }] };
const FP = 'SHA256:abcdefghijkl';

function fakeBackend() {
  const calls: string[] = [];
  const rec = <T,>(name: string, v: T) => async (...a: unknown[]) => { calls.push(`${name}:${JSON.stringify(a)}`); return v; };
  const be: DeployBackend = {
    targetsList: rec('targetsList', [{ target, state: 'ready' as const, fingerprint: FP }]),
    targetSave: rec('targetSave', undefined), targetDelete: rec('targetDelete', undefined),
    plan: rec('plan', plan), planRollback: rec('planRollback', { ...plan, action: 'rollback' as const, releaseId: '20261012T000000Z-aaaaaa' }),
    confirmIssue: rec('confirmIssue', 'tok-1'),
    publish: rec('publish', { releaseId: 'r1', url: 'https://example.com', rolledBack: false }),
    rollback: rec('rollback', { releaseId: 'r0', rolledBack: true }),
    hostkeyProbe: rec('hostkeyProbe', { algorithm: 'ssh-ed25519', fingerprint: FP }),
    hostkeyTrust: rec('hostkeyTrust', undefined), hostkeyReplace: rec('hostkeyReplace', undefined), keyCreate: rec('keyCreate', 'ssh-ed25519 AAAA somnia'), releasesList: rec('releasesList', []), openSite: rec('openSite', undefined),
  };
  return { be, calls };
}
const click = () => captureGesture({ isTrusted: true });
function presenter(over: Partial<DeployConfirmPresenter> = {}): DeployConfirmPresenter {
  return {
    confirmPlan: async () => click(), confirmHostKey: async () => click(),
    confirmHostKeyReplace: async () => ({ gesture: click(), acknowledged: true }), ...over,
  };
}
function setup(p?: DeployConfirmPresenter) {
  const { be, calls } = fakeBackend();
  const d = new CommandDispatcher();
  for (const s of createDeployCommandSpecs({ backend: () => be })) d.register(s);
  const off = p ? registerDeployConfirmPresenter(p) : () => {};
  return { d, calls, off, run: (id: string, params?: unknown, origin: CommandOrigin = 'ui') => d.runCommand(id, params, { origin }) };
}
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (isCommandDispatchError(e) ? (e.code === 'failed' ? e.message : e.code) : e instanceof Error ? e.message : 'other'));

test('specs: strict ids, expected levels, human-only set excludes agent surfaces', () => {
  const { d } = setup();
  const levels = Object.fromEntries(d.list().map(s => [s.id, s.level]));
  assert.deepEqual(levels, {
    'deploy.targets.list': 'read', 'deploy.plan': 'propose', 'deploy.publish': 'ui', 'deploy.rollback': 'ui', 'deploy.target.save': 'ui',
    'deploy.target.delete': 'ui', 'deploy.hostkey.trust': 'ui', 'deploy.hostkey.replace': 'ui', 'deploy.key.create': 'ui',
  });
  for (const o of ['agent', 'mcp', 'extension', 'macro', 'cli', 'control'] as const) assert.ok(!HUMAN_ORIGINS.includes(o), o);
});

test('agent and MCP origins: read and propose work, every state-changing command is forbidden-origin', async () => {
  const { d, calls, off } = setup(presenter());
  try {
  for (const origin of ['agent', 'mcp'] as const) {
    assert.equal(await code(d.runCommand('deploy.targets.list', {}, { origin })), 'ok');
    assert.equal(await code(d.runCommand('deploy.plan', { targetId: 's1' }, { origin })), 'ok');
    const forbidden: [string, unknown][] = [
      ['deploy.publish', { targetId: 's1' }], ['deploy.rollback', { targetId: 's1', releaseId: '20261012T000000Z-aaaaaa' }],
      ['deploy.target.save', { target }], ['deploy.target.delete', { targetId: 's1' }], ['deploy.hostkey.trust', { targetId: 's1' }],
      ['deploy.hostkey.replace', { targetId: 's1', oldFingerprint: FP }], ['deploy.key.create', { targetId: 's1' }],
    ];
    for (const [id, params] of forbidden) assert.equal(await code(d.runCommand(id, params, { origin })), 'forbidden-origin', `${origin} ${id}`);
  }
  assert.ok(!calls.some(c => /^(publish|rollback|targetSave|targetDelete|hostkeyTrust|hostkeyReplace|keyCreate|confirmIssue):/.test(c)), 'no mutation reached the backend');
  } finally { off(); }
});

test('extension, macro, cli and the dev control channel cannot publish or trust either', async () => {
  const { d, calls, off } = setup(presenter());
  try {
  for (const origin of ['extension', 'macro', 'cli', 'control'] as const) {
    for (const [id, params] of [['deploy.publish', { targetId: 's1' }], ['deploy.hostkey.trust', { targetId: 's1' }], ['deploy.key.create', { targetId: 's1' }], ['deploy.target.delete', { targetId: 's1' }]] as [string, unknown][]) {
      assert.equal(await code(d.runCommand(id, params, { origin })), 'forbidden-origin', `${origin} ${id}`);
    }
  }
  assert.ok(!calls.some(c => c.startsWith('publish:') || c.startsWith('confirmIssue:')));
  } finally { off(); }
});

test('agent tool bridge exposes only list and plan', () => {
  const { d } = setup();
  const registry = new AgentToolRegistry();
  const { registered } = registerCommandTools(registry, d);
  assert.equal(registered.length, 2, registered.join(','));
  assert.ok(registered.every(n => /deploy_(targets_list|plan)$/.test(n)));
});

test('publish without a confirmation UI fails and nothing is uploaded', async () => {
  const { d, calls, off } = setup();
  assert.equal(await code(d.runCommand('deploy.publish', { targetId: 's1' }, { origin: 'ui' })), 'deploy:no-confirmation-ui');
  assert.ok(!calls.some(c => c.startsWith('publish:') || c.startsWith('confirmIssue:')));
  off();
});

test('cancelled dialog: no token, no publish', async () => {
  const { run, calls, off } = setup(presenter({ confirmPlan: async () => null }));
  try {
    assert.deepEqual(await run('deploy.publish', { targetId: 's1' }), { status: 'cancelled' });
    assert.ok(!calls.some(c => c.startsWith('publish:') || c.startsWith('confirmIssue:')));
  } finally { off(); }
});

test('a forged gesture from a presenter is refused', async () => {
  const { run, calls, off } = setup(presenter({ confirmPlan: async () => ({}) as never }));
  try {
    assert.equal(await code(run('deploy.publish', { targetId: 's1' })), 'deploy:not-a-gesture');
    assert.ok(!calls.some(c => c.startsWith('confirmIssue:') || c.startsWith('publish:')));
  } finally { off(); }
});

test('gestures: untrusted events refused, one use, expire', () => {
  assert.throws(() => captureGesture({ isTrusted: false }), (e: unknown) => e instanceof DeployConfirmationError && e.code === 'not-a-gesture');
  const g = click();
  consumeGesture(g);
  assert.throws(() => consumeGesture(g), /not-a-gesture/);
  let now = 1_000;
  __setGestureClock(() => now);
  try {
    const old = click(); now += 61_000;
    assert.throws(() => consumeGesture(old), /gesture-expired/);
  } finally { __setGestureClock(() => Date.now()); }
});

test('happy path: the token minted for the plan hash is the one handed to publish', async () => {
  const seen: DeployPlan[] = [];
  const { run, calls, off } = setup(presenter({ confirmPlan: async (p) => { seen.push(p); return click(); } }));
  try {
    const out = await run('deploy.publish', { targetId: 's1' }) as { releaseId: string };
    assert.equal(out.releaseId, 'r1');
    assert.equal(seen[0]!.files[0]!.path, 'index.html');
    const order = calls.map(c => c.split(':')[0]);
    assert.deepEqual(order.filter(n => ['plan', 'confirmIssue', 'publish'].includes(n)), ['plan', 'confirmIssue', 'publish']);
    assert.ok(calls.includes(`confirmIssue:${JSON.stringify([plan.planHash])}`));
    assert.ok(calls.includes(`publish:${JSON.stringify([{ targetId: 's1', planHash: plan.planHash, token: 'tok-1' }])}`));
  } finally { off(); }
});

test('every publish asks again: two publishes, two dialogs', async () => {
  let asked = 0;
  const { run, off } = setup(presenter({ confirmPlan: async () => { asked++; return click(); } }));
  try { await run('deploy.publish', { targetId: 's1' }); await run('deploy.publish', { targetId: 's1' }); assert.equal(asked, 2); } finally { off(); }
});

test('no parameter can carry a token, a skip flag or a force flag', async () => {
  const { d, off } = setup(presenter());
  try {
    for (const extra of [{ token: 'x' }, { confirm: true }, { force: true }, { skipConfirmation: true }, { planHash: 'x' }]) {
      assert.equal(await code(d.runCommand('deploy.publish', { targetId: 's1', ...extra }, { origin: 'ui' })), 'invalid-params', JSON.stringify(extra));
    }
    assert.equal(await code(d.runCommand('deploy.publish', { targetId: '../x' }, { origin: 'ui' })), 'invalid-params');
    assert.equal(await code(d.runCommand('deploy.rollback', { targetId: 's1', releaseId: '../../etc' }, { origin: 'ui' })), 'invalid-params');
  } finally { off(); }
});

test('rollback uses the rollback plan and its own token', async () => {
  const { run, calls, off } = setup(presenter());
  try {
    const out = await run('deploy.rollback', { targetId: 's1', releaseId: '20261012T000000Z-aaaaaa' }) as { rolledBack: boolean };
    assert.equal(out.rolledBack, true);
    assert.ok(calls.some(c => c.startsWith('planRollback:')) && calls.some(c => c.startsWith('rollback:')) && calls.some(c => c.startsWith('confirmIssue:')));
  } finally { off(); }
});

test('deploy.plan stages the plan for the human to review, without uploading', async () => {
  const { d, calls } = setup();
  const got: DeployPlan[] = [];
  const off = subscribeStagedPlans(p => got.push(p));
  try {
    await d.runCommand('deploy.plan', { targetId: 's1' }, { origin: 'agent' });
    assert.equal(got.length, 1);
    assert.ok(!calls.some(c => c.startsWith('publish:') || c.startsWith('confirmIssue:')));
  } finally { off(); }
});

test('host key trust pins exactly the fingerprint the dialog showed; replace needs the acknowledgement', async () => {
  const { run, calls, off } = setup(presenter());
  try {
    const r = await run('deploy.hostkey.trust', { targetId: 's1' }) as { fingerprint: string };
    assert.equal(r.fingerprint, FP);
    assert.ok(calls.includes(`hostkeyTrust:${JSON.stringify(['s1', FP])}`));
  } finally { off(); }
  const noAck = setup(presenter({ confirmHostKeyReplace: async () => ({ gesture: click(), acknowledged: false }) }));
  try {
    assert.deepEqual(await noAck.run('deploy.hostkey.replace', { targetId: 's1', oldFingerprint: FP }), { status: 'cancelled' });
    assert.ok(!noAck.calls.some(c => c.startsWith('hostkeyReplace:')));
  } finally { noAck.off(); }
  const ack = setup(presenter());
  try {
    await ack.run('deploy.hostkey.replace', { targetId: 's1', oldFingerprint: FP });
    assert.ok(ack.calls.includes(`hostkeyReplace:${JSON.stringify([{ targetId: 's1', oldFingerprint: FP, newFingerprint: FP, acknowledged: true }])}`));
  } finally { ack.off(); }
});

test('key create returns only the public key; activity log carries no params', async () => {
  const { d, run } = setup();
  const out = await run('deploy.key.create', { targetId: 's1' }) as { publicKey: string };
  assert.match(out.publicKey, /^ssh-ed25519 /);
  assert.ok(!JSON.stringify(d.recentActivity()).includes('s1'));
});

test('target.save validates the shape before it reaches the backend', async () => {
  const { d, calls } = setup();
  assert.equal(await code(d.runCommand('deploy.target.save', { target: { ...target, privateKey: 'SECRET' } }, { origin: 'ui' })), 'invalid-params');
  assert.equal(await code(d.runCommand('deploy.target.save', { target: { ...target, port: 99999 } }, { origin: 'ui' })), 'invalid-params');
  assert.equal(await code(d.runCommand('deploy.target.save', { target }, { origin: 'ui' })), 'ok');
  assert.equal(calls.filter(c => c.startsWith('targetSave:')).length, 1);
});
