import { TaskError, exitCodeForError, exitCodeForStatus } from './errors';
import type { ExitCode } from './errors';
import type { SessionRecord, TaskRecord } from './schema';

/** Deterministic JSON subset for `somnia run --json` (R5-C4): stable key order, no ANSI, no private fields. */
export function toCliJson(t: TaskRecord, s?: SessionRecord | null, requestId?: string) {
  return {
    schemaVersion: t.schemaVersion, requestId: requestId ?? null,
    taskId: t.taskId, repoId: t.repoId, worktreeId: t.worktreeId, branch: t.branch,
    status: t.status, exitCode: exitCodeForStatus(t.status), outcome: t.outcome,
    baseSha: t.baseSha, headSha: t.headSha ?? null, workspaceGeneration: t.workspaceGeneration,
    gateLevel: t.gates.level,
    checkpoints: t.checkpoints.map(c => ({ sha: c.sha, reviewState: c.reviewState })),
    verification: t.verification ? { outcome: t.verification.outcome, treeSha: t.verification.treeSha } : null,
    review: t.review ? { decision: t.review.decision, reviewedTreeSha: t.review.reviewedTreeSha } : null,
    cost: t.cost,
    diffSummary: s?.diffSummary ? { files: s.diffSummary.files, additions: s.diffSummary.additions, deletions: s.diffSummary.deletions } : null,
    error: t.error ?? null,
  };
}
export function errorToCliJson(e: unknown, requestId?: string): { exitCode: ExitCode; error: ReturnType<TaskError['toJSON']> } {
  const te = e instanceof TaskError ? e : new TaskError('invalid-record', requestId);
  return { exitCode: exitCodeForError(e), error: te.toJSON() };
}
