/**
 * Agent task + session record (R5-C1). Producer-agnostic and versioned so external CLI runs
 * can be recorded later without a format migration. Contains NO credentials, prompts, local
 * absolute paths or raw transcripts in the task record; the session record is private storage.
 */
export const TASK_SCHEMA_VERSION = 1 as const;

export type TaskStatus = 'queued' | 'preparing' | 'running' | 'waiting-input' | 'review' | 'done' | 'failed' | 'cancelled';
export const TASK_STATUSES: readonly TaskStatus[] = ['queued', 'preparing', 'running', 'waiting-input', 'review', 'done', 'failed', 'cancelled'];
export const TERMINAL_STATUSES: readonly TaskStatus[] = ['done', 'failed', 'cancelled'];

/** Allowed status transitions. Terminal states have no outgoing edge (a retry is a new task). */
export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  queued: ['preparing', 'cancelled'],
  preparing: ['running', 'waiting-input', 'failed', 'cancelled'],
  running: ['waiting-input', 'review', 'done', 'failed', 'cancelled'],
  'waiting-input': ['preparing', 'running', 'failed', 'cancelled'],
  review: ['running', 'done', 'failed', 'cancelled'],
  done: [],
  failed: [],
  cancelled: [],
};

export type ProducerKind = 'builtin' | 'external';
export interface TaskProducer { kind: ProducerKind; name: string; version?: string; provider?: string; model?: string }

export interface TaskBudget {
  maxTokens?: number;
  /** Maximum cost in USD (BYOK users only; local models report 0). */
  maxCost?: number;
  /** Wall-clock cap for the whole run, ms. */
  maxWallMs?: number;
  /** No-activity cap before the watchdog declares a stall, ms. */
  stallMs?: number;
}

/** Approvals bind to content: a different tree or content hash invalidates them (R5-C6). */
export interface Verification {
  commands: string[];
  outcome: 'pass' | 'fail' | 'skipped';
  treeSha: string;
  contentHash: string;
  at: string;
}
export interface Review {
  reviewedTreeSha: string;
  contentHash: string;
  decision: 'approved' | 'rejected' | 'changes-requested';
  at: string;
}

/** Gate ladder level (R5-C2). */
export type GateLevel = 'L0' | 'L1';
export type Gate = 'prepare' | 'run' | 'review-edits' | 'save' | 'commit' | 'review-publication' | 'push' | 'review-pr' | 'create-pr';
export const GATE_ORDER: readonly Gate[] = ['prepare', 'run', 'review-edits', 'save', 'commit', 'review-publication', 'push', 'review-pr', 'create-pr'];

export interface TaskGates {
  /** L0 (default) all manual. L1 = auto-local for prepare/run/save/commit. L2 is never a level: it is always explicit. */
  level: GateLevel;
  /** Per-task grant for an AGENT-initiated network write (never implied by level or by --yes). */
  networkGrant?: { granted: boolean; at: string };
}

export interface CommitCheckpoint {
  sha: string;
  /** L1 commits are "unreviewed checkpoint", never a human-approved version. */
  reviewState: 'unreviewed-checkpoint' | 'reviewed';
  treeSha: string;
  at: string;
}

/** An in-flight or finished request-id scoped operation. Prevents duplicate publishes after reconnect. */
export interface RequestEntry { id: string; op: string; state: 'started' | 'finished' | 'uncertain'; at: string; result?: 'ok' | 'error'; errorCode?: string }

export interface TaskRecord {
  schemaVersion: typeof TASK_SCHEMA_VERSION;
  taskId: string;
  repoId: string;
  /** null in sequential mode; set for parallel worktree tasks (D4). */
  worktreeId: string | null;
  branch: string;
  baseSha: string;
  headSha?: string;
  workspaceGeneration: number;
  allowedRoots: string[];
  producer: TaskProducer;
  budget: TaskBudget;
  status: TaskStatus;
  gates: TaskGates;
  verification?: Verification;
  review?: Review;
  checkpoints: CommitCheckpoint[];
  requests: RequestEntry[];
  /** Remote outcome unknown after cancel/disconnect; task and worktree are preserved until reconciled (R5-C6). */
  outcome: 'certain' | 'uncertain';
  preserve: boolean;
  cost: CostTotals;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  error?: { code: string; message: string };
}

export interface CostTotals { inputTokens: number; outputTokens: number; costUsd: number; calls: number }

/** Private session record: lives in app storage, never in the repo (D6). */
export interface SessionRecord {
  schemaVersion: typeof TASK_SCHEMA_VERSION;
  taskId: string;
  intent: string;
  plan: string[];
  /** Reference (id/offset) into the tool-call log, not the transcript itself. */
  toolCallLogRef?: string;
  userOverrides: { at: string; what: string }[];
  verification?: Verification;
  diffSummary?: { files: number; additions: number; deletions: number; paths: string[] };
  cost: CostTotals;
  /** Free-form note lines produced by the run; subject to redaction on export. */
  notes: string[];
  createdAt: string;
  updatedAt: string;
}

export const BRANCH_PREFIX = 'somnia/task/';
export const taskBranch = (taskId: string) => `${BRANCH_PREFIX}${taskId}`;
export const emptyCost = (): CostTotals => ({ inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 });

const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const isSha = (s: unknown): s is string => typeof s === 'string' && SHA.test(s);
export const isSafeId = (s: unknown): s is string => typeof s === 'string' && ID.test(s) && !s.includes('..');

/** Project-relative path guard: no absolute paths, no traversal, no backslash tricks. */
export function isProjectRelative(p: unknown): p is string {
  if (typeof p !== 'string' || p === '' || p.length > 512) return false;
  if (p.startsWith('/') || p.startsWith('~') || /^[A-Za-z]:/.test(p) || p.includes('\\') || p.includes('\0')) return false;
  return !p.split('/').some(seg => seg === '..');
}

/** True when `path` lies under one of the task's allowed roots ('.' = whole project). */
export function inAllowedRoots(roots: readonly string[], path: string): boolean {
  if (!isProjectRelative(path)) return false;
  return roots.some(r => r === '.' || path === r || path.startsWith(r.replace(/\/$/, '') + '/'));
}

export function isTransitionAllowed(from: TaskStatus, to: TaskStatus): boolean { return TASK_TRANSITIONS[from].includes(to); }
