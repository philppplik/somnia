import { CostMeter, watchdogCheck } from './cost';
import type { Usage } from './cost';
import { TaskError, newRequestId } from './errors';
import { approvalIsCurrent, enforceHeadless, evaluateGate } from './gates';
import type { GateDecision, GateRequest, WorkspaceSnapshot } from './gates';
import type { Gate, Review, SessionRecord, TaskBudget, TaskProducer, TaskRecord, TaskStatus, Verification } from './schema';
import { TASK_SCHEMA_VERSION, emptyCost, inAllowedRoots, isProjectRelative, isSafeId, isSha, isTransitionAllowed, taskBranch } from './schema';
import type { TaskStore } from './store';
import { validateTaskRecord } from './store';

export interface EngineDeps {
  store: TaskStore;
  now?: () => number;
  newId?: () => string;
}

export interface CreateTaskSpec {
  repoId: string;
  baseSha: string;
  intent: string;
  allowedRoots?: string[];
  producer: TaskProducer;
  budget?: TaskBudget;
  /** L1 auto-local. Per-task flag, default off. */
  autoLocal?: boolean;
  worktreeId?: string | null;
  workspaceGeneration?: number;
  /** Used only to reject duplicates; sequential mode allows one active task per repo, worktree mode one per worktree. */
  taskId?: string;
}

const ACTIVE = new Set<TaskStatus>(['queued', 'preparing', 'running', 'waiting-input', 'review']);

/**
 * Task/session engine: producer-agnostic state machine over a TaskStore. No UI, no git side effects, no network.
 * The git core, agent runner and CLI/Board adapters call into it; it enforces gates, hash-bound approvals,
 * request-id idempotency, budgets and the watchdog.
 */
