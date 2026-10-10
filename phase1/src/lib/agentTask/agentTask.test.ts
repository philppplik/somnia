import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryTaskStore, FsTaskStore, assertPrivateLocation, TaskEngine, TaskError, evaluateGate, enforceHeadless, exitCodeForStatus, exitCodeForError,
  newRequestId, CostMeter, watchdogCheck, toCliJson, buildRedactedExport, confirmExport, assertExportReviewed, redactText, contentHashOf,
  validateTaskRecord, inAllowedRoots, isProjectRelative, TASK_STATUSES, TASK_TRANSITIONS, TASK_ERROR_CODES } from './index';
import type { WorkspaceSnapshot, GateRequest, TaskRecord, FsPort } from './index';

const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40);
const snap = (n = 'x', g = 1): WorkspaceSnapshot => ({ treeSha: n.repeat(40).slice(0, 40), contentHash: 'h-' + n, workspaceGeneration: g });
function mk(start = 1_000_000) {
  let t = start; const store = new MemoryTaskStore();
  const eng = new TaskEngine({ store, now: () => t, newId: (() => { let i = 0; return () => `task${++i}`; })() });
  return { store, eng, tick: (ms: number) => { t += ms; } };
}
const spec = (o = {}) => ({ repoId: 'repo1', baseSha: BASE, intent: 'fix the header', producer: { kind: 'builtin' as const, name: 'somnia-agent', model: 'm' }, ...o });
const req = (gate: GateRequest['gate'], o: Partial<GateRequest> = {}): GateRequest => ({ gate, actor: 'user', snapshot: snap(), unsavedBuffers: 0, ...o });
const throwsCode = (fn: () => unknown, code: string) => assert.throws(fn, (e: unknown) => e instanceof TaskError && e.code === code);
const rejectsCode = async (p: Promise<unknown>, code: string) => assert.rejects(p, (e: unknown) => e instanceof TaskError && e.code === code);

test('create: record matches C1, branch somnia/task/<id>, L0 default, private session', async () => {
  const { eng, store } = mk();
  const { task, session } = await eng.create(spec());
  assert.equal(task.schemaVersion, 1); assert.equal(task.branch, 'somnia/task/task1'); assert.equal(task.worktreeId, null);
  assert.equal(task.status, 'queued'); assert.equal(task.gates.level, 'L0'); assert.deepEqual(task.allowedRoots, ['.']);
  assert.equal(session.intent, 'fix the header');
  assert.ok(await store.getSession('task1'));
});
test('create: L1 only via explicit flag; invalid ids/sha/roots rejected', async () => {
  const { eng } = mk();
  assert.equal((await eng.create(spec({ autoLocal: true }))).task.gates.level, 'L1');
  await rejectsCode(mk().eng.create(spec({ baseSha: 'zz' })), 'invalid-record');
  await rejectsCode(mk().eng.create(spec({ repoId: '../x' })), 'invalid-record');
  await rejectsCode(mk().eng.create(spec({ allowedRoots: ['../etc'] })), 'invalid-record');
  await rejectsCode(mk().eng.create(spec({ allowedRoots: ['/abs'] })), 'invalid-record');
});
test('sequential: one active task per project; worktrees allow parallel; terminal frees slot', async () => {
  const { eng } = mk();
  await eng.create(spec());
  await rejectsCode(eng.create(spec()), 'dirty');
  await eng.create(spec({ worktreeId: 'wt1' }));
  await rejectsCode(eng.create(spec({ worktreeId: 'wt1' })), 'dirty');
  await eng.cancel('task1');
  await eng.create(spec());
});
test('status machine: legal path and illegal transitions', async () => {
  const { eng } = mk();
  await eng.create(spec());
  await rejectsCode(eng.transition('task1', 'done'), 'invalid-transition');
  for (const s of ['preparing', 'running', 'review', 'done'] as const) await eng.transition('task1', s);
  await rejectsCode(eng.transition('task1', 'running'), 'invalid-transition');
  for (const s of TASK_STATUSES) assert.ok(s in TASK_TRANSITIONS);
  assert.deepEqual(TASK_TRANSITIONS.done, []);
});
test('exit codes 0/1/2', () => {
  assert.equal(exitCodeForStatus('done'), 0);
  for (const s of ['failed', 'cancelled', 'queued', 'running'] as const) assert.equal(exitCodeForStatus(s), 1);
  assert.equal(exitCodeForStatus('waiting-input'), 2); assert.equal(exitCodeForStatus('review'), 2);
  assert.equal(exitCodeForError(new TaskError('review-required')), 2);
  assert.equal(exitCodeForError(new TaskError('budget-exceeded')), 1);
  assert.equal(exitCodeForError(new Error('x')), 1);
});
test('typed errors: all codes have fixed text, no raw detail in message; JSON shape', () => {
  for (const c of TASK_ERROR_CODES) { const e = new TaskError(c, 'req_1', 'ghp_secretsecretsecretsecret1'); assert.ok(e.message.length > 5); assert.ok(!JSON.stringify(e.toJSON()).includes('ghp_')); assert.equal(e.toJSON().requestId, 'req_1'); }
  assert.equal(new TaskError('watchdog-timeout').retryable, true);
});
test('request ids unique and opaque', () => { const s = new Set(Array.from({ length: 500 }, () => newRequestId())); assert.equal(s.size, 500); });

