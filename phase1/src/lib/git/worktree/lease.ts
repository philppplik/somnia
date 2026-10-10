import {promises as fs} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {createExclusive, defaultEnv, readJson, safeId, stateDir} from './fsutil';
import type {Env, GateOutcome, OwnerInfo, RepoContext} from './types';

/**
 * Write lease per worktree (key = commonDir + worktreeId) and one owner per workspace
 * (key = commonDir + worktreeId, kind desktop|headless). No tokens, no git config involved.
 *
 * A lease is a file created with O_EXCL. A takeover of a dead/expired lease first renames
 * the old file to a unique tombstone (atomic, only one winner), writes a recovery marker
 * and then creates the new lease with a higher generation (fencing).
 */
export interface Lease {
  leaseId: string;
  generation: number;
  worktreeId: string;
  repoId: string;
  owner: OwnerInfo;
  taskId?: string;
  acquiredAt: number;
  heartbeatAt: number;
  ttlMs: number;
  /** Set when a previous holder died; the new holder must run recovery before writing. */
  recoveredFrom?: {leaseId: string; owner: OwnerInfo; generation: number};
}
export interface AcquireOpts {
  owner: OwnerInfo;
  taskId?: string;
  ttlMs?: number;
  env?: Env;
}
const DEFAULT_TTL = 30_000;
const leasePath = (ctx: RepoContext) => join(stateDir(ctx, 'leases'), `${safeId(ctx.worktreeId)}.lease.json`);
const genPath = (ctx: RepoContext) => join(stateDir(ctx, 'leases'), `${safeId(ctx.worktreeId)}.gen`);
const recoveryPath = (ctx: RepoContext) => join(stateDir(ctx, 'recovery'), `${safeId(ctx.worktreeId)}.needs-recovery.json`);
const uncertainPath = (ctx: RepoContext) => join(stateDir(ctx, 'recovery'), `${safeId(ctx.worktreeId)}.uncertain.json`);

export const paths = {leasePath, recoveryPath, uncertainPath};

export function isStale(l: Lease, env: Env): boolean {
  if (l.owner.host === env.host && !env.isPidAlive(l.owner.pid)) return true;
  return env.now() - l.heartbeatAt > l.ttlMs;
}

async function nextGeneration(ctx: RepoContext): Promise<number> {
  const cur = (await readJson<{g: number}>(genPath(ctx)))?.g ?? 0;
  const g = cur + 1;
  await fs.mkdir(stateDir(ctx, 'leases'), {recursive: true});
  await fs.writeFile(genPath(ctx), JSON.stringify({g}), {mode: 0o600});
  return g;
}

export async function acquireWriteLease(ctx: RepoContext, opts: AcquireOpts): Promise<GateOutcome<Lease>> {
  const env = opts.env ?? defaultEnv;
  const unc = await readJson<Record<string, unknown>>(uncertainPath(ctx));
  if (unc) return {ok: false, outcome: 'uncertain-pending', reason: 'a canceled/crashed operation left this worktree in an uncertain state; reconcile first', detail: unc};
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = leasePath(ctx);
    // Reserve generation under the O_EXCL protection: write candidate with provisional generation, fix up after win.
    const candidate: Lease = {
      leaseId: randomUUID(), generation: 0, worktreeId: ctx.worktreeId, repoId: ctx.repoId,
      owner: opts.owner, taskId: opts.taskId, acquiredAt: env.now(), heartbeatAt: env.now(), ttlMs: opts.ttlMs ?? DEFAULT_TTL,
    };
    const cur = await readJson<Lease>(p);
    if (!cur) {
      // Either no lease or an unreadable/torn file; the exclusive create decides.
      candidate.generation = (await readJson<{g: number}>(genPath(ctx)))?.g ?? 0;
      candidate.generation += 1;
      if (await createExclusive(p, JSON.stringify(candidate))) {
        await fs.writeFile(genPath(ctx), JSON.stringify({g: candidate.generation}), {mode: 0o600});
        return {ok: true, value: candidate};
      }
      continue;
    }
    if (!isStale(cur, env)) {
      return {ok: false, outcome: 'lease-conflict', reason: `worktree is leased by ${cur.owner.kind} owner ${cur.owner.ownerId}`, detail: {holder: cur.owner, taskId: cur.taskId, generation: cur.generation}};
    }
    // Stale: single winner moves it aside.
    const tomb = `${p}.stale.${cur.generation}.${randomUUID()}`;
    try { await fs.rename(p, tomb); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue; throw e; }
    const marker = {leaseId: cur.leaseId, owner: cur.owner, generation: cur.generation, taskId: cur.taskId, detectedAt: env.now()};
    await fs.mkdir(stateDir(ctx, 'recovery'), {recursive: true});
    await fs.writeFile(recoveryPath(ctx), JSON.stringify(marker), {mode: 0o600});
    await fs.rm(tomb, {force: true});
    candidate.generation = cur.generation + 1;
    candidate.recoveredFrom = {leaseId: cur.leaseId, owner: cur.owner, generation: cur.generation};
    if (await createExclusive(p, JSON.stringify(candidate))) {
      await fs.writeFile(genPath(ctx), JSON.stringify({g: candidate.generation}), {mode: 0o600});
      return {ok: true, value: candidate};
    }
  }
  return {ok: false, outcome: 'lease-conflict', reason: 'lost the lease race'};
}

