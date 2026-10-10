/**
 * Ref-level read contracts for Explain, Compare and the Safety browser (gh/explain-compare).
 * Shapes follow concept section 6 (`git_diff_refs`, `git_safety_list`). The concept names fields only
 * loosely, so this file is the single place the frontend's expectation is written down. The Rust side
 * (S2) must match it or ship an adapter. Read-only: none of these commands writes or touches the network.
 *
 * `git_ref_tree` and `git_read_blob` are the two additions a full-project snapshot needs; without them
 * the UI degrades to changed files only and says so (see snapshot.ts).
 */
export type GitRefChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'typechange';
export interface GitRefSide {
  /** What the caller asked for (branch, tag, sha). */
  ref: string;
  /** Immutable commit the ref resolved to (40 hex). */
  sha: string;
  /** Root tree of that commit (40 hex), scoped to the project prefix by the host. */
  tree: string;
}
export interface GitRefFile {
  /** Path relative to the project folder, forward slashes. */
  path: string;
  oldPath?: string;
  kind: GitRefChangeKind;
  binary: boolean;
  sizeBytes?: number;
  /** Blob ids of each side, null when the side does not have the file. */
  beforeBlob?: string | null;
  afterBlob?: string | null;
  /** Bounded unified patch for text files. */
  patch?: string;
  patchTruncated?: boolean;
}
export interface GitDiffRefsRequest { from: string; to: string }
export interface GitDiffRefsResult { from: GitRefSide; to: GitRefSide; files: GitRefFile[]; truncated: boolean }

export interface GitTreeEntry { path: string; blob: string; sizeBytes: number; binary: boolean }
export interface GitRefTree { side: GitRefSide; entries: GitTreeEntry[]; truncated: boolean }
export interface GitBlobRead { blob: string; binary: boolean; tooLarge: boolean; sizeBytes: number; text?: string }

export type GitSafetyOperation = 'restore' | 'combine' | 'variant-delete' | 'other';
export interface GitSafetyEntry {
  /** Always under refs/somnia/safety/. */
  ref: string;
  sha: string;
  /** Unix seconds. */
  time: number;
  /** Project-relative scope; empty means the whole project. */
  scope: string[];
  operation: GitSafetyOperation;
  subject: string;
}

export interface GitRefsBackend {
  diffRefs(req: GitDiffRefsRequest): Promise<GitDiffRefsResult>;
  safetyList(): Promise<GitSafetyEntry[]>;
  /** Optional: full tree of one ref. Absent means snapshots are partial. */
  refTree?(ref: string): Promise<GitRefTree>;
  /** Optional: text of one blob, bounded by the host. */
  readBlob?(blob: string): Promise<GitBlobRead>;
}
export const GIT_REFS_COMMANDS = ['git_diff_refs', 'git_safety_list', 'git_ref_tree', 'git_read_blob'] as const;

const HEX = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
export const isObjectId = (s: unknown): s is string => typeof s === 'string' && HEX.test(s);
/** Refuses refs that could be read as options or that carry control characters. */
export const safeRefName = (s: string) => !!s && s.length <= 200 && !s.startsWith('-') && !/[\0-\x1f\x7f\s~^:?*\[\\]|\.\.|@\{/.test(s);

export function createTauriRefsBackend(invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>): GitRefsBackend {
  return {
    diffRefs: req => invoke('git_diff_refs', {request: req}),
    safetyList: () => invoke('git_safety_list'),
    refTree: ref => invoke('git_ref_tree', {gitRef: ref}),
    readBlob: blob => invoke('git_read_blob', {blob}),
  };
}

/** Rejects malformed host answers instead of rendering them. */
export function validateDiffRefs(r: GitDiffRefsResult, req: GitDiffRefsRequest): GitDiffRefsResult {
  for (const [side, ref] of [[r?.from, req.from], [r?.to, req.to]] as const) {
    if (!side || side.ref !== ref || !isObjectId(side.sha) || !isObjectId(side.tree)) throw new Error('Version comparison response does not match the request');
  }
  if (!Array.isArray(r.files)) throw new Error('Version comparison response has no file list');
  for (const f of r.files) {
    if (!f.path || /^[\/\\]|\0|\\/.test(f.path) || f.path.split('/').some(p => p === '..' || p === '.' || p === '')) throw new Error('Version comparison contains an unsafe path');
    for (const b of [f.beforeBlob, f.afterBlob]) if (b != null && !isObjectId(b)) throw new Error('Version comparison contains an invalid blob id');
  }
  return r;
}