test('gates L0: everything manual; agent actor cannot self-advance', async () => {
  const { eng } = mk(); const { task } = await eng.create(spec());
  assert.deepEqual(evaluateGate(task, req('prepare')), { kind: 'proceed', mode: 'manual', markUnreviewed: false });
  assert.deepEqual(evaluateGate(task, req('commit')), { kind: 'needs-review', reason: 'review-required' });
  assert.deepEqual(evaluateGate(task, req('run', { actor: 'agent' })), { kind: 'needs-review', reason: 'review-required' });
});
test('gates L0: commit proceeds only with approved review bound to current tree+content', async () => {
  const { eng } = mk(); const { task } = await eng.create(spec());
  const s = snap('c'); task.review = { reviewedTreeSha: s.treeSha, contentHash: s.contentHash, decision: 'approved', at: 't' };
  assert.equal((evaluateGate(task, req('commit', { snapshot: s })) as any).markUnreviewed, false);
  throwsCode(() => evaluateGate(task, req('commit', { snapshot: snap('d') })), 'stale-plan');
  task.review.decision = 'rejected';
  assert.equal(evaluateGate(task, req('commit', { snapshot: s })).kind, 'needs-review');
});
test('gates L1: prepare/run/save/commit auto-local, commit is unreviewed; headless L0 -> review-required', async () => {
  const { eng } = mk(); const { task } = await eng.create(spec({ autoLocal: true }));
  for (const g of ['prepare', 'run', 'save'] as const) assert.deepEqual(evaluateGate(task, req(g, { actor: 'agent' })), { kind: 'proceed', mode: 'auto-local', markUnreviewed: false });
  assert.deepEqual(evaluateGate(task, req('commit', { actor: 'agent' })), { kind: 'proceed', mode: 'auto-local', markUnreviewed: true });
  const l0 = (await mk().eng.create(spec())).task;
  const r = req('commit', { actor: 'cli', headless: true });
  throwsCode(() => enforceHeadless(evaluateGate(l0, r), r), 'review-required');
});
test('--yes covers local commit only, as unreviewed checkpoint; never push', async () => {
  const { eng } = mk(); const { task } = await eng.create(spec());
  assert.deepEqual(evaluateGate(task, req('commit', { actor: 'cli', yes: true })), { kind: 'proceed', mode: 'manual', markUnreviewed: true });
  for (const g of ['review-publication', 'push', 'review-pr', 'create-pr'] as const) assert.equal(evaluateGate(task, req(g, { actor: 'cli', yes: true })).kind, 'needs-review');
});
test('L2 never automatic: L1 does not enable push; agent push needs grant AND explicit approval', async () => {
  const { eng } = mk(); const { task } = await eng.create(spec({ autoLocal: true }));
  assert.equal(evaluateGate(task, req('push', { actor: 'user' })).kind, 'needs-review');
  throwsCode(() => evaluateGate(task, req('push', { actor: 'agent', explicitApproval: true })), 'gate-denied'); // no grant
  task.gates.networkGrant = { granted: true, at: 't' };
  throwsCode(() => evaluateGate(task, req('push', { actor: 'agent' })), 'gate-denied'); // grant alone is not approval
  throwsCode(() => evaluateGate(task, req('push', { actor: 'agent', explicitApproval: true })), 'stale-plan'); // no review of content
});
test('push with explicit approval requires review of exactly the outgoing content', async () => {
  const { eng } = mk(); const { task } = await eng.create(spec()); const s = snap('e');
  throwsCode(() => evaluateGate(task, req('push', { explicitApproval: true, snapshot: s })), 'stale-plan');
  task.review = { reviewedTreeSha: s.treeSha, contentHash: s.contentHash, decision: 'approved', at: 't' };
  assert.equal(evaluateGate(task, req('push', { explicitApproval: true, snapshot: s })).kind, 'proceed');
  throwsCode(() => evaluateGate(task, req('push', { explicitApproval: true, snapshot: snap('f') })), 'stale-plan');
});
test('unsaved-buffer is a BLOCKER for agent/cli ops, not for the human', async () => {
  const { eng } = mk(); const { task } = await eng.create(spec({ autoLocal: true }));
  for (const g of ['prepare', 'run', 'save', 'commit'] as const) throwsCode(() => evaluateGate(task, req(g, { actor: 'agent', unsavedBuffers: 1 })), 'unsaved-buffer');
  throwsCode(() => evaluateGate(task, req('commit', { actor: 'cli', yes: true, unsavedBuffers: 2 })), 'unsaved-buffer');
  assert.equal(evaluateGate(task, req('prepare', { actor: 'user', unsavedBuffers: 1 })).kind, 'proceed');
});
test('workspace change invalidates verification and review (content-hash binding)', async () => {
  const { eng } = mk(); await eng.create(spec()); const s = snap('a', 1);
  await eng.recordVerification('task1', { commands: ['npm test'], outcome: 'pass', treeSha: s.treeSha, contentHash: s.contentHash });
  await eng.recordReview('task1', { reviewedTreeSha: s.treeSha, contentHash: s.contentHash, decision: 'approved' }, s);
  let t = await eng.noteWorkspaceChange('task1', s); assert.ok(t.verification && t.review);
  t = await eng.noteWorkspaceChange('task1', snap('z', 2)); assert.equal(t.verification, undefined); assert.equal(t.review, undefined); assert.equal(t.workspaceGeneration, 2);
  await rejectsCode(eng.recordReview('task1', { reviewedTreeSha: s.treeSha, contentHash: s.contentHash, decision: 'approved' }, snap('z', 2)), 'stale-plan');
});
test('commit recording: L1 => unreviewed-checkpoint; reviewed => reviewed; denied decision rejected', async () => {
  const { eng } = mk(); const { task } = await eng.create(spec({ autoLocal: true })); const s = snap('a');
  const d = evaluateGate(task, req('commit', { actor: 'agent', snapshot: s }));
  const t = await eng.recordCommit('task1', HEAD, s, d);
  assert.equal(t.checkpoints[0].reviewState, 'unreviewed-checkpoint'); assert.equal(t.headSha, HEAD);
  await rejectsCode(eng.recordCommit('task1', HEAD, s, { kind: 'needs-review', reason: 'review-required' }), 'gate-denied');
});
test('unreviewed checkpoint blocks push until a current approved review exists', async () => {
  const { eng } = mk(); const { task } = await eng.create(spec({ autoLocal: true })); const s = snap('a');
  await eng.recordCommit('task1', HEAD, s, evaluateGate(task, req('commit', { actor: 'agent', snapshot: s })));
  const t = await eng.get('task1');
  throwsCode(() => evaluateGate(t, req('push', { explicitApproval: true, snapshot: s })), 'stale-plan');
});

