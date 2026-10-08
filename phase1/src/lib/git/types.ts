/**
 * Git backend contract (see docs/git/CONTRACT.md). The UI says "versions"; these types keep Git names.
 * All commands run in the trusted editor window against one project root. Nothing here is network I/O.
 */
export type GitRepoState =
  | { kind: 'no-git' }                                  // git executable not found
  | { kind: 'no-repo'; root: string }                   // project folder is not in a repository
  | { kind: 'ready'; repo: GitRepoInfo }
  | { kind: 'blocked'; reason: GitBlockReason; repo?: GitRepoInfo };

export type GitBlockReason =
  | 'index-lock'        // .git/index.lock exists
  | 'merge-in-progress' | 'rebase-in-progress' | 'cherry-pick-in-progress'
  | 'invalid-repo' | 'untrusted-repo' | 'unsupported-worktree';

export interface GitRepoInfo {
  /** Absolute repo root as seen by the host. Never sent to a model or remote. */
  root: string;
  /** Project folder relative to root ('' when the project is the root). Status/commit are limited to it. */
  projectPrefix: string;
  /** CONTRACT-A addendum: shallow clone, detected and reported only (rule 9). */
  shallow?: boolean;
  /** CONTRACT-A addendum: sparse checkout active, detected and reported only (rule 9). */
  sparseCheckout?: boolean;
  branch: string | null;        // null when detached
  detached: boolean;
  unborn: boolean;              // no commit yet
  head: string | null;          // full sha
  upstream: string | null;      // e.g. origin/main; never contacted in this wave
  ahead: number; behind: number;
  hasLfs: boolean; hasSubmodules: boolean;   // detected and reported only
  gitVersion: string;
}

export type GitChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'typechange' | 'untracked' | 'conflicted' | 'ignored';
export interface GitChange {
  /** Path relative to the project folder, forward slashes. */
  path: string;
  /** Previous path for renames/copies. */
  oldPath?: string;
  kind: GitChangeKind;
  staged: boolean;              // change exists in the index
  unstaged: boolean;            // change exists in the worktree on top of the index
  binary: boolean;
  sizeBytes?: number;
  /** Suggested to skip, e.g. .DS_Store, Thumbs.db. Still listed. */
  suggestSkip?: boolean;
}
export interface GitStatus {
  repo: GitRepoInfo;
  changes: GitChange[];
  /** Opaque token of index+HEAD+worktree state. Commit must pass it back; a mismatch means "review again". */
  stateToken: string;
  truncated: boolean;           // more than 5000 entries
  /** CONTRACT-A addendum: staged changes outside the project subtree (rule 3). Reported, never committed. */
  stagedOutsidePrefix?: number;
}

export interface GitFileDiff {
  path: string;
  binary: boolean;
  /** Which two states are compared. */
  base: 'head' | 'index';
  target: 'index' | 'worktree';
  /** Full text of both sides, capped at 1 MiB each; absent for binary or missing sides. */
  before?: string; after?: string;
  /** Unified diff text, for the code view. */
  unified?: string;
  tooLarge: boolean;
}

export interface GitCommitRequest {
  /** Paths (relative to the project) the user ticked. Only these are committed. */
  paths: string[];
  /** Subject line (1-200 chars) and optional body. */
  subject: string;
  body?: string;
  /** stateToken from the status the user reviewed. */
  stateToken: string;
}
export interface GitVersion {
  sha: string;
  subject: string;
  body: string;
  authorName: string;
  /** Unix seconds. */
  time: number;
  parents: string[];
  changedFiles: number;
}
export interface GitLogRequest { limit: number; before?: string }

/** Restore never deletes: a safety copy of the current state is created first. */
export interface GitRestoreRequest { sha: string; stateToken: string; paths?: string[] }
export interface GitRestoreResult { safetyCopy: GitVersion | null; newVersion: GitVersion }

export type GitErrorCode =
  | 'git-missing' | 'not-a-repo' | 'blocked' | 'state-changed' | 'nothing-to-commit'
  | 'hook-failed' | 'signing-failed' | 'identity-missing' | 'path-rejected'
  | 'timeout' | 'cancelled' | 'too-large' | 'io' | 'unknown';
/** Commands reject with this JSON-encoded in the error string. `detail` is plain text without secrets. */
export interface GitError { code: GitErrorCode; message: string; detail?: string }

/** Frontend seam. The Tauri implementation lives in the app; tests use fakes. */
export interface GitBackend {
  detect(): Promise<GitRepoState>;
  status(): Promise<GitStatus>;
  diff(path: string, base: GitFileDiff['base'], target: GitFileDiff['target']): Promise<GitFileDiff>;
  init(): Promise<GitRepoState>;
  commit(req: GitCommitRequest): Promise<GitVersion>;
  log(req: GitLogRequest): Promise<GitVersion[]>;
  restoreAsNewVersion(req: GitRestoreRequest): Promise<GitRestoreResult>;
  /** CONTRACT-A addendum: user confirmed trust for this repo root once; commit/restore unblock. */
  trustRepo(): Promise<GitRepoState>;
}
/** Tauri command names (Rust side must use exactly these; build.rs + capabilities/editor.json entries required). */
export const GIT_COMMANDS = ['git_detect', 'git_status', 'git_diff_file', 'git_init', 'git_commit', 'git_log', 'git_restore_as_new_version', 'git_trust_repo'] as const;
export type GitCommandName = typeof GIT_COMMANDS[number];

