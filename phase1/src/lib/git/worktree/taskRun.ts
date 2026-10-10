import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {readJson, safeId, stateDir, writeAtomic, defaultEnv} from './fsutil';
import {assertLeaseHeld, clearRecoveryMarker, paths as leasePaths, releaseLease, readLease} from './lease';
import type {Lease} from './lease';
import {runGit} from './identity';
import type {Env, GateOutcome, RepoContext} from './types';

/**
 * Operation journal + cancellation + crash recovery for one worktree.
 * Rule: cancellation ends either in a verified-clean cleanup or in a marked-uncertain state that
 * blocks new leases until reconciled. Dirty files are never deleted.
 */
export type OpKind = 'local' | 'network';
export interface Journal {opId: string; op: string; kind: OpKind; taskId?: string; leaseId: string; headBefore: string; startedAt: number}
export type TaskOutcome =
  | {status: 'done'; value: unknown}
  | {status: 'cancelled-clean'}
  | {status: 'uncertain'; why: string}
  | {status: 'failed'; error: string}
  | {status: 'lease-lost'; reason: string};

const journalPath = (ctx: RepoContext) => join(stateDir(ctx, 'recovery'), `${safeId(ctx.worktreeId)}.journal.json`);
const NOID = {name: 'somnia', email: 'somnia@localhost', source: 'explicit' as const};
const git = (ctx: RepoContext, args: string[]) => runGit(ctx.root, args, NOID);

export async function worktreeState(ctx: RepoContext) {
  const head = (await git(ctx, ['rev-parse', 'HEAD']).catch(() => ({stdout: 'unborn'}))).stdout.trim();
  const status = (await git(ctx, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout;
  let indexLock = false;
  try {
    const gd = (await git(ctx, ['rev-parse', '--absolute-git-dir'])).stdout.trim();
    await fs.access(join(gd, 'index.lock')); indexLock = true;
  } catch { /* none */ }
  return {head, dirty: status.length > 0, indexLock};
}

async function markUncertain(ctx: RepoContext, j: Journal, why: string, env: Env) {
  const rec = {opId: j.opId, op: j.op, kind: j.kind, taskId: j.taskId, headBefore: j.headBefore, why, markedAt: env.now(), worktree: ctx.root};
  await writeAtomic(leasePaths.uncertainPath(ctx), JSON.stringify(rec));
}

export async function runLeasedOp<T>(
  ctx: RepoContext, lease: Lease,
  spec: {op: string; kind: OpKind; opId: string; env?: Env},
  fn: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<TaskOutcome> {
  const env = spec.env ?? defaultEnv;
  const held = await assertLeaseHeld(ctx, lease, env);
  if (!held.ok) return {status: 'lease-lost', reason: held.reason};
  const before = await worktreeState(ctx);
  const j: Journal = {opId: spec.opId, op: spec.op, kind: spec.kind, taskId: lease.taskId, leaseId: lease.leaseId, headBefore: before.head, startedAt: env.now()};
  await writeAtomic(journalPath(ctx), JSON.stringify(j));
  const finish = async (): Promise<TaskOutcome> => {
    // Verify post-state instead of trusting the exception path.
    const now = await worktreeState(ctx);
    const stillMine = await assertLeaseHeld(ctx, lease, env);
    if (!stillMine.ok) { await markUncertain(ctx, j, 'lease lost during operation', env); return {status: 'uncertain', why: 'lease lost during operation'}; }
    const unchanged = now.head === before.head && now.dirty === before.dirty && !now.indexLock;
    if (spec.kind === 'local' && unchanged) {
      await fs.rm(journalPath(ctx), {force: true}); await releaseLease(ctx, lease);
      return {status: 'cancelled-clean'};
    }
    const why = spec.kind === 'network' ? 'network operation canceled; remote outcome unknown until reconciled'
      : now.indexLock ? 'git index.lock present after cancel' : 'working state changed by canceled operation';
    await markUncertain(ctx, j, why, env);
    await releaseLease(ctx, lease); // worktree stays preserved; the marker blocks new leases
    return {status: 'uncertain', why};
  };
  try {
    const value = await Promise.race([
      fn(signal),
      new Promise<never>((_, rej) => { if (signal.aborted) rej(new Error('aborted')); signal.addEventListener('abort', () => rej(new Error('aborted')), {once: true}); }),
    ]);
    const stillMine = await assertLeaseHeld(ctx, lease, env);
    if (!stillMine.ok) { await markUncertain(ctx, j, 'lease lost before completion', env); return {status: 'lease-lost', reason: stillMine.reason}; }
    await fs.rm(journalPath(ctx), {force: true});
    return {status: 'done', value};
  } catch (e) {
    if (signal.aborted) return finish();
    // Non-cancel failure: same verification, but report as failed when state is untouched.
    const out = await finish();
    return out.status === 'cancelled-clean' ? {status: 'failed', error: String((e as Error).message ?? e)} : out;
  }
}

export type RecoveryOutcome =
  | {status: 'clean'}
  | {status: 'rolled-back-clean'; op: string}
  | {status: 'uncertain'; op: string; why: string}
  | {status: 'git-lock-present'; detail: string};

/** After a crash: inspect journal vs real git state. Never deletes dirty files or index.lock. */
export async function recoverWorktree(ctx: RepoContext, lease: Lease, env: Env = defaultEnv): Promise<GateOutcome<RecoveryOutcome>> {
  const held = await assertLeaseHeld(ctx, lease, env);
  if (!held.ok) return held;
  const j = await readJson<Journal>(journalPath(ctx));
  const st = await worktreeState(ctx);
  if (st.indexLock) return {ok: true, value: {status: 'git-lock-present', detail: 'index.lock exists; verify no git process runs, then remove it manually'}};
  if (!j) { await clearRecoveryMarker(ctx); return {ok: true, value: {status: 'clean'}}; }
  if (j.kind === 'local' && st.head === j.headBefore && !st.dirty) {
    await fs.rm(journalPath(ctx), {force: true}); await clearRecoveryMarker(ctx);
    return {ok: true, value: {status: 'rolled-back-clean', op: j.op}};
  }
  const why = j.kind === 'network' ? 'crashed during network operation' : 'crashed mid-operation with changed state';
  await markUncertain(ctx, j, why, env);
  await fs.rm(journalPath(ctx), {force: true}); await clearRecoveryMarker(ctx);
  await releaseLease(ctx, lease);
  return {ok: true, value: {status: 'uncertain', op: j.op, why}};
}

/** Explicit human/agent reconcile (e.g. after checking the remote ref). Required to lift an uncertain marker. */
export async function reconcileUncertain(ctx: RepoContext, resolution: 'adopt-current-state' | 'discard-marker', by: string, env: Env = defaultEnv) {
  const m = await readJson<Record<string, unknown>>(leasePaths.uncertainPath(ctx));
  if (!m) return false;
  const audit = join(stateDir(ctx, 'recovery'), `${safeId(ctx.worktreeId)}.reconciled.${env.now()}.json`);
  await writeAtomic(audit, JSON.stringify({...m, resolution, by, at: env.now()}));
  await fs.rm(leasePaths.uncertainPath(ctx), {force: true});
  return true;
}
export {readLease};