test('runOnce: idempotent by request id; replay after success; unresolved => uncertain-outcome', async () => {
  const { eng } = mk(); await eng.create(spec()); let n = 0;
  const a = await eng.runOnce('task1', 'req_a', 'push', async () => ++n); assert.equal(a.value, 1);
  const b = await eng.runOnce('task1', 'req_a', 'push', async () => ++n); assert.equal(b.replayed, true); assert.equal(n, 1);
  await assert.rejects(eng.runOnce('task1', 'req_b', 'push', async () => { throw new Error('socket hang up'); }));
  const t = await eng.get('task1'); assert.equal(t.outcome, 'uncertain'); assert.equal(t.preserve, true);
  await rejectsCode(eng.runOnce('task1', 'req_b', 'push', async () => 1), 'uncertain-outcome');
  await eng.reconcile('task1', 'req_b', 'not-applied');
  await rejectsCode(eng.runOnce('task1', 'req_b', 'push', async () => 1), 'duplicate-request');
});
test('runOnce: crash mid-flight (started entry) => uncertain-outcome on retry', async () => {
  const { eng, store } = mk(); const { task } = await eng.create(spec());
  task.requests.push({ id: 'req_c', op: 'push', state: 'started', at: 't' }); await store.putTask(task);
  await rejectsCode(eng.runOnce('task1', 'req_c', 'push', async () => 1), 'uncertain-outcome');
});
test('cancel: in-flight push becomes uncertain + preserved until reconciled; local-only cancel stays certain', async () => {
  const a = mk(); const { task } = await a.eng.create(spec());
  task.requests.push({ id: 'req_p', op: 'push', state: 'started', at: 't' }); await a.store.putTask(task);
  const c = await a.eng.cancel('task1'); assert.equal(c.status, 'cancelled'); assert.equal(c.outcome, 'uncertain'); assert.equal(c.preserve, true);
  const r = await a.eng.reconcile('task1', 'req_p', 'not-applied'); assert.equal(r.outcome, 'certain'); assert.equal(r.preserve, false);
  const b = mk(); await b.eng.create(spec()); const c2 = await b.eng.cancel('task1'); assert.equal(c2.outcome, 'certain');
  await rejectsCode(b.eng.cancel('task1'), 'invalid-transition');
});
test('scope: allowedRoots enforced', async () => {
  const { eng } = mk(); await eng.create(spec({ allowedRoots: ['src/ui', 'index.html'] }));
  await eng.assertInScope('task1', 'src/ui/a.css'); await eng.assertInScope('task1', 'index.html');
  await rejectsCode(eng.assertInScope('task1', 'src/uix/a.css'), 'scope-violation');
  await rejectsCode(eng.assertInScope('task1', '../secret'), 'scope-violation');
  assert.ok(inAllowedRoots(['.'], 'a/b')); assert.ok(!isProjectRelative('a/../b')); assert.ok(!isProjectRelative('C:\\x')); assert.ok(!isProjectRelative('a\\b'));
});
test('cost meter: totals, warn at 80%, exceeded fails the task, budgets by tokens or USD', async () => {
  const m = new CostMeter({ maxTokens: 1000 }); assert.equal(m.add({ inputTokens: 500, outputTokens: 100 }), 'ok'); assert.equal(m.add({ inputTokens: 250 }), 'warn'); assert.equal(m.add({ outputTokens: 200 }), 'exceeded');
  assert.throws(() => m.assertWithin(), /budget/i);
  assert.equal(new CostMeter({}).add({ inputTokens: 1e9 }), 'ok');
  const m2 = new CostMeter({ maxCost: 1 }); m2.add({ costUsd: NaN, inputTokens: -5 }); assert.equal(m2.totals.costUsd, 0); assert.equal(m2.totals.inputTokens, 0);
  const { eng, store } = mk(); await eng.create(spec({ budget: { maxCost: 0.5 } })); await eng.transition('task1', 'preparing'); await eng.transition('task1', 'running');
  assert.equal(await eng.addUsage('task1', { costUsd: 0.2, inputTokens: 10 }), 'ok');
  assert.equal(await eng.addUsage('task1', { costUsd: 0.4 }), 'exceeded');
  const t = await eng.get('task1'); assert.equal(t.status, 'failed'); assert.equal(t.error?.code, 'budget-exceeded'); assert.equal(t.cost.calls, 2);
  assert.equal((await store.getSession('task1'))!.cost.calls, 2);
});
test('watchdog: stall and wall-clock detection; heartbeat resets', async () => {
  assert.deepEqual(watchdogCheck({ stallMs: 100 }, 0, 0, 150), { idleMs: 150, stalled: true, overWall: false });
  assert.equal(watchdogCheck({ maxWallMs: 100 }, 0, 90, 100).overWall, true);
  assert.equal(watchdogCheck({}, 0, 0, 1e9).stalled, false);
  const { eng, tick } = mk(); await eng.create(spec({ budget: { stallMs: 60_000 } })); await eng.transition('task1', 'preparing'); await eng.transition('task1', 'running');
  tick(30_000); await eng.heartbeat('task1'); tick(45_000); assert.deepEqual(await eng.sweepWatchdog(), []);
  tick(20_000); assert.deepEqual(await eng.sweepWatchdog(), ['task1']);
  const t = await eng.get('task1'); assert.equal(t.status, 'failed'); assert.equal(t.error?.code, 'watchdog-timeout');
});
test('watchdog ignores waiting-input/review tasks', async () => {
  const { eng, tick } = mk(); await eng.create(spec({ budget: { stallMs: 10 } })); await eng.transition('task1', 'preparing'); await eng.transition('task1', 'waiting-input'); tick(1e6);
  assert.deepEqual(await eng.sweepWatchdog(), []);
});

