/** Contract view of S7's Rust RepoContext (camelCase). Only these fields are consumed here. */
export interface RepoContext {
  repoId: string;
  worktreeId: string;
  root: string;
  gitDir: string;
  commonDir: string;
  projectPrefix?: string;
}

export type OwnerKind = 'desktop' | 'headless';

export interface OwnerInfo {
  ownerId: string;
  kind: OwnerKind;
  pid: number;
  host: string;
}

/** Typed outcomes. Gates never bypass: they return one of these. */
export type GateOutcome<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; outcome: 'owner-conflict' | 'lease-conflict' | 'lease-lost' | 'uncertain-pending' | 'review-required' | 'identity' | 'needs-recovery'; reason: string; detail?: Record<string, unknown> };

export interface Env {
  now(): number;
  host: string;
  isPidAlive(pid: number): boolean;
}
