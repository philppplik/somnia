import type { SessionRecord, TaskRecord } from './schema';
import { sha256Hex } from './hash';
import { TaskError } from './errors';

/** Patterns for secrets that must never leave the private store (R5-C7). */
const SECRET_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g, /\bAKIA[0-9A-Z]{16}\b/g, /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /(https?:\/\/)[^\s/@:]+:[^\s/@]+@/g,
  /\b(?:authorization|api[_-]?key|token|secret|password|passwd)\s*[:=]\s*\S+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
];
const LOCAL_PATHS: RegExp[] = [/\b[A-Za-z]:\\(?:Users|Documents and Settings)\\[^\s\\]+(?:\\[^\s]*)?/g, /\/(?:Users|home)\/[^\s/]+(?:\/[^\s]*)?/g];

export function redactText(s: string): string {
  let out = s;
  for (const p of SECRET_PATTERNS) out = out.replace(p, m => m.startsWith('http') ? m.replace(/\/\/[^@]*@/, '//[redacted]@') : '[redacted]');
  for (const p of LOCAL_PATHS) out = out.replace(p, '[local-path]');
  return out;
}

export interface SessionExport {
  format: 'somnia-session-export'; version: 1;
  taskId: string; branch: string; baseSha: string; headSha?: string;
  producer: { kind: string; name: string; model?: string };
  status: string; intent: string; plan: string[];
  verification?: { commands: string[]; outcome: string; treeSha: string };
  diffSummary?: { files: number; additions: number; deletions: number };
  cost: { inputTokens: number; outputTokens: number; costUsd: number };
  notes: string[];
  /** Export is a separate artifact: unreviewed until a human confirms the exact content hash. */
  review: { state: 'unreviewed' | 'confirmed'; contentHash: string };
}

/** Builds the redacted export. Drops raw transcripts, tool-call logs, env/helper output and user-override text. */
export async function buildRedactedExport(task: TaskRecord, session: SessionRecord): Promise<SessionExport> {
  const body = {
    format: 'somnia-session-export' as const, version: 1 as const,
    taskId: task.taskId, branch: task.branch, baseSha: task.baseSha, headSha: task.headSha,
    producer: { kind: task.producer.kind, name: task.producer.name, model: task.producer.model },
    status: task.status, intent: redactText(session.intent), plan: session.plan.map(redactText),
    verification: session.verification && { commands: session.verification.commands.map(redactText), outcome: session.verification.outcome, treeSha: session.verification.treeSha },
    diffSummary: session.diffSummary && { files: session.diffSummary.files, additions: session.diffSummary.additions, deletions: session.diffSummary.deletions },
    cost: { inputTokens: session.cost.inputTokens, outputTokens: session.cost.outputTokens, costUsd: session.cost.costUsd },
    notes: session.notes.map(redactText),
  };
  return { ...body, review: { state: 'unreviewed', contentHash: await sha256Hex(JSON.stringify(body)) } };
}

/** Human confirms the preview: bound to the content hash that was shown. */
export async function confirmExport(exp: SessionExport, shownHash: string): Promise<SessionExport> {
  const { review: _r, ...body } = exp;
  if (await sha256Hex(JSON.stringify(body)) !== shownHash || exp.review.contentHash !== shownHash) throw new TaskError('stale-plan');
  return { ...exp, review: { state: 'confirmed', contentHash: shownHash } };
}
export async function assertExportReviewed(exp: SessionExport): Promise<void> {
  const { review, ...body } = exp;
  if (review.state !== 'confirmed' || await sha256Hex(JSON.stringify(body)) !== review.contentHash) throw new TaskError('review-required');
}