test('private storage: refuses roots inside the repo; fs store lays out outside it, atomic port, validates', async () => {
  throwsCode(() => assertPrivateLocation('/work/proj/.somnia/sessions', '/work/proj'), 'private-storage');
  throwsCode(() => assertPrivateLocation('C:\\Work\\Proj\\x', 'c:/work/proj'), 'private-storage');
  assertPrivateLocation('/work/proj/.somnia/sessions', '/work/proj', true);
  assertPrivateLocation('/home/u/.local/share/somnia/agent-sessions', '/work/proj');
  assertPrivateLocation('/work/project2/x', '/work/proj');
  const files = new Map<string, string>();
  const fs: FsPort = { readText: async p => files.get(p) ?? null, writeTextAtomic: async (p, t) => { files.set(p, t); },
    listDirs: async p => { const pre = p.replace(/\/$/, '') + '/'; return [...new Set([...files.keys()].filter(k => k.startsWith(pre)).map(k => k.slice(pre.length).split('/')[0]))]; } };
  const root = '/data/agent-sessions'; const eng = new TaskEngine({ store: new FsTaskStore(fs, root), newId: () => 'tk1' });
  await eng.create(spec());
  assert.ok(files.has(`${root}/repo1/tk1/task.json`)); assert.ok(files.has(`${root}/repo1/tk1/session.json`));
  assert.equal((await eng.get('tk1')).branch, 'somnia/task/tk1');
  files.set(`${root}/repo1/tk1/task.json`, JSON.stringify({ schemaVersion: 2 }));
  await rejectsCode(eng.get('tk1'), 'invalid-record');
  assert.deepEqual(await new FsTaskStore(fs, root).listTasks('repo1'), []); // corrupt records skipped
  const bad = { ...(await mk().eng.create(spec())).task, taskId: 'x/../y' } as TaskRecord; assert.throws(() => validateTaskRecord(bad));
});

