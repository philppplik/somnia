# Somnia CLI: security review

Scope: `phase1/cli` as of this change. Each claim below has a test, named in brackets, in `phase1/cli/tests/e2e_mock.rs` (E), `headless.rs` (H), `transport_windows.rs` (W) or the crate unit tests (U).

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

## Local socket (Unix)

- Directory 0700 owned by the user and not a symlink, socket 0600; a looser directory makes `--detach` fail immediately with a typed error. [E `live_socket_is_0600...`, `runtime_dir_with_loose_permissions_is_refused`, H `detached_run_can_be_cancelled_and_socket_is_private`]
- The peer uid is checked on accept. A second user on the machine cannot talk to a run even if directory permissions were wrong. (Not testable in CI as a single user; reviewed in `transport.rs`.)
- `read` capability cannot cancel; unknown fields, oversized frames (64 KiB), garbage and other protocol versions get typed errors, not crashes. [E `live_socket_is_0600...`, `oversized_and_garbage_frames...`, U `unknown_fields_and_capability_mismatch_rejected`]
- No TCP or HTTP listener exists.

## Local pipe (Windows)

Same goals as the Unix socket, built from the Windows equivalents. Code: `transport.rs`, module `windows`. Tests: `tests/transport_windows.rs` and the Windows variant of the cancel test in `headless.rs`; they run on `windows-latest` in CI.

- Name: `\\.\pipe\somnia-cli-<user-sid>-<repo-id>-<task-id>`. The SID scopes the name per user; task ids are sanitized to `[A-Za-z0-9_-]`. [W `pipe_names_are_user_scoped_sanitized_and_local`]
- DACL: every pipe instance gets the protected descriptor `D:P(A;;GA;;;<current-user-sid>)`: generic-all for the current user, nothing inherited, nobody else. [W `sddl_grants_only_the_current_user`]
- Squatting: the first instance is created with `FILE_FLAG_FIRST_PIPE_INSTANCE`. If the name already exists, bind fails with a typed error instead of serving on a stranger's pipe. [W `second_bind_on_the_same_name_fails_closed`]
- Remote clients: `PIPE_REJECT_REMOTE_CLIENTS` is set, so SMB clients cannot reach the pipe.
- Peer check on the server: the client process id is read from the pipe, its process token is opened and its user SID must equal ours. Anything else, including a failed lookup, is dropped silently (fail closed). This is the counterpart of the Unix `SO_PEERCRED` check.
- Peer check on the client: the server's process id and token are checked the same way before any frame is sent, so a client never talks to an impostor. `ACCESS_DENIED` on open is reported as `auth` ("run pipe is owned by a different user") and is not retried.
- No impersonation: the client opens the pipe with `SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION`, so the server can identify the client but never act as it.
- Reads have real timeouts (overlapped IO; a timed-out read is cancelled and retired before its buffer is released), so a silent peer cannot hang a run. [W `read_timeout_fires_and_the_pipe_stays_usable`]
- Detached runs start with `DETACHED_PROCESS | CREATE_NO_WINDOW`, so they outlive the terminal and show no console window.
- Frame rules (64 KiB cap, credential-key rejection, capability matching, version check) are the same code as on Unix and are covered by the cross-platform tests above.

Not covered: the pipe syscalls need a real Windows host. They run in CI on `windows-latest` but have had no manual test on a desktop session. Processes of the same user are outside the threat model, as on Unix.

## Credentials

- Requests containing a credential-like key at any depth are rejected, and the rejection does not echo the value. [U `credential_fields_are_rejected_at_any_depth`, E `live_socket_is_0600...`]
- With provider keys and `GITHUB_TOKEN` set in the environment, none of the values appear in stdout, stderr, session records, event logs, commit messages, diffs or git argv. [E `credentials_in_the_environment_never_reach...`, `engine_events_never_carry_the_environment`]
- The engine sidecar is started with the CLI's environment (it needs its provider keys), and its stderr is discarded. Whatever text an engine puts in a `failed` message or `summary` is stored in the record and commit message. An engine must not print secrets there. The CLI does not filter that text.
- The git identity is never written by the CLI.

## Findings fixed in this change

1. Usage errors (unknown flag, bad subcommand) exited with 2 through clap's default, the same code as "needs input / review required". They now exit 1. [E `usage_errors_exit_1_never_2...`]
2. `--detach` with a non-private runtime directory waited about five seconds and ended in `uncertain-outcome`. It now fails at once with the real reason. [E `runtime_dir_with_loose_permissions_is_refused`]

## Open items

- Windows pipe: no manual test on a real desktop session yet (CI only). The peer check compares process-token user SIDs, so a process running as the same user under another logon session is accepted, matching the Unix same-uid rule.
- Engine output is stored verbatim (see Credentials).
- `.somnia/gui-state.json` is trusted input written by the desktop app; a damaged file fails closed, but a file forged by another process of the same user is not detected. Same-user processes are outside the threat model.
