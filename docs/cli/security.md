# Somnia CLI: security review

Scope: `phase1/cli` as of this change. Each claim below has a test, named in brackets, in `phase1/cli/tests/e2e_mock.rs` (E) or `headless.rs` (H) or the crate unit tests (U).

## Git is local-only

- Every git call goes through one allowlist: `rev-parse status switch update-ref add commit config diff check-ref-format show-ref symbolic-ref reset apply`. `fetch`, `pull`, `push`, `clone`, `remote` and anything else return an error before a process starts. [U `git_layer_refuses_network_subcommands`]
- A spy `git` on PATH records every call over runs that finish, fail, ask a question or commit. None is a network subcommand, and a repo with an unreachable `origin` gains no remote-tracking refs or tags. [E `yes_is_one_local_commit...`, `every_run_shape_stays_off_the_network`, `yes_does_not_move...`]
- `--yes` makes one commit on the task branch. `main` does not move. Files outside the allowed roots are never committed. [E `yes_is_one_local_commit...`, `exit_2_when_engine_touches_outside...`]
- Child git processes run with `GIT_TERMINAL_PROMPT=0`, so a credential prompt can never block or leak.

Residual risk, not removed by the allowlist: git runs repository-controlled code the same way it does for you. `git commit` runs the project's `pre-commit` and `commit-msg` hooks, and git config such as `core.fsmonitor` or a `diff.external` tool is executed by `status` and `diff`. A hook that pushes would push. Use `--bare` with trusted projects only, and treat an untrusted checkout like untrusted code. The CLI does not pass `--no-verify`, so your hooks keep working.

## Paths and names

- Branch names are checked with `git check-ref-format --branch` before use and must not exist yet. Names with `..`, spaces or a leading dash are rejected. [E `hostile_branch_names...`]
- Task ids accept letters, digits, `-` and `_` only (max 64), so `status ../../x` cannot read or write outside `.somnia/`. [E `path_traversal_in_task_id_is_rejected`]
- `--allow-root` values that point outside the repository (`..`, `/etc`) do not result in a commit. [E `allow_root_cannot_escape_the_repo`]
- Session records are written under `.somnia/`, excluded through `.git/info/exclude` (local, not a tracked file). [E `private_store_modes`]

## Local socket

- Directory 0700 owned by the user and not a symlink, socket 0600; a looser directory makes `--detach` fail immediately with a typed error. [E `live_socket_is_0600...`, `runtime_dir_with_loose_permissions_is_refused`, H `detached_run_can_be_cancelled_and_socket_is_private`]
- The peer uid is checked on accept. A second user on the machine cannot talk to a run even if directory permissions were wrong. (Not testable in CI as a single user; reviewed in `transport.rs`.)
- `read` capability cannot cancel; unknown fields, oversized frames (64 KiB), garbage and other protocol versions get typed errors, not crashes. [E `live_socket_is_0600...`, `oversized_and_garbage_frames...`, U `unknown_fields_and_capability_mismatch_rejected`]
- No TCP or HTTP listener exists.

## Credentials

- Requests containing a credential-like key at any depth are rejected, and the rejection does not echo the value. [U `credential_fields_are_rejected_at_any_depth`, E `live_socket_is_0600...`]
- With provider keys and `GITHUB_TOKEN` set in the environment, none of the values appear in stdout, stderr, session records, event logs, commit messages, diffs or git argv. [E `credentials_in_the_environment_never_reach...`, `engine_events_never_carry_the_environment`]
- The engine sidecar is started with the CLI's environment (it needs its provider keys), and its stderr is discarded. Whatever text an engine puts in a `failed` message or `summary` is stored in the record and commit message. An engine must not print secrets there. The CLI does not filter that text.
- The git identity is never written by the CLI.

## Findings fixed in this change

1. Usage errors (unknown flag, bad subcommand) exited with 2 through clap's default, the same code as "needs input / review required". They now exit 1. [E `usage_errors_exit_1_never_2...`]
2. `--detach` with a non-private runtime directory waited about five seconds and ended in `uncertain-outcome`. It now fails at once with the real reason. [E `runtime_dir_with_loose_permissions_is_refused`]

## Open items

- Windows named pipe: not built, so no ACL review is possible yet. It needs a per-user DACL and a peer-SID check equivalent to the uid check above.
- Engine output is stored verbatim (see Credentials).
- `.somnia/gui-state.json` is trusted input written by the desktop app; a damaged file fails closed, but a file forged by another process of the same user is not detected. Same-user processes are outside the threat model.