test('redacted export: no secrets/paths/transcript fields; unreviewed until confirmed; hash-bound', async () => {
  const { eng } = mk(); const { task, session } = await eng.create(spec());
  session.intent = 'use ghp_abcdefghijklmnopqrstuvwxyz0123 in /home/philipp/proj/x'; session.notes = ['Authorization: Bearer abcdefghijklmnop1234', 'cloned https://user:pw@github.com/a/b', 'C:\\Users\\Phil\\secret.txt'];
  session.toolCallLogRef = 'log:1'; session.userOverrides = [{ at: 't', what: 'my password is hunter2' }];
  const exp = await buildRedactedExport(task, session); const js = JSON.stringify(exp);
  for (const s of ['ghp_', 'Bearer abc', 'user:pw', '/home/philipp', 'C:\\\\Users', 'hunter2', 'log:1', 'toolCallLog', 'userOverrides']) assert.ok(!js.includes(s), s);
  assert.equal(exp.review.state, 'unreviewed'); await rejectsCode(assertExportReviewed(exp), 'review-required');
  const ok = await confirmExport(exp, exp.review.contentHash); await assertExportReviewed(ok);
  await rejectsCode(confirmExport(exp, 'f'.repeat(64)), 'stale-plan');
  await rejectsCode(assertExportReviewed({ ...ok, intent: 'tampered' }), 'review-required');
  assert.equal(redactText('plain text stays'), 'plain text stays');
});
test('content hash is order independent and content sensitive', async () => {
  const a = await contentHashOf([{ path: 'a', sha: '1' }, { path: 'b', sha: '2' }]);
  assert.equal(a, await contentHashOf([{ path: 'b', sha: '2' }, { path: 'a', sha: '1' }]));
  assert.notEqual(a, await contentHashOf([{ path: 'a', sha: '1' }, { path: 'b', sha: '3' }]));
});
test('CLI json: deterministic subset, no private fields', async () => {
  const { eng } = mk(); const { task, session } = await eng.create(spec()); session.diffSummary = { files: 2, additions: 3, deletions: 1, paths: ['a', 'b'] };
  const j = toCliJson(task, session, 'req_1'); assert.equal(j.exitCode, 1); assert.equal(j.requestId, 'req_1'); assert.deepEqual(j.diffSummary, { files: 2, additions: 3, deletions: 1 });
  assert.equal(JSON.stringify(toCliJson(task, session, 'req_1')), JSON.stringify(j));
  const s = JSON.stringify(j); for (const k of ['intent', 'allowedRoots', 'plan', 'notes', 'paths']) assert.ok(!s.includes(`"${k}"`), k);
});
