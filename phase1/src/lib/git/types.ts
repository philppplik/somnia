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
