# Git backend contract (dev wave A-E)

Status: contract only. Types: `phase1/src/lib/git/types.ts` (source of truth for shapes and command names). Design: docs from the Git UX concept and Git research (8 Oct 2026). Remote work (GitHub connect, push, pull, fetch) is **out of scope** for this wave.

## Ground rules
1. **System Git by process spawn.** Rust runs `git` with an argument array, never a shell string. No new crate.
   - Environment cleared; pass only PATH, HOME/USERPROFILE, SystemRoot, TEMP/TMP, LANG and `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0` for reads. Set `LC_ALL=C` for parsing. Use `-c core.quotepath=false`, porcelain v2 with `-z`.
   - No `--no-verify`, no hook bypass, no `-c` overrides of user signing or identity. A failing hook or signing returns `hook-failed` / `signing-failed`; nothing is retried silently.
   - Timeout 30 s per call (60 s for log of large repos), cancellable. Output capped.
   - Repos are not trusted by default for operations that can run hooks (commit). Report `untrusted-repo` until the user confirms once per repo root (stored in app config, not in the repo). Reads (status, diff, log) never run hooks.
2. **Paths.** All paths in the API are relative to the project folder with `/`. Reject absolute paths, `..`, NUL, and anything resolving outside the project (`path-rejected`). Handle spaces, Unicode, newlines (use `-z`), long Windows paths, case-only renames.
3. **Project subfolder.** If the project lives in a subfolder of a larger repo, `projectPrefix` is set and status, diff and commit only touch that subtree. A file staged outside the subtree is reported, never committed.
4. **Editor buffers are not the worktree.** The backend only sees disk. The UI must ask the user to save, or show unsaved buffers separately. Commit never writes buffers.
5. **No hidden state changes.** Commit commits exactly `paths`. The backend stages those paths (`git add --` / `git rm --`), commits with `-- <paths>` semantics, and does nothing else. Partial hunks are out of scope for this wave.
6. **stateToken.** Hash of HEAD sha, index tree and the stat/hash of the listed changed files. `git_commit` and `git_restore_as_new_version` recompute it; mismatch returns `state-changed` and the UI reviews again.
7. **Restore never deletes.** `git_restore_as_new_version`: refuse if blocked; create a safety copy (a normal commit on a hidden ref `refs/somnia/safety/<time>` capturing the current worktree of the project, including untracked non-ignored files), then write the old version's files and commit them as a new version on the current branch. Failure after the safety copy leaves the safety copy and reports it.
8. **No network.** No fetch, pull, push, clone, remote add. `upstream`/`ahead`/`behind` come from local refs only.
9. **Detect and report, don't support:** LFS, submodules, sparse checkout, shallow clones. Linked worktrees are supported by the native core (see WORKTREES.md). Show a clear message; never claim full support.
10. **Secrets.** Never log commit bodies, tokens or full environment. Error `detail` is sanitized text.

## Commands
| Command | Args | Returns |
| --- | --- | --- |
| `git_detect` | none | `GitRepoState` |
| `git_status` | none | `GitStatus` |
| `git_diff_file` | `path`, `base`, `target` | `GitFileDiff` |
| `git_init` | none (creates repo in the project folder, default branch `main`, adds nothing) | `GitRepoState` |
| `git_commit` | `GitCommitRequest` | `GitVersion` |
| `git_log` | `GitLogRequest` | `GitVersion[]` (project-scoped) |
| `git_restore_as_new_version` | `GitRestoreRequest` | `GitRestoreResult` |

All commands: trusted editor window only (`gate`), listed in `build.rs` and `capabilities/editor.json` (`allow-git-detect`, ...). Errors are `GitError` JSON strings.

## Work packages and ownership
| Pkg | Branch | Owns | Must not touch |
| --- | --- | --- | --- |
| A git-core | `agent/git-core` | `src-tauri/src/git.rs`, command wiring in desktop.rs/build.rs/capabilities, Rust tests with temp repos | UI |
| B git-ui-changes | `agent/git-ui-changes` | `src/components/versions/*` Changes tab, i18n keys `versions.*`, fake `GitBackend` for tests | Rust |
| C git-history-safety | `agent/git-history-safety` | History tab, safety-copy timeline (merges `git_log` with existing recovery snapshots), restore dialog | Rust git.rs |
| D git-visual-diff | `agent/git-visual-diff` | `src/lib/visualDiff/*`, slider/side-by-side/only-changes view operating on two in-memory file sets | Rust |
| E git-variants-conflicts | `agent/git-variants-conflicts` | extends contract with branch/merge commands (adds a CONTRACT-E section), after A | everything outside |

Shared files: `src/lib/git/types.ts` changes only via a PR/patch that updates this document too. Locale JSON is merged by key union, `test:core` globs by appending (see helper conventions of earlier waves). Each package adds its test glob to `package.json`.

## Test gates (from the research; each package covers its part)
Status/diff, commit selection (no unreviewed extra content), file safety (CRLF/LF, Unicode, spaces, long Windows paths, case-only rename), recovery (discard, app abort mid-commit, safety copy), Git states (no git, invalid repo, `.git` file, detached, unborn, index.lock, merge/rebase running), trust/hooks, UI/A11y (keyboard only, not only red/green, dark theme, small window, long names). Integration tests use real temporary repos; UI tests use the fake backend. Interactive Windows/macOS behavior stays unverified until Philipp tests it.

## CONTRACT-A addendum (git-core, branch agent/git-git-core)

Additive only; nothing above changes meaning.