// ---------------------------------------------------------------------------------------------
// CONTRACT-E (git-variants-conflicts): Variants (branches) and Combine (merge). Additive only.
// UI words: "variant" = branch, "combine" = merge, "yours" = the open variant, "theirs" = the other one.
// ---------------------------------------------------------------------------------------------
export interface GitVariant {
  name: string;
  current: boolean;
  tip: string;
  subject: string;
  time: number;
  /** Versions this variant has that the open one lacks. */
  ahead: number;
  /** Versions the open variant has that this one lacks. */
  behind: number;
  /** Everything in this variant is already in the open one. */
  merged: boolean;
}
export interface GitVariantCreateRequest { name: string; from?: string; open?: boolean; stateToken?: string }
export interface GitVariantOpenRequest { name: string; stateToken: string }
export interface GitVariantRenameRequest { from: string; to: string }
export interface GitVariantDeleteRequest { name: string; expectTip: string; confirmUnmerged?: boolean }
export interface GitVariantDeleteResult { name: string; deletedTip: string; backupRef: string | null }

export interface GitCombineFile { path: string; kind: 'added' | 'modified' | 'deleted' | 'typechange' }
export interface GitCombinePreview {
  name: string; tip: string; current: string;
  upToDate: boolean; fastForward: boolean;
  commits: GitVersion[]; files: GitCombineFile[]; truncated: boolean;
}
export interface GitCombineStartRequest { name: string; expectTip: string; stateToken: string }

export type GitConflictKind = 'both-modified' | 'both-added' | 'deleted-by-yours' | 'deleted-by-theirs' | 'other';
export interface GitConflict {
  path: string;
  kind: GitConflictKind;
  binary: boolean;
  tooLarge: boolean;
  /** Text sides; null when that side has no file or the file is binary. */
  base: string | null; yours: string | null; theirs: string | null;
  /** The file on disk right now, with git's conflict markers. */
  working: string | null;
  yoursBytes: number | null; theirsBytes: number | null;
}
export interface GitCombineSession {
  name: string; yoursTip: string; theirsTip: string;
  fastForwarded: boolean;
  /** Merge state exists; finish or abort is required. */
  merging: boolean;
  conflicts: GitConflict[];
  safetyCopy: GitVersion | null;
  version: GitVersion | null;
  proposedMessage: string;
}
/** `yours`/`theirs` pick one whole side for that file (for a side that deleted the file: accept the deletion). */
export type GitResolveChoice = 'yours' | 'theirs' | 'content';
export interface GitConflictResolution { path: string; choice: GitResolveChoice; content?: string }
export interface GitCombineResolveRequest { resolutions: GitConflictResolution[] }
export interface GitCombineFinishRequest { message?: string }

/** Extra `GitError.detail` values used by CONTRACT-E (code is `blocked` unless noted). */
export type GitVariantErrorDetail =
  | 'invalid-variant-name' | 'variant-exists' | 'variant-missing' | 'is-current' | 'unmerged-variant'
  | 'dirty-worktree' | 'detached-head' | 'unborn' | 'same-variant' | 'up-to-date' | 'unrelated-histories'
  | 'no-merge' | 'not-a-conflict' | 'duplicate-resolution' | 'conflict-markers' | 'binary-needs-choice'
  | 'content-missing' | 'content-invalid' | 'unresolved-conflicts' | 'conflict-outside-project';

/** Separate seam so the fakes of packages A-D keep compiling. */
export interface GitVariantsBackend {
  listVariants(): Promise<GitVariant[]>;
  createVariant(req: GitVariantCreateRequest): Promise<GitVariant>;
  openVariant(req: GitVariantOpenRequest): Promise<GitRepoState>;
  renameVariant(req: GitVariantRenameRequest): Promise<GitVariant>;
  deleteVariant(req: GitVariantDeleteRequest): Promise<GitVariantDeleteResult>;
  combinePreview(name: string): Promise<GitCombinePreview>;
  combineStart(req: GitCombineStartRequest): Promise<GitCombineSession>;
  combineStatus(): Promise<GitCombineSession | null>;
  combineResolve(req: GitCombineResolveRequest): Promise<GitCombineSession>;
  combineFinish(req: GitCombineFinishRequest): Promise<GitVersion>;
  combineAbort(): Promise<GitRepoState>;
}
export const GIT_VARIANT_COMMANDS = [
  'git_variant_list', 'git_variant_create', 'git_variant_open', 'git_variant_rename', 'git_variant_delete',
  'git_combine_preview', 'git_combine_start', 'git_combine_status', 'git_combine_resolve', 'git_combine_finish', 'git_combine_abort',
] as const;
export type GitVariantCommandName = typeof GIT_VARIANT_COMMANDS[number];
