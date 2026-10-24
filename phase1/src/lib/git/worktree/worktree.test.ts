import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, existsSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  acquireWriteLease, assertLeaseHeld, heartbeat, releaseLease, claimWorkspaceOwner, releaseWorkspaceOwner,
  publishBuffers, guardAgentWrite, recordReview, hashDisk, resolveHumanIdentity, runGit, gitEnv,
  assertNoSharedConfigWrite, sharedConfigFingerprint, applyAttribution, runLeasedOp, recoverWorktree,
  reconcileUncertain, worktreeState, readLease, toWorkspaceGuard,
} from './index';
import type {Env, OwnerInfo, RepoContext} from './types';

const g = (cwd: string, ...a: string[]) => execFileSync('git', a, {cwd, encoding: 'utf8'}).trim();
function fixture() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'somnia-wt-')));
  const main = join(base, 'main');
  execFileSync('git', ['init', '-q', '-b', 'main', main]);
  writeFileSync(join(main, 'a.txt'), 'one\n');
  g(main, '-c', 'user.name=T', '-c', 'user.email=t@x', 'add', '.');
  g(main, '-c', 'user.name=T', '-c', 'user.email=t@x', 'commit', '-qm', 'init');
  const mk = (n: string): RepoContext => {
    const p = join(base, n);
    g(main, 'worktree', 'add', '-q', '-b', `somnia/task/${n}`, p);
    return {repoId: 'repo1', worktreeId: n, root: p, gitDir: g(p, 'rev-parse', '--absolute-git-dir'), commonDir: realpathSync(join(main, '.git'))};
  };
  return {base, main, w1: mk('w1'), w2: mk('w2')};
}
let clock = 1_000_000;
const env = (alive: (p: number) => boolean = () => true): Env => ({now: () => clock, host: 'h', isPidAlive: alive});
const own = (id: string, pid = 111, kind: OwnerInfo['kind'] = 'headless'): OwnerInfo => ({ownerId: id, kind, pid, host: 'h'});
const unwrap = <T,>(r: {ok: boolean; value?: T}) => { assert.ok(r.ok, JSON.stringify(r)); return r.value as T; };

test('two simulated agents lease two worktrees of one repo in parallel; same worktree conflicts', async () => {
  const f = fixture(); const e = env();
  const [a, b] = await Promise.all([
    acquireWriteLease(f.w1, {owner: own('agentA', 1), env: e}),
    acquireWriteLease(f.w2, {owner: own('agentB', 2), env: e}),
  ]);
  const la = unwrap(a), lb = unwrap(b);
  assert.notEqual(la.leaseId, lb.leaseId);
  const c = await acquireWriteLease(f.w1, {owner: own('agentB', 2), env: e});
  assert.equal(c.ok, false); assert.equal(!c.ok && c.outcome, 'lease-conflict');
  // concurrent racers: exactly one wins
  await releaseLease(f.w1, la);
  const racers = await Promise.all([1, 2, 3, 4, 5].map(i => acquireWriteLease(f.w1, {owner: own('r' + i, 10 + i), env: e})));
  assert.equal(racers.filter(r => r.ok).length, 1);
  assert.equal(await releaseLease(f.w2, la), false); // wrong lease never deletes
});

test('agents really commit in parallel with process-scoped identities and shared config stays untouched', async () => {
  const f = fixture(); const e = env();
  const before = await sharedConfigFingerprint(f.w1);
  const idA = {name: 'Agent A', email: 'a@somnia.local', source: 'explicit' as const};
  const idB = {name: 'Agent B', email: 'b@somnia.local', source: 'explicit' as const};
  const la = unwrap(await acquireWriteLease(f.w1, {owner: own('A', 1), env: e}));
  const lb = unwrap(await acquireWriteLease(f.w2, {owner: own('B', 2), env: e}));
  const work = async (ctx: RepoContext, id: typeof idA, lease: typeof la, msg: string) => {
    assert.ok((await assertLeaseHeld(ctx, lease, e)).ok);
    writeFileSync(join(ctx.root, `${ctx.worktreeId}.txt`), msg);
    await runGit(ctx.root, ['add', '-A'], id);
    await runGit(ctx.root, ['commit', '-q', '-F', '-'], id, applyAttribution(msg, {enabled: true, trailer: 'Assisted-by: Somnia Agent'}));
  };
  await Promise.all([work(f.w1, idA, la, 'from A'), work(f.w2, idB, lb, 'from B')]);
  assert.equal(g(f.w1.root, 'log', '-1', '--format=%an <%ae>'), 'Agent A <a@somnia.local>');
  assert.equal(g(f.w2.root, 'log', '-1', '--format=%an <%ae>'), 'Agent B <b@somnia.local>');
  assert.match(g(f.w1.root, 'log', '-1', '--format=%B'), /Assisted-by: Somnia Agent/);
  assert.equal(await sharedConfigFingerprint(f.w1), before, 'common config untouched');
  assert.throws(() => execFileSync('git', ['config', '--local', '--get', 'user.name'], {cwd: f.main, stdio: 'pipe'}));
});

