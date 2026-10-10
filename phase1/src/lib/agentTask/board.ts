import { TaskEngine } from './engine';
import type { CreateTaskSpec } from './engine';
import { TaskError } from './errors';
import { assertExportReviewed, buildRedactedExport, confirmExport } from './redact';
import type { SessionExport } from './redact';
import type { Gate, TaskRecord } from './schema';
import type { GateDecision, GateRequest, WorkspaceSnapshot } from './gates';
import type { TaskStore } from './store';

/**
 * Engine-side facade for a Board UI. Deliberately structural: it imports nothing from UI/sibling code, so the Board
 * adapter wires it to its own port types. Snapshots are frozen and only replaced when content changes.
 */
export interface BoardTaskView extends TaskRecord { schemaVersion: 1; title: string; autoCommit: boolean; checkpoint: TaskRecord['checkpoints'][number] | null }
export interface BoardContent { contentHash: string; treeSha: string; headSha: string | null; workspaceGeneration: number }
export interface BoardSnapshot { readonly tasks: readonly BoardTaskView[]; readonly contents: Readonly<Record<string, BoardContent>>; readonly version: number }

export interface BoardDeps {
  engine: TaskEngine; store: TaskStore;
  /** Live workspace state per task (git core / worktree owner). null = unavailable, which blocks mutations. */
  liveContent(taskId: string): Promise<(WorkspaceSnapshot & { headSha: string | null }) | null>;
  unsavedBuffers(taskId: string): number;
  /** Persists a CONFIRMED redacted export (repo-local `.somnia/sessions/` or user-chosen path). Receives only the export. */
  writeExport(exp: SessionExport): Promise<void>;
}

export class BoardFacade {
  private snap: BoardSnapshot = Object.freeze({ tasks: [], contents: {}, version: 0 });
  private subs = new Set<() => void>();
  private last = '';
  constructor(private readonly d: BoardDeps) { }

  getSnapshot = (): BoardSnapshot => this.snap;
  subscribe = (fn: () => void): (() => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };

  async refresh(): Promise<BoardSnapshot> {
    const tasks = await this.d.store.listTasks();
    const views: BoardTaskView[] = []; const contents: Record<string, BoardContent> = {};
    for (const t of tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.taskId.localeCompare(b.taskId))) {
      const s = await this.d.store.getSession(t.taskId);
      views.push({ ...t, schemaVersion: 1, title: (s?.intent ?? '').split('\n')[0].slice(0, 120), autoCommit: t.gates.level === 'L1', checkpoint: t.checkpoints.at(-1) ?? null });
      const c = await this.d.liveContent(t.taskId);
      if (c) contents[t.taskId] = { contentHash: c.contentHash, treeSha: c.treeSha, headSha: c.headSha, workspaceGeneration: c.workspaceGeneration };
    }
    const key = JSON.stringify([views, contents]);
    if (key !== this.last) {
      this.last = key;
      this.snap = Object.freeze({ tasks: Object.freeze(views), contents: Object.freeze(contents), version: this.snap.version + 1 });
      for (const fn of [...this.subs]) fn();
    }
    return this.snap;
  }

  /** Gate guard for UI affordances. Mutations re-check inside the engine. */
  async guard(taskId: string, gate: Gate, actor: GateRequest['actor'] = 'user', explicitApproval = false): Promise<{ ok: true; decision: GateDecision } | { ok: false; code: string }> {
    const live = await this.d.liveContent(taskId);
    if (!live) return { ok: false, code: 'stale-plan' };
    try { return { ok: true, decision: await this.d.engine.evaluate(taskId, { gate, actor, snapshot: live, unsavedBuffers: this.d.unsavedBuffers(taskId), explicitApproval }) }; }
    catch (e) { return { ok: false, code: e instanceof TaskError ? e.code : 'gate-denied' }; }
  }

  async cancel(taskId: string): Promise<void> { await this.d.engine.cancel(taskId); await this.refresh(); }

  /** Retry = a NEW task from the failed/cancelled one (terminal records are immutable). Blocked while a remote outcome is uncertain. */
  async retry(taskId: string, baseSha: string, newTaskId?: string): Promise<TaskRecord> {
    const t = await this.d.engine.get(taskId);
    if (t.outcome === 'uncertain') throw new TaskError('uncertain-outcome');
    if (t.status !== 'failed' && t.status !== 'cancelled') throw new TaskError('invalid-transition');
    const s = await this.d.store.getSession(taskId);
    const spec: CreateTaskSpec = { repoId: t.repoId, baseSha, intent: s?.intent ?? '', allowedRoots: t.allowedRoots, producer: t.producer, budget: t.budget, autoLocal: t.gates.level === 'L1', worktreeId: t.worktreeId, taskId: newTaskId };
    const { task } = await this.d.engine.create(spec);
    await this.refresh();
    return task;
  }

  /** Records a review decision against the LIVE content, not against what the UI last rendered. */
  async review(taskId: string, decision: 'approved' | 'rejected' | 'changes-requested', shown: WorkspaceSnapshot): Promise<TaskRecord> {
    const live = await this.d.liveContent(taskId);
    if (!live || live.treeSha !== shown.treeSha || live.contentHash !== shown.contentHash || live.workspaceGeneration !== shown.workspaceGeneration) throw new TaskError('stale-plan');
    const t = await this.d.engine.get(taskId);
    if (t.headSha && live.headSha && t.headSha !== live.headSha) throw new TaskError('stale-plan');
    if (t.status !== 'review' && t.status !== 'done') throw new TaskError('invalid-transition');
    const r = await this.d.engine.recordReview(taskId, { reviewedTreeSha: live.treeSha, contentHash: live.contentHash, decision }, live);
    await this.refresh();
    return r;
  }

  async prepareExport(taskId: string): Promise<SessionExport> {
    const t = await this.d.engine.get(taskId); const s = await this.d.store.getSession(taskId);
    if (!s) throw new TaskError('not-found');
    return buildRedactedExport(t, s);
  }
  /** Writes only after the user confirmed the exact preview hash. */
  async saveExport(exp: SessionExport, shownHash: string): Promise<SessionExport> {
    const confirmed = await confirmExport(exp, shownHash);
    await assertExportReviewed(confirmed);
    await this.d.writeExport(confirmed);
    return confirmed;
  }
}
