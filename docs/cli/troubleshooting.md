# Somnia CLI: troubleshooting

With `--json`, the `error.kind` field tells you which row applies.

| Symptom | Kind | What to do |
| --- | --- | --- |
| `git executable not found on PATH` | `git-missing` | Install git and make sure it is on PATH. |
| `git user.name is not configured` | `identity-missing` | Set `git config user.name` and `user.email` in the project. Somnia never writes your git identity. Only `--yes` needs it. |
| `working tree has uncommitted changes` | `dirty-worktree` | Commit or stash first. `details.paths` lists the files. Runs always start from a clean tree. |
| `another Somnia run owns this workspace` | `workspace-busy` | Wait for the other run, or cancel it with `somnia cancel <id>`. A crashed run releases the lock itself. |
| `desktop state file is unreadable` or unsaved buffers listed | `review-required` (exit 2) | The desktop app has unsaved edits or AI holds under the allowed roots. Save or discard them in the app. A damaged `.somnia/gui-state.json` blocks the run on purpose. |
| `engine changed files outside the allowed roots; nothing was committed` | `review-required` (exit 2) | Review the changes with `git status` on the task branch, then commit what you want yourself or widen `--allow-root`. |
| `agent engine sidecar not found` | `engine-unavailable` | Set `SOMNIA_ENGINE_CMD` or install `sidecar/engine.mjs` next to the binary. |
| `engine sidecar exited without a terminal event` | `engine-unavailable` | The engine crashed. Run it by hand with the same input to see its stderr (the CLI discards it). |
| `invalid branch name` / `branch ... already exists` | `bad-request` | Pick another `--branch`. Use `--branch=name` if the name starts with a dash. |
| `attribution requested but SOMNIA_ATTRIBUTION_EMAIL ... is not set` | `bad-request` | Set the variable, or drop `--attribution`. |
| `runtime dir is not private to this user` | `internal` | `chmod 700` the `somnia` directory under `$XDG_RUNTIME_DIR` (or `/tmp/somnia-<uid>`), make sure you own it and that it is not a symlink. |
| `cannot connect to run socket` | `not-found` | The run is finished or gone. Use `somnia status <id>`, which reads the session record. |
| `run process is gone without a final result` / `background run did not report ready` | `uncertain-outcome` | Check `somnia status <id>` and `.somnia/sessions/<id>.json`. Do not assume it failed or succeeded. |
| `credential-like field rejected` | `bad-request` | A client sent a field such as `token`. Remove it; credentials are never protocol fields. |
| `server speaks protocol 1, client sent N` | `version-mismatch` | Update the older side. |
| Exit code 2 and no message you expected | | 2 means "needs you": read `status` (`waiting-input` or `review`). |

## Recover work

- The task branch is `somnia/task/<id>` unless you chose a name. Your starting commit is also kept at `refs/somnia/safety/<id>`.
- Uncommitted work from a run without `--yes` is still in the working tree of that branch. `git switch main` refuses if it would overwrite it; commit or stash first.
- Records: `.somnia/sessions/<id>.json` and `<id>.events.ndjson`. They are local and private. Delete them any time.

## Stale background runs

A `--detach` run keeps `.somnia/run/<id>.json` while alive. If the process was killed, `attach` replays the event log and then reports `uncertain-outcome`. Remove the stale file under `.somnia/run/` and the leftover socket in the runtime directory if you want a clean slate.

## Windows

`--detach`, `attach`, `status` and `cancel` work on Windows through a per-user named pipe.

| Symptom | Kind | What to do |
| --- | --- | --- |
| `cannot create named pipe (the name may be squatted by another process; failing closed)` | `internal` | Another process already owns the pipe name. Somnia refuses to use it. Close that process, or run `somnia status <id>` to read the record instead. |
| `run pipe is owned by a different user; refusing to connect` | `auth` | The pipe belongs to another Windows account. Run `somnia` as the account that started the run. |
| `cannot connect to run socket` | `not-found` | The run ended (the pipe disappears with the process). Use `somnia status <id>`. |
| Background run vanishes when you close the terminal | | It should not: it starts as a detached process without a console. If it does, check `somnia status <id>` and your antivirus log. |

The Windows installer binary is unsigned, so SmartScreen may warn on first run.
