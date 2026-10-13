import { TaskError } from './errors';
import type { Gate, Review, TaskRecord, Verification } from './schema';
import { GATE_ORDER } from './schema';

/** Current workspace state the Board and the CLI both pass in (matches the Board snapshot port). */
export interface WorkspaceSnapshot { contentHash: string; treeSha: string; workspaceGeneration: number }

export type Actor = 'user' | 'agent' | 'cli';
/** Gates that publish or touch the network. Always explicit per action (L2, R5-C2/C5). */
export const L2_GATES: readonly Gate[] = ['review-publication', 'push', 'review-pr', 'create-pr'];
/** Gates an L1 task may chain unattended. */
export const L1_AUTO_GATES: readonly Gate[] = ['prepare', 'run', 'save', 'commit'];
const NETWORK_WRITE: readonly Gate[] = ['push', 'create-pr'];
/** Gates that touch the working tree: agent-initiated ones are blocked by unsaved buffers (R5-C6). */
const TREE_GATES: readonly Gate[] = ['prepare', 'run', 'save', 'commit', 'push'];

export interface GateRequest {
  gate: Gate;
  actor: Actor;
  snapshot: WorkspaceSnapshot;
  unsavedBuffers: number;
  /** An explicit, per-action approval from the user for exactly this gate (e.g. clicking Push after review). */
  explicitApproval?: boolean;
  /** CLI --yes: covers the local commit only, never anything in L2. */
  yes?: boolean;
  headless?: boolean;
  requestId?: string;
}

export type GateDecision =
  | { kind: 'proceed'; mode: 'manual' | 'auto-local'; markUnreviewed: boolean }
  | { kind: 'needs-review'; reason: 'review-required' | 'explicit-approval' };

const err = (code: ConstructorParameters<typeof TaskError>[0], r: GateRequest) => new TaskError(code, r.requestId);

/** Approvals are valid only for the exact content they were given for. */
export function approvalIsCurrent(a: Verification | Review | undefined, snap: WorkspaceSnapshot): boolean {
  if (!a) return false;
  const tree = 'reviewedTreeSha' in a ? a.reviewedTreeSha : a.treeSha;
  return tree === snap.treeSha && a.contentHash === snap.contentHash;
}

/**
 * Decides whether a gate may proceed. Throws TaskError for blockers; returns needs-review when a human step is
 * pending (headless callers map that to exit code 2 via `enforceHeadless`).
 */
export function evaluateGate(task: TaskRecord, req: GateRequest): GateDecision {
  const idx = GATE_ORDER.indexOf(req.gate);
  if (idx < 0) throw err('gate-denied', req);
  if (req.actor !== 'user' && TREE_GATES.includes(req.gate) && req.unsavedBuffers > 0) throw err('unsaved-buffer', req);

  // L2: publication is never automatic. Launching an agent never enables push (R5-C5).
  if (L2_GATES.includes(req.gate)) {
    if (req.actor === 'agent' && NETWORK_WRITE.includes(req.gate) && !task.gates.networkGrant?.granted) throw err('gate-denied', req);
    if (req.actor === 'agent' && !req.explicitApproval) throw err('gate-denied', req);
    if (!req.explicitApproval) return { kind: 'needs-review', reason: 'explicit-approval' };
    // A push/PR must rest on a review of the exact content that is going out.
    if (req.gate !== 'review-publication' && (task.review?.decision !== 'approved' || !approvalIsCurrent(task.review, req.snapshot))) throw err('stale-plan', req);
    if (task.checkpoints.some(c => c.reviewState === 'unreviewed-checkpoint') && task.review?.decision !== 'approved') throw err('review-required', req);
    return { kind: 'proceed', mode: 'manual', markUnreviewed: false };
  }

  const l1 = task.gates.level === 'L1' && L1_AUTO_GATES.includes(req.gate);
  if (l1) {
    // Local commit under L1: allowed unattended, recorded as an unreviewed checkpoint.
    return { kind: 'proceed', mode: 'auto-local', markUnreviewed: req.gate === 'commit' };
  }

  if (req.gate === 'commit' || req.gate === 'save') {
    const reviewed = task.review?.decision === 'approved' && approvalIsCurrent(task.review, req.snapshot);
    if (reviewed) return { kind: 'proceed', mode: 'manual', markUnreviewed: false };
    if (task.review && task.review.decision === 'approved') throw err('stale-plan', req); // content changed after approval
    // --yes covers local commit only, as an explicit unreviewed checkpoint.
    if (req.gate === 'commit' && req.yes) return { kind: 'proceed', mode: 'manual', markUnreviewed: true };
    return { kind: 'needs-review', reason: 'review-required' };
  }
  if (req.actor !== 'user' && req.gate === 'review-edits') return { kind: 'needs-review', reason: 'review-required' };
  // prepare / run / review-edits under L0: user (or CLI) invoking it is the manual step.
  if (req.actor === 'agent') return { kind: 'needs-review', reason: 'review-required' };
  return { kind: 'proceed', mode: 'manual', markUnreviewed: false };
}

/** --headless fails with a structured review-required error instead of bypassing a gate. */
export function enforceHeadless(d: GateDecision, req: GateRequest): GateDecision {
  if (d.kind === 'needs-review' && req.headless) throw err('review-required', req);
  return d;
}