test('identity guards: config writes, global, creds in argv are rejected; env has no inherited tokens; missing identity is typed', async () => {
  for (const bad of [['config', 'user.name', 'x'], ['config', '--global', 'user.email', 'x'], ['-c', 'user.name=x', 'commit'], ['push', 'https://u:p@github.com/a/b'], ['push', 'ghp_abc']]) {
    assert.throws(() => assertNoSharedConfigWrite(bad), Error, bad.join(' '));
  }
  assert.doesNotThrow(() => assertNoSharedConfigWrite(['config', '--get', 'user.name']));
  const env2 = gitEnv({name: 'n', email: 'e', source: 'explicit'}, {PATH: '/bin', GITHUB_TOKEN: 'x', GH_TOKEN: 'y', HOME: '/h'});
  assert.equal(env2.GITHUB_TOKEN, undefined); assert.equal(env2.GH_TOKEN, undefined); assert.equal(env2.GIT_AUTHOR_NAME, 'n');
  const f = fixture();
  const prev = {h: process.env.HOME, x: process.env.XDG_CONFIG_HOME, n: process.env.GIT_CONFIG_NOSYSTEM, g: process.env.GIT_CONFIG_GLOBAL};
  process.env.GIT_CONFIG_GLOBAL = '/dev/null'; process.env.GIT_CONFIG_NOSYSTEM = '1';
  const r = await resolveHumanIdentity(f.w1);
  Object.assign(process.env, {}); if (prev.g === undefined) delete process.env.GIT_CONFIG_GLOBAL; if (prev.n === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
  assert.equal(r.ok, false); assert.equal(!r.ok && r.outcome, 'identity');
});

test('one owner per workspace: desktop vs headless conflict, dead owner takeover, release by owner only', async () => {
  const f = fixture(); const e = env();
  unwrap(await claimWorkspaceOwner(f.w1, own('desk', 5, 'desktop'), e));
  const c = await claimWorkspaceOwner(f.w1, own('cli', 6, 'headless'), e);
  assert.equal(!c.ok && c.outcome, 'owner-conflict');
  assert.equal(await releaseWorkspaceOwner(f.w1, own('cli', 6)), false);
  // other worktree unaffected
  unwrap(await claimWorkspaceOwner(f.w2, own('cli', 6, 'headless'), e));
  const dead = env(p => p !== 5);
  unwrap(await claimWorkspaceOwner(f.w1, own('cli', 6, 'headless'), dead));
});

test('unsaved buffer sync: dirty buffer blocks with review-required; review binds to content hashes; stale/missing snapshot blocks when desktop owns', async () => {
  const f = fixture(); const e = env();
  // desktop owns, nothing published yet: unknown state blocks
  let r = await guardAgentWrite(f.w1, ['a.txt'], {desktopOwnsWorkspace: true, env: e});
  assert.equal(!r.ok && r.outcome, 'review-required');
  await publishBuffers(f.w1, 'desk', [{path: 'a.txt', bufferHash: 'B1', dirty: true}, {path: 'c.txt', bufferHash: 'C1', dirty: false}], e);
  r = await guardAgentWrite(f.w1, ['a.txt', 'c.txt'], {desktopOwnsWorkspace: true, env: e});
  assert.ok(!r.ok); assert.deepEqual((r.detail as any).blocking.map((b: any) => [b.path, b.reason]), [['a.txt', 'unsaved-buffer']]);
  assert.ok((await guardAgentWrite(f.w1, ['c.txt'], {desktopOwnsWorkspace: true, env: e})).ok);
  // other worktree not affected by w1's buffers
  assert.ok((await guardAgentWrite(f.w2, ['a.txt'], {desktopOwnsWorkspace: false, env: e})).ok);
  // review approval bound to buffer+disk hashes
  const disk = await hashDisk(f.w1, 'a.txt');
  await recordReview(f.w1, {path: 'a.txt', bufferHash: 'B1', diskHash: disk});
  assert.ok((await guardAgentWrite(f.w1, ['a.txt'], {desktopOwnsWorkspace: true, env: e})).ok);
  await publishBuffers(f.w1, 'desk', [{path: 'a.txt', bufferHash: 'B2', dirty: true}], e); // user typed more
  r = await guardAgentWrite(f.w1, ['a.txt'], {desktopOwnsWorkspace: true, env: e});
  assert.equal(!r.ok && (r.detail as any).blocking[0].reason, 'review-stale');
  await recordReview(f.w1, {path: 'a.txt', bufferHash: 'B2', diskHash: disk});
  writeFileSync(join(f.w1.root, 'a.txt'), 'changed on disk\n'); // disk moved
  r = await guardAgentWrite(f.w1, ['a.txt'], {desktopOwnsWorkspace: true, env: e});
  assert.equal(!r.ok && (r.detail as any).blocking[0].reason, 'review-stale');
  // AI hold blocks too; stale snapshot blocks
  await publishBuffers(f.w1, 'desk', [{path: 'd.txt', bufferHash: 'B3', dirty: false, aiHold: true}], e);
  r = await guardAgentWrite(f.w1, ['d.txt'], {desktopOwnsWorkspace: true, env: e});
  assert.equal(!r.ok && (r.detail as any).blocking[0].reason, 'ai-hold');
  clock += 60_000;
  r = await guardAgentWrite(f.w1, ['d.txt'], {desktopOwnsWorkspace: true, env: env()});
  assert.equal(!r.ok && (r.detail as any).blocking[0].reason, 'snapshot-stale');
});

test('crash recovery: dead holder is taken over, old holder is fenced, recovery inspects journal', async () => {
  const f = fixture();
  let alive = true; const e = env(() => alive);
  const old = unwrap(await acquireWriteLease(f.w1, {owner: own('A', 77), env: e}));
  // A starts a local op, dirties the tree and "crashes" (never finishes)
  const ac = new AbortController();
  void runLeasedOp(f.w1, old, {op: 'edit', kind: 'local', opId: 'op1', env: e}, () => new Promise(() => {}), ac.signal);
  await new Promise(r => setTimeout(r, 300));
  writeFileSync(join(f.w1.root, 'half.txt'), 'partial');
  alive = false;
  const nw = unwrap(await acquireWriteLease(f.w1, {owner: own('B', 78), env: e}));
  assert.equal(nw.generation, old.generation + 1); assert.equal(nw.recoveredFrom?.owner.ownerId, 'A');
  const fenced = await assertLeaseHeld(f.w1, old, e);
  assert.equal(!fenced.ok && fenced.outcome, 'lease-lost');
  assert.equal(await releaseLease(f.w1, old), false);
  const rec = unwrap(await recoverWorktree(f.w1, nw, e));
  assert.equal(rec.status, 'uncertain');
  assert.ok(existsSync(join(f.w1.root, 'half.txt')), 'dirty file never deleted');
  const again = await acquireWriteLease(f.w1, {owner: own('C', 79), env: env()});
  assert.equal(!again.ok && again.outcome, 'uncertain-pending');
  assert.ok(await reconcileUncertain(f.w1, 'adopt-current-state', 'user', e));
  // only now can a new lease be taken
  unwrap(await acquireWriteLease(f.w1, {owner: own('C', 79), env: e}));
});

test('crash recovery: untouched state rolls back clean', async () => {
  const f = fixture(); let alive = true; const e = env(() => alive);
  const old = unwrap(await acquireWriteLease(f.w1, {owner: own('A', 77), env: e}));
  void runLeasedOp(f.w1, old, {op: 'plan', kind: 'local', opId: 'op2', env: e}, () => new Promise(() => {}), new AbortController().signal);
  await new Promise(r => setTimeout(r, 300));
  alive = false;
  const nw = unwrap(await acquireWriteLease(f.w1, {owner: own('B', 78), env: e}));
  assert.deepEqual(unwrap(await recoverWorktree(f.w1, nw, e)), {status: 'rolled-back-clean', op: 'plan'});
  unwrap(await acquireWriteLease(f.w2, {owner: own('B', 78), env: e}));
});

test('cancellation: untouched local op = cleanup; changed state or network op = uncertain and worktree preserved', async () => {
  const f = fixture(); const e = env();
  let l = unwrap(await acquireWriteLease(f.w1, {owner: own('A', 1), env: e}));
  let ac = new AbortController();
  let p = runLeasedOp(f.w1, l, {op: 'think', kind: 'local', opId: 'o1', env: e}, () => new Promise(() => {}), ac.signal);
  setTimeout(() => ac.abort(), 200);
  assert.deepEqual(await p, {status: 'cancelled-clean'});
  assert.equal(await readLease(f.w1), null);
  // local op that wrote before cancel
  l = unwrap(await acquireWriteLease(f.w1, {owner: own('A', 1), env: e})); ac = new AbortController();
  p = runLeasedOp(f.w1, l, {op: 'edit', kind: 'local', opId: 'o2', env: e}, async () => { writeFileSync(join(f.w1.root, 'x.txt'), 'x'); return new Promise(() => {}); }, ac.signal);
  setTimeout(() => ac.abort(), 300);
  const o = await p; assert.equal(o.status, 'uncertain');
  assert.ok(existsSync(join(f.w1.root, 'x.txt')));
  // network op canceled with clean tree is still uncertain
  l = unwrap(await acquireWriteLease(f.w2, {owner: own('B', 2), env: e})); ac = new AbortController();
  p = runLeasedOp(f.w2, l, {op: 'push', kind: 'network', opId: 'o3', env: e}, () => new Promise(() => {}), ac.signal);
  setTimeout(() => ac.abort(), 200);
  const n = await p; assert.equal(n.status, 'uncertain'); assert.match((n as any).why, /remote outcome unknown/);
  const blocked = await acquireWriteLease(f.w2, {owner: own('B', 2), env: e});
  assert.equal(!blocked.ok && blocked.outcome, 'uncertain-pending');
  // success and plain-failure paths on a released worktree
  const w3 = {...f.w1, worktreeId: 'w3'};
  l = unwrap(await acquireWriteLease(w3, {owner: own('A', 1), env: e}));
  assert.equal((await runLeasedOp(w3, l, {op: 'ok', kind: 'local', opId: 'o4', env: e}, async () => 42, new AbortController().signal) as any).value, 42);
  const fl = await runLeasedOp(w3, l, {op: 'boom', kind: 'local', opId: 'o5', env: e}, async () => { throw new Error('boom'); }, new AbortController().signal);
  assert.deepEqual(fl, {status: 'failed', error: 'boom'});
});

test('lease expiry without heartbeat loses fencing; heartbeat keeps it', async () => {
  const f = fixture(); clock = 5_000_000; const e = env();
  let l = unwrap(await acquireWriteLease(f.w1, {owner: own('A', 1), ttlMs: 1000, env: e}));
  clock += 800; l = unwrap(await heartbeat(f.w1, l, e));
  clock += 800; assert.ok((await assertLeaseHeld(f.w1, l, e)).ok);
  clock += 1500; assert.equal((await assertLeaseHeld(f.w1, l, e)).ok, false);
  const st = await worktreeState(f.w1); assert.equal(st.dirty, false);
  assert.equal(readFileSync(join(f.w1.root, 'a.txt'), 'utf8'), 'one\n');
});

test('toWorkspaceGuard maps buffer snapshot to the Rust WorkspaceGuard shape', async () => {
  const f = fixture(); const e = env();
  assert.deepEqual(await toWorkspaceGuard(f.w1, {desktopOwnsWorkspace: true, env: e}), {known: false, unsavedBuffers: false, pendingAiReview: false});
  assert.deepEqual(await toWorkspaceGuard(f.w1, {desktopOwnsWorkspace: false, env: e}), {known: true, unsavedBuffers: false, pendingAiReview: false});
  await publishBuffers(f.w1, 'd', [{path: 'a', bufferHash: 'x', dirty: true}, {path: 'b', bufferHash: 'y', dirty: false, aiHold: true}], e);
  assert.deepEqual(await toWorkspaceGuard(f.w1, {desktopOwnsWorkspace: true, env: e}), {known: true, unsavedBuffers: true, pendingAiReview: true});
});
