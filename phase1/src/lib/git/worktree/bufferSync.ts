import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {defaultEnv, readJson, safeId, sha256, stateDir, writeAtomic} from './fsutil';
import type {Env, GateOutcome, RepoContext} from './types';

/**
 * Desktop publishes its unsaved-buffer / AI-hold state per worktree into the shared state dir.
 * Headless agent ops read it. Unsaved buffers on a path the agent wants to write are a BLOCKER:
 * the gate returns typed review-required, there is no bypass flag.
 * Unknown state (desktop owns the workspace but its snapshot is missing/stale) also blocks.
 */
export interface BufferEntry {path: string; bufferHash: string; dirty: boolean; aiHold?: boolean}
export interface BufferSnapshot {worktreeId: string; seq: number; publishedAt: number; ownerId: string; buffers: BufferEntry[]}
const snapPath = (ctx: RepoContext) => join(stateDir(ctx, 'buffers'), `${safeId(ctx.worktreeId)}.json`);
const reviewPath = (ctx: RepoContext) => join(stateDir(ctx, 'buffers'), `${safeId(ctx.worktreeId)}.reviews.json`);
export const SNAPSHOT_MAX_AGE_MS = 15_000;

export async function publishBuffers(ctx: RepoContext, ownerId: string, buffers: BufferEntry[], env: Env = defaultEnv): Promise<BufferSnapshot> {
  const prev = await readJson<BufferSnapshot>(snapPath(ctx));
  const snap: BufferSnapshot = {worktreeId: ctx.worktreeId, seq: (prev?.seq ?? 0) + 1, publishedAt: env.now(), ownerId, buffers};
  await writeAtomic(snapPath(ctx), JSON.stringify(snap));
  return snap;
}
export const readBuffers = (ctx: RepoContext) => readJson<BufferSnapshot>(snapPath(ctx));

/** A reviewer (human in desktop, or a CLI review step) approved writing over this exact buffer+disk pair. */
export interface ReviewApproval {path: string; bufferHash: string; diskHash: string}
export async function recordReview(ctx: RepoContext, a: ReviewApproval) {
  const all = (await readJson<ReviewApproval[]>(reviewPath(ctx))) ?? [];
  await writeAtomic(reviewPath(ctx), JSON.stringify([...all.filter(x => x.path !== a.path), a]));
}

export async function hashDisk(ctx: RepoContext, path: string): Promise<string> {
  try { return sha256(await fs.readFile(join(ctx.root, path))); } catch { return 'absent'; }
}

export interface GuardOpts {desktopOwnsWorkspace: boolean; env?: Env}
export interface Blocking {path: string; reason: 'unsaved-buffer' | 'ai-hold' | 'snapshot-missing' | 'snapshot-stale' | 'review-stale'; bufferHash?: string; diskHash?: string}

/**
 * Gate for agent writes to `paths`. ok => no unsaved state in the way.
 * Else review-required with the blocking paths and hashes the reviewer must bind to.
 */
export async function guardAgentWrite(ctx: RepoContext, paths: string[], opts: GuardOpts): Promise<GateOutcome<{checkedSeq: number | null}>> {
  const env = opts.env ?? defaultEnv;
  const snap = await readBuffers(ctx);
  const blocking: Blocking[] = [];
  if (opts.desktopOwnsWorkspace) {
    if (!snap) paths.forEach(path => blocking.push({path, reason: 'snapshot-missing'}));
    else if (env.now() - snap.publishedAt > SNAPSHOT_MAX_AGE_MS) paths.forEach(path => blocking.push({path, reason: 'snapshot-stale'}));
  }
  if (snap && !blocking.length) {
    const reviews = (await readJson<ReviewApproval[]>(reviewPath(ctx))) ?? [];
    for (const p of paths) {
      const b = snap.buffers.find(x => x.path === p);
      if (!b || (!b.dirty && !b.aiHold)) continue;
      const diskHash = await hashDisk(ctx, p);
      const r = reviews.find(x => x.path === p);
      if (r) {
        if (r.bufferHash === b.bufferHash && r.diskHash === diskHash) continue; // approval still bound to the same content
        blocking.push({path: p, reason: 'review-stale', bufferHash: b.bufferHash, diskHash});
        continue;
      }
      blocking.push({path: p, reason: b.aiHold ? 'ai-hold' : 'unsaved-buffer', bufferHash: b.bufferHash, diskHash});
    }
  }
  if (blocking.length) return {ok: false, outcome: 'review-required', reason: `${blocking.length} path(s) have unsaved editor state`, detail: {blocking}};
  return {ok: true, value: {checkedSeq: snap?.seq ?? null}};
}

/** Shape S7's Rust git::worktrees plan/add/remove accept. unknown/dirty blocks on the Rust side. */
export interface WorkspaceGuard {known: boolean; unsavedBuffers: boolean; pendingAiReview: boolean}
export async function toWorkspaceGuard(ctx: RepoContext, opts: {desktopOwnsWorkspace: boolean; env?: Env}): Promise<WorkspaceGuard> {
  const env = opts.env ?? defaultEnv;
  const snap = await readBuffers(ctx);
  if (!snap) return {known: !opts.desktopOwnsWorkspace, unsavedBuffers: false, pendingAiReview: false};
  const fresh = env.now() - snap.publishedAt <= SNAPSHOT_MAX_AGE_MS;
  return {known: fresh || !opts.desktopOwnsWorkspace, unsavedBuffers: snap.buffers.some(b => b.dirty), pendingAiReview: snap.buffers.some(b => b.aiHold)};
}