/** Fencing check: call before every write op. Fails if the lease was taken over or replaced. */
export async function assertLeaseHeld(ctx: RepoContext, lease: Lease, env: Env = defaultEnv): Promise<GateOutcome> {
  const cur = await readJson<Lease>(leasePath(ctx));
  if (!cur || cur.leaseId !== lease.leaseId || cur.generation !== lease.generation) {
    return {ok: false, outcome: 'lease-lost', reason: 'lease no longer held (taken over after expiry or released)'};
  }
  if (env.now() - cur.heartbeatAt > cur.ttlMs) return {ok: false, outcome: 'lease-lost', reason: 'lease expired; heartbeat missed'};
  const rec = await readJson<unknown>(recoveryPath(ctx));
  if (rec && !lease.recoveredFrom) return {ok: false, outcome: 'needs-recovery', reason: 'previous holder crashed; run recovery'};
  return {ok: true, value: undefined};
}

export async function heartbeat(ctx: RepoContext, lease: Lease, env: Env = defaultEnv): Promise<GateOutcome<Lease>> {
  const held = await assertLeaseHeld(ctx, lease, env);
  if (!held.ok) return held;
  const next = {...lease, heartbeatAt: env.now()};
  await fs.writeFile(leasePath(ctx), JSON.stringify(next), {mode: 0o600});
  return {ok: true, value: next};
}

export async function releaseLease(ctx: RepoContext, lease: Lease): Promise<boolean> {
  const cur = await readJson<Lease>(leasePath(ctx));
  if (!cur || cur.leaseId !== lease.leaseId) return false; // never delete someone else's lease
  await fs.rm(leasePath(ctx), {force: true});
  return true;
}

export async function readLease(ctx: RepoContext): Promise<Lease | null> { return readJson<Lease>(leasePath(ctx)); }
export async function clearRecoveryMarker(ctx: RepoContext) { await fs.rm(recoveryPath(ctx), {force: true}); }

/**
 * One owner per workspace: a desktop window or a headless run, never both writing.
 * Same mechanics as the lease but keyed per workspace and without a task; the second
 * claimant gets a typed owner-conflict naming the kind so the CLI can say "open in desktop" or attach read-only.
 */
const ownerPath = (ctx: RepoContext) => join(stateDir(ctx, 'owners'), `${safeId(ctx.worktreeId)}.owner.json`);
export interface OwnerRecord {owner: OwnerInfo; claimedAt: number; heartbeatAt: number; ttlMs: number}
export async function claimWorkspaceOwner(ctx: RepoContext, owner: OwnerInfo, env: Env = defaultEnv, ttlMs = DEFAULT_TTL): Promise<GateOutcome<OwnerRecord>> {
  const rec: OwnerRecord = {owner, claimedAt: env.now(), heartbeatAt: env.now(), ttlMs};
  for (let i = 0; i < 3; i++) {
    if (await createExclusive(ownerPath(ctx), JSON.stringify(rec))) return {ok: true, value: rec};
    const cur = await readJson<OwnerRecord>(ownerPath(ctx));
    if (cur && cur.owner.ownerId === owner.ownerId) return {ok: true, value: cur};
    const dead = !cur || (cur.owner.host === env.host && !env.isPidAlive(cur.owner.pid)) || env.now() - cur.heartbeatAt > cur.ttlMs;
    if (!dead) return {ok: false, outcome: 'owner-conflict', reason: `workspace is owned by ${cur!.owner.kind} (${cur!.owner.ownerId})`, detail: {owner: cur!.owner}};
    const tomb = `${ownerPath(ctx)}.stale.${randomUUID()}`;
    try { await fs.rename(ownerPath(ctx), tomb); await fs.rm(tomb, {force: true}); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
  return {ok: false, outcome: 'owner-conflict', reason: 'lost the owner race'};
}
export async function releaseWorkspaceOwner(ctx: RepoContext, owner: OwnerInfo): Promise<boolean> {
  const cur = await readJson<OwnerRecord>(ownerPath(ctx));
  if (!cur || cur.owner.ownerId !== owner.ownerId) return false;
  await fs.rm(ownerPath(ctx), {force: true});
  return true;
}
export async function readWorkspaceOwner(ctx: RepoContext) { return readJson<OwnerRecord>(ownerPath(ctx)); }