export class TaskEngine {
  private now: () => number;
  private newId: () => string;
  private startedAt = new Map<string, number>();
  constructor(private readonly d: EngineDeps) {
    this.now = d.now ?? Date.now;
    this.newId = d.newId ?? (() => `t${this.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  }
  private iso() { return new Date(this.now()).toISOString(); }

  async get(taskId: string): Promise<TaskRecord> {
    const t = await this.d.store.getTask(taskId);
    if (!t) throw new TaskError('not-found');
    return t;
  }
  private async save(t: TaskRecord): Promise<TaskRecord> { t.updatedAt = this.iso(); validateTaskRecord(t); await this.d.store.putTask(t); return t; }

  async create(spec: CreateTaskSpec): Promise<{ task: TaskRecord; session: SessionRecord }> {
    const taskId = spec.taskId ?? this.newId();
    const roots = spec.allowedRoots?.length ? spec.allowedRoots : ['.'];
    if (!isSafeId(spec.repoId) || !isSafeId(taskId) || !isSha(spec.baseSha) || !roots.every(r => r === '.' || isProjectRelative(r))) throw new TaskError('invalid-record');
    const worktreeId = spec.worktreeId ?? null;
    const existing = await this.d.store.listTasks(spec.repoId);
    // Sequential: one active task per project. Worktree mode (D4): one per worktree, branches never collide.
    if (existing.some(t => t.taskId === taskId)) throw new TaskError('duplicate-request');
    if (existing.some(t => ACTIVE.has(t.status) && t.worktreeId === worktreeId)) throw new TaskError('dirty');
    const ts = this.iso();
    const task: TaskRecord = {
      schemaVersion: TASK_SCHEMA_VERSION, taskId, repoId: spec.repoId, worktreeId, branch: taskBranch(taskId),
      baseSha: spec.baseSha, workspaceGeneration: spec.workspaceGeneration ?? 0, allowedRoots: roots,
      producer: spec.producer, budget: spec.budget ?? {}, status: 'queued',
      gates: { level: spec.autoLocal ? 'L1' : 'L0' },
      checkpoints: [], requests: [], outcome: 'certain', preserve: false, cost: emptyCost(),
      lastActivityAt: ts, createdAt: ts, updatedAt: ts,
    };
    const session: SessionRecord = { schemaVersion: TASK_SCHEMA_VERSION, taskId, intent: spec.intent, plan: [], userOverrides: [], cost: emptyCost(), notes: [], createdAt: ts, updatedAt: ts };
    await this.save(task);
    await this.d.store.putSession(session);
    return { task, session };
  }

  async transition(taskId: string, to: TaskStatus, err?: TaskError): Promise<TaskRecord> {
    const t = await this.get(taskId);
    if (!isTransitionAllowed(t.status, to)) throw new TaskError('invalid-transition');
    t.status = to;
    if (to === 'preparing' || to === 'running') { this.startedAt.set(taskId, this.startedAt.get(taskId) ?? this.now()); }
    if (err) t.error = { code: err.code, message: err.message };
    t.lastActivityAt = this.iso();
    return this.save(t);
  }

  /** Any producer reports activity (resets the watchdog). */
  async heartbeat(taskId: string): Promise<void> { const t = await this.get(taskId); t.lastActivityAt = this.iso(); await this.save(t); }

  /** Scope check for agent file operations: paths outside allowedRoots are a typed error. */
  async assertInScope(taskId: string, path: string): Promise<void> {
    const t = await this.get(taskId);
    if (!inAllowedRoots(t.allowedRoots, path)) throw new TaskError('scope-violation');
  }

  /** Workspace changed under the task: bumps the generation and invalidates verification and review. */
  async noteWorkspaceChange(taskId: string, snap: WorkspaceSnapshot): Promise<TaskRecord> {
    const t = await this.get(taskId);
    t.workspaceGeneration = Math.max(t.workspaceGeneration, snap.workspaceGeneration);
    if (!approvalIsCurrent(t.verification, snap)) delete t.verification;
    if (!approvalIsCurrent(t.review, snap)) delete t.review;
    t.lastActivityAt = this.iso();
    return this.save(t);
  }

  async recordVerification(taskId: string, v: Omit<Verification, 'at'>): Promise<TaskRecord> {
    const t = await this.get(taskId);
    t.verification = { ...v, at: this.iso() };
    const s = await this.d.store.getSession(taskId); if (s) { s.verification = t.verification; s.updatedAt = this.iso(); await this.d.store.putSession(s); }
    return this.save(t);
  }
  async recordReview(taskId: string, r: Omit<Review, 'at'>, current: WorkspaceSnapshot): Promise<TaskRecord> {
    // Reject a review of content that is no longer the content in the workspace.
    if (r.reviewedTreeSha !== current.treeSha || r.contentHash !== current.contentHash) throw new TaskError('stale-plan');
    const t = await this.get(taskId);
    t.review = { ...r, at: this.iso() };
    return this.save(t);
  }

  /** Gate evaluation with headless enforcement. Never mutates. */
  async evaluate(taskId: string, req: GateRequest): Promise<GateDecision> {
    const t = await this.get(taskId);
    const rid = req.requestId ?? newRequestId(this.now());
    return enforceHeadless(evaluateGate(t, { ...req, requestId: rid }), { ...req, requestId: rid });
  }

  /** Records a local commit. L1 and --yes commits are unreviewed checkpoints, never human-approved versions. */
  async recordCommit(taskId: string, sha: string, snap: WorkspaceSnapshot, decision: GateDecision): Promise<TaskRecord> {
    if (decision.kind !== 'proceed' || !isSha(sha)) throw new TaskError('gate-denied');
    const t = await this.get(taskId);
    t.headSha = sha;
    t.workspaceGeneration = Math.max(t.workspaceGeneration, snap.workspaceGeneration);
    t.checkpoints.push({ sha, treeSha: snap.treeSha, at: this.iso(), reviewState: decision.markUnreviewed ? 'unreviewed-checkpoint' : 'reviewed' });
    return this.save(t);
  }

  /**
   * Runs `fn` at most once per requestId. A repeat after success returns without re-running; a repeat while the
   * first attempt is unresolved (crash, disconnect) is `uncertain-outcome`: the caller must check the remote
   * before issuing a new request id (R5-C4/C6).
   */
  async runOnce<T>(taskId: string, requestId: string, op: string, fn: () => Promise<T>): Promise<{ replayed: boolean; value?: T }> {
    const t = await this.get(taskId);
    const prev = t.requests.find(r => r.id === requestId);
    if (prev) {
      if (prev.state === 'finished' && prev.result === 'ok') return { replayed: true };
      if (prev.state === 'finished') throw new TaskError('duplicate-request', requestId);
      throw new TaskError('uncertain-outcome', requestId);
    }
    t.requests.push({ id: requestId, op, state: 'started', at: this.iso() });
    await this.save(t);
    try {
      const value = await fn();
      const t2 = await this.get(taskId);
      const e = t2.requests.find(r => r.id === requestId)!; e.state = 'finished'; e.result = 'ok';
      await this.save(t2);
      return { replayed: false, value };
    } catch (e) {
      const t2 = await this.get(taskId);
      const entry = t2.requests.find(r => r.id === requestId)!;
      const code = e instanceof TaskError ? e.code : 'uncertain-outcome';
      entry.state = isNetworkOp(op) && !(e instanceof TaskError) ? 'uncertain' : 'finished'; entry.result = 'error'; entry.errorCode = code;
      if (entry.state === 'uncertain') { t2.outcome = 'uncertain'; t2.preserve = true; }
      await this.save(t2);
      throw e;
    }
  }

  /**
   * Cancel distinguishes local termination from uncertain remote outcome. A cancelled network write is
   * `uncertain` until `reconcile`; the task is preserved meanwhile.
   */
  async cancel(taskId: string): Promise<TaskRecord> {
    const t = await this.get(taskId);
    if (!isTransitionAllowed(t.status, 'cancelled')) throw new TaskError('invalid-transition');
    const inFlight = t.requests.filter(r => r.state === 'started' && isNetworkOp(r.op));
    for (const r of inFlight) r.state = 'uncertain';
    if (inFlight.length) { t.outcome = 'uncertain'; t.preserve = true; }
    t.status = 'cancelled';
    t.lastActivityAt = this.iso();
    return this.save(t);
  }
  /** After the remote ref was actually checked. */
  async reconcile(taskId: string, requestId: string, remote: 'applied' | 'not-applied'): Promise<TaskRecord> {
    const t = await this.get(taskId);
    const r = t.requests.find(x => x.id === requestId);
    if (!r || r.state !== 'uncertain') throw new TaskError('not-found');
    r.state = 'finished'; r.result = remote === 'applied' ? 'ok' : 'error'; r.errorCode = remote === 'applied' ? undefined : 'uncertain-outcome';
    if (!t.requests.some(x => x.state === 'uncertain')) { t.outcome = 'certain'; t.preserve = false; }
    return this.save(t);
  }

  /** Cost meter: persists totals, fails the task when the budget is hit. */
  async addUsage(taskId: string, u: Usage): Promise<'ok' | 'warn' | 'exceeded'> {
    const t = await this.get(taskId);
    const m = new CostMeter(t.budget, t.cost);
    const st = m.add(u);
    t.cost = m.totals; t.lastActivityAt = this.iso();
    const s = await this.d.store.getSession(taskId); if (s) { s.cost = { ...m.totals }; s.updatedAt = this.iso(); await this.d.store.putSession(s); }
    if (st === 'exceeded' && isTransitionAllowed(t.status, 'failed')) { t.status = 'failed'; t.error = { code: 'budget-exceeded', message: new TaskError('budget-exceeded').message }; }
    await this.save(t);
    return st;
  }

  /** Watchdog sweep: fails stalled or over-time active tasks with a typed retryable error. Returns affected ids. */
  async sweepWatchdog(): Promise<string[]> {
    const hit: string[] = [];
    for (const t of await this.d.store.listTasks()) {
      if (t.status !== 'running' && t.status !== 'preparing') continue;
      const started = this.startedAt.get(t.taskId) ?? Date.parse(t.createdAt);
      const v = watchdogCheck(t.budget, started, Date.parse(t.lastActivityAt), this.now());
      if (v.stalled || v.overWall) {
        t.status = 'failed'; t.error = { code: 'watchdog-timeout', message: new TaskError('watchdog-timeout').message };
        await this.save(t); hit.push(t.taskId);
      }
    }
    return hit;
  }

  /** Whether a Gate is the next manual step the user must act on. Drives Board card state. */
  nextGate(t: TaskRecord): Gate | null {
    if (t.status === 'review') return 'review-edits';
    if (t.status === 'done') return t.headSha ? 'review-publication' : null;
    return null;
  }
}

const isNetworkOp = (op: string) => op === 'push' || op === 'create-pr' || op === 'fetch' || op === 'pull';
