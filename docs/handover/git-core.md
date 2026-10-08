# Git core backend (package A) — handover

Branch: `agent/git-git-core`, base `somnia-agent @ 77cd526`. Contract: `docs/git/CONTRACT.md` (+ CONTRACT-A addendum appended there).

## What was built

- `phase1/src-tauri/src/git.rs` — the whole backend, pure logic, no Tauri imports, so the CI gate `cargo test --no-default-features --locked` exercises everything.
  - Runner: argv array only (never a shell), environment cleared and rebuilt from a whitelist (PATH, HOME/USERPROFILE/HOMEDRIVE/HOMEPATH, SystemRoot, TEMP/TMP/TMPDIR, LANG) plus `LC_ALL=C` and `GIT_TERMINAL_PROMPT=0`; reads add `GIT_OPTIONAL_LOCKS=0`. `-c core.quotepath=false` on every call. 30 s timeout (60 s for log), child is killed on timeout; retained stdout capped at 16 MiB (drained beyond), stderr detail capped at 2 000 chars.
  - No `--no-verify`, no identity/signing `-c` overrides, no network commands anywhere. HOMEDRIVE/HOMEPATH were added to the contract's whitelist because git on Windows derives the home directory from them when HOME is unset.
  - `git_detect` / `git_status` / `git_diff_file` / `git_init` / `git_commit` / `git_log` / `git_restore_as_new_version` per contract, plus `git_trust_repo` (see addendum in CONTRACT.md).
  - States: `index.lock`, merge/rebase/cherry-pick sentinels, detached HEAD, unborn branch, `.git` file and `gitdir != common-dir` → `unsupported-worktree`, `invalid-repo` for other rev-parse failures. LFS (root `.gitattributes` + repo-local `filter.lfs` config) and submodules are flags; shallow/sparse reported via the addendum fields.
  - Paths: all API paths validated with the file service's `validate_path` (rejects absolute, `..`, NUL, backslash, drive letters, Windows-reserved names, trailing space/dot). Porcelain v2 `-z` everywhere; rename order in `-z` mode (`<new>\0<old>\0`) verified against git 2.34.
  - `stateToken`: SHA-256 over HEAD sha (or `unborn`), `git write-tree` of the index (or `unmerged-index`), project prefix, and per listed change the path/old-path/XY/HEAD+index blob hashes/worktree stat (size + mtime). Recomputed in commit and restore; mismatch → `state-changed`.
  - Commit: stages exactly the selected paths (`git add -A -- <paths>`), commits with `git commit -F - -- <paths>` so pre-staged files outside the selection stay staged and untouched. Message via stdin (never argv, never logged). >200 paths or >60 kB pathspec switches to `--pathspec-from-file=- --pathspec-file-nul`.
  - Restore: refuses early on `nothing-to-commit`, then safety copy from a scratch `GIT_INDEX_FILE` (read-tree → `add -A` of the project scope incl. untracked non-ignored files → write-tree → commit-tree → `refs/somnia/safety/<unix>`), then `git rm -f` for files absent in the target, `git checkout <sha> -- <scope>`, and commits exactly the touched set. Any failure after the safety copy keeps it and names the ref in `GitError.detail`.
  - Trust: `git-trusted-repos.json` in the app config dir (atomic write, 0600), keyed by repo root.
- Wiring: `desktop.rs` (8 commands, `gate()` on the trusted `main` window, single-open-project resolution, errors are `GitError` JSON strings), `build.rs` command list, `capabilities/editor.json` `allow-git-*` entries, `lib.rs` module registration, one additive accessor `Project::root_path()` in `service.rs`.
- `src/lib/git/types.ts` + `docs/git/CONTRACT.md`: CONTRACT-A addendum (git_trust_repo, shallow/sparseCheckout, stagedOutsidePrefix). Union-style appends only.
- Tests: `phase1/src-tauri/tests/git_backend.rs` (25 integration tests, real temp repos) + 6 parser unit tests in `git.rs`.

## Test results (local, Linux, git 2.34, rustc 1.99)

- `cargo test --no-default-features --locked` — **all green**: 53 lib + 24 file_service + 25 git_backend (includes CRLF/binary round-trip, Unicode/space/newline filenames, deep long paths, case handled via git rename detection, subfolder scoping, hook-failed, identity-missing, untrusted, index.lock/merge/cherry-pick/detached/unborn, linked worktree, restore incl. safety-copy contents, state-token mismatch).
- `cargo check --no-default-features --locked` — clean, zero warnings.
- **Not run locally**: `cargo check` with the desktop feature (needs libwebkit2gtk; no root in this sandbox) and the TS/npm side — CI covers both; desktop.rs changes are confined to additive command wiring.

## Known gaps / decisions for the integrator

- `cancelled`: timeouts kill the child; there is no UI-cancel channel yet (reserved code).
- Hook-failed classification is a documented heuristic (see CONTRACT-A addendum) — git has no machine marker.
- Repo roots or git dirs with a literal newline in the path break the line-based `rev-parse` parse (files inside are fine and tested). Considered acceptable.
- `ignored` kind is never emitted (no `--ignored` flag; node_modules flood). Reserved for later.
- Single-file projects (`open_file`): the Git root is the file's parent folder, so status covers that folder. If the UI wants single-file scope, that's a package B decision.
- `git_log.before` paginates by first parent; merge side branches are skipped.
- Parent instruction named the branch `agent/git-git-core`; the contract table says `agent/git-core`. Followed the parent.