- **`git_trust_repo`** (new command, args none, returns `GitRepoState`): rule 1 requires a one-time user confirmation per repo root before commands that can run hooks (commit, restore). The original command list had no way to record that confirmation, so package A adds this command. The trusted roots live in app config (`git-trusted-repos.json`, atomic write, 0600), never in the repo. `git_detect` reports `blocked/untrusted-repo` (with full `GitRepoInfo` attached) until trust is given; reads (`git_status`, `git_diff_file`, `git_log`) never check trust because they never run hooks. Trust failures from `git_commit`/`git_restore_as_new_version` are `GitError { code: "blocked", detail: "untrusted-repo" }`.
- **`GitRepoInfo.shallow` / `GitRepoInfo.sparseCheckout`** (optional booleans): rule 9 asks to "detect and report" shallow clones and sparse checkouts, but `GitRepoInfo` had no field. Reported only; the backend still works on them as far as the local object store allows, and the UI should show the "not fully supported" hint.
- **`GitStatus.stagedOutsidePrefix`** (optional number): rule 3 says files staged outside the project subtree are "reported, never committed". This counts them; the UI can surface "N staged files outside this project are not included".
- **`GitBlockReason` usage**: `.git` file roots and split `git-dir`/`common-dir` are now detected through system Git and do not by themselves block local operations. Index/merge/rebase/cherry-pick state uses each checkout's private Git directory. `unsupported-worktree` remains a legacy wire value, no longer emitted solely for linked worktrees. LFS and submodules remain detection-only features.
- **Hook-failed mapping**: git gives no machine-readable hook marker. Commit failures are classified in order identity → signing → nothing-to-commit → (an active non-sample pre-commit/commit-msg/prepare-commit-msg/post-commit hook exists → `hook-failed`) → `unknown`. Documented so package B/C can word the UI accordingly.
- **Cancellation**: the 30 s / 60 s timeouts are enforced and the child is killed; UI-initiated cancel is not wired (no channel yet) and `cancelled` is reserved.
- **Limit**: `git_log.limit` is clamped to 1-200 per call; paginate with `before` (first-parent based).

## CONTRACT-E (git-variants-conflicts, branch agent/git-variants)

Additive only. UI words: variant = branch, combine = merge, "yours" = the open variant (stage 2, `--ours`), "theirs" = the other variant (stage 3). Code: `src-tauri/src/git/variants.rs` (child module of `git.rs`, uses its runner, trust store and safety copy), types in `src/lib/git/types.ts` (`GitVariantsBackend` is a separate interface so the fakes of A-D keep compiling). Tauri payloads follow package A: `{ request }`. Still no network, no force, no `-X ours/theirs`, no `--no-verify`.

| Command | Args | Returns | Notes |
| --- | --- | --- | --- |
| `git_variant_list` | none | `GitVariant[]` | open one first, then newest. `ahead/behind` against the open variant. |
| `git_variant_create` | `GitVariantCreateRequest` | `GitVariant` | `open` switches. Starting from the current version carries uncommitted work along; any other start needs `stateToken` and a clean folder. Needs trust only when `open`. |
| `git_variant_open` | `GitVariantOpenRequest` | `GitRepoState` | trust + `stateToken` + clean whole repo (`blocked/dirty-worktree`). A detached head gets a backup ref first. |
| `git_variant_rename` | `GitVariantRenameRequest` | `GitVariant` | never overwrites (`variant-exists`). |
| `git_variant_delete` | `GitVariantDeleteRequest` | `GitVariantDeleteResult` | refuses the open variant (`is-current`), a stale `expectTip` (`state-changed`), and an unmerged variant without `confirmUnmerged` (`unmerged-variant`). Unmerged tips are kept on `refs/somnia/variant-backup/<unix>-<name>` (separate from `refs/somnia/safety/*`). |
| `git_combine_preview` | `{ name }` | `GitCombinePreview` | read only: up-to-date / fast-forward, incoming versions (max 20), files (max 500). |
| `git_combine_start` | `GitCombineStartRequest` | `GitCombineSession` | trust, `stateToken`, `expectTip`, clean repo. Safety copy first. Fast-forward moves the variant (`fastForwarded`). Otherwise a real `git merge --no-ff --no-commit`: conflicts are returned, never resolved. Merge state is git's own (MERGE_HEAD), so it survives an app restart. |
| `git_combine_status` | none | `GitCombineSession \| null` | resume after restart. `git_detect` reports `blocked/merge-in-progress` during a combine; this command still works. |
| `git_combine_resolve` | `{ resolutions }` | `GitCombineSession` | every entry is an explicit choice: `yours`, `theirs` (a side without the file means accept the deletion) or `content` (text only). Validated as a whole before anything is written. Refused: unknown path, duplicate, binary with `content`, result containing conflict markers. Partial calls are allowed. |
| `git_combine_finish` | `{ message? }` | `GitVersion` | refused while any file is unmerged (`unresolved-conflicts`). Normal commit, so hooks run; `hook-failed`, `signing-failed`, `identity-missing` map as in `git_commit`. |
| `git_combine_abort` | none | `GitRepoState` | `git merge --abort`. Worktree was clean at start, the safety copy exists. |

Rules:
1. Nothing is decided for the user. There is no "keep all mine/theirs" command. Binary and too-large (>1 MiB per side) conflicts only take a whole side.
2. A conflict outside the project subtree aborts the combine (`conflict-outside-project`).
3. UI guard (not visible to git): switching, starting, finishing and aborting a combine are blocked while the editor has unsaved buffers or a running review (`VariantGuards` in `src/lib/git/variantsFlow.ts`). After any of them the editor must reload files from disk (`onDiskChanged`).
4. Errors use `GitError.code = "blocked"` with `detail` from `GitVariantErrorDetail`.
