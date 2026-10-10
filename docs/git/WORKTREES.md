# Linked worktree core

Native service: `phase1/src-tauri/src/git/worktrees.rs`. No desktop command registration or UI is included in this slice. Desktop, CLI and Board hosts use this same service, not a second Git implementation.

## Host contract

All public records are camelCase. All request records reject unknown fields.

- `repo_context(project_root)` returns `RepoContext {repoId, worktreeId, root, gitDir, commonDir, projectPrefix}`. Paths are canonical local paths. IDs are SHA-256 of the canonical native common/private Git directories. IDs persist across app restart, not repository relocation. `GitRepoInfo` also returns these identity fields.
- `git_worktree_plan(root, request, workspace_guard, trust)` accepts `{destination, branch, base}`. Destination is absolute with an existing parent, does not already exist, is outside every registered checkout and the common Git directory, and has no control characters/traversal. Branch must be new and pass `check-ref-format`. Base resolves to an immutable commit. Source must be trusted and have no nonignored changes.
- The returned plan is `{context, destination, branch, baseSha, stateToken, planId}`. `planId` hashes these review inputs. It is a stale-review binding, NOT authorization or a signature. Hosts must retain the approved plan, not trust a renderer's fabricated approval. State tokens now include branch/root/index/HEAD plus changed-file byte contents (including symlink targets), not only file size/mtime.
- `git_worktree_add(root, plan, workspace_guard, trust)` takes the common repository lock, revalidates plan/branch/destination/source and pins the base SHA. A safety ref preserves that base before add. Git's branch checkout protection remains active; no force add. Read-back returns the new worktree. Failures may leave a new checkout/branch; preserve it and reconcile with list instead of retrying blindly. Worktree trust is NOT inherited: hosts need to register its canonical root explicitly using `trust_repo` under their own policy.
- `git_worktree_list(root)` returns `{root, context?, head?, branch?, detached, bare, locked, prunable, dirty?, stateToken?}[]`. `dirty` includes ignored files as well as staged/unstaged/untracked state. Missing/unreadable/blocked targets have null dirty/token, not a clean result. Missing targets stay listed and are never pruned automatically. The list covers the whole repository, not only a project subtree.
- `git_worktree_remove(root, {worktreeId, stateToken, force}, target_workspace_guard, trust)` removes only a registered linked checkout in the same repository. It blocks active/primary/foreign, locked, missing, merge/rebase/index-lock, untrusted and stale targets. Dirty removal requires explicit force; force snapshots tracked/untracked nonignored disk content into a safety commit first. Ignored data always blocks removal, even with force, because it has no safe Git recovery route. No double-force and no automatic branch deletion. Removal read-back confirms the registration disappeared. Result is `{removedRoot, safetyRef}`.
- `WorkspaceGuard {known, unsavedBuffers, pendingAiReview}` is mandatory at plan/add/remove. Unknown state, any unsaved buffer, or pending AI review blocks. For remove it MUST represent the target checkout. This is evidence provided by the authenticated native workspace host/lease service, never a CLI `--yes` or disk watcher assumption.

## Locks and split layout

`lock_repo(root)` returns an RAII OS advisory lock on `<canonical-common-dir>/somnia-write.lock`. All linked checkouts/processes share it; contention returns `blocked/repo-locked` immediately. The persistent lock file is not an active-lock marker and must not be deleted for stale recovery. OS lock release on drop/process death needs no stale takeover. Existing commit/restore/variant/merge writes also acquire it for their full multi-command operation. This conservative shared lock serializes Git mutations, while file editing/task execution can still be parallel in separate worktrees. Git's own index/ref locks arbitrate against external Git clients; the Somnia lock cannot stop unrelated tools writing files or invoking Git.

Per-checkout index and in-progress merge/rebase/cherry-pick metadata resolve through `--absolute-git-dir`; shared shallow/config/hooks/refs use the canonical common directory. Hooks are preserved, not skipped. Trust remains per canonical checkout root. Safety refs share the common object/ref store and unique IDs avoid worktree collisions.

Git supporting `worktree list --porcelain -z` uses NUL fields. Older Git has a strict line-field fallback; externally created control-character paths can be ambiguous and return a typed path failure. New such destinations are rejected before add. Quotes/spaces/Unicode paths are supported. Non-UTF-8 worktree listings fail closed.

## Integration boundary and limits

S8/host layer owns authenticated task/workspace leases, source/target guard acquisition, live buffer holds, allowed roots, generation, task ID binding and any trust registration. Core IDs do not authenticate an owner. Hosts must hold leases through operations, not check buffers once and allow unrelated editors to dirty them before remove. No IPC wrappers, permission/capability registrations, TS worktree adapter or Board UI ship here.

Safety snapshots capture disk, never editor buffers. Hash checks are not atomic file locks against external tools. No auto-prune, forced removal of ignored content, branch cleanup, remote writes, credentials, LFS/submodule lifecycle, repository relocation recovery or bare-repository lifecycle is provided. A timeout/read-back failure requires reconciliation; it is not proof that the command did nothing. Windows/macOS runtime testing remains required.

## Verification

Run `cargo test --no-default-features --locked --test git_backend --test git_variants --test git_worktrees`. Tests use real temporary repositories with multiple worktrees and system Git. They cover split identity/index/trust, dirty and force deletion recovery, ignored data, stale same-size/same-mtime content, destination/branch collisions, guard fail-closed behavior, common-lock contention, preserved missing registrations, quotes/Unicode/control paths, symlink identity and commit isolation.
