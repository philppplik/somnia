# Somnia CLI: usage

`somnia` runs an agent task against a project from a terminal or a script. It works on a local task branch, can make one local commit, and never touches the network.

Source: `phase1/cli`. Build with `cargo build` there (needs `git` and `node` on PATH).

## Commands

```
somnia run "<task>" [options]     run a task
somnia attach <task-id>           follow a background run's events
somnia status <task-id>           print a run's current summary
somnia cancel <task-id>           ask a background run to stop
```

### `run` options

| Option | Meaning |
| --- | --- |
| `--json` | One run summary object on stdout, no ANSI, no banner. Schema `somnia.run/1`. |
| `--print` | Human-readable output (the default). |
| `--yes` | Allow the agent's work to be committed locally on the task branch. Never pushes. |
| `--detach` | Start in the background, print the task id, return at once. |
| `--branch NAME` | Task branch. Default `somnia/task/<task-id>`. Must be a valid, unused branch name. |
| `--request-id ID` | Idempotency key. A repeat with the same id reports the existing run and starts nothing. |
| `--allow-root DIR` | Limit the agent to a project-relative directory (repeatable). Default: the whole project. |
| `--studio S` | Studio hint passed to the engine. |
| `--bare` | Ask the engine to skip auto-discovery of hooks, MCP and instruction files. Forwarded to the engine only. |
| `--attribution` | Add `Co-authored-by` and `X-Somnia-Session` trailers. Opt-in. Needs `SOMNIA_ATTRIBUTION_EMAIL`. |
| `--max-tokens N`, `--max-cost F` | Budgets forwarded to the engine. |
| `--path DIR` | Project directory. Default: the current directory. |
| `--tui-stdio` | Speak the TUI protocol on stdin/stdout. Excludes `--json`, `--detach`, `--print`. |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Done. The task finished (with `--yes`, the work is committed locally; a no-op also counts as done). |
| 1 | Failed. Engine failure, cancelled run, typed error (not a repo, busy workspace, bad branch name, missing identity) or a usage error. |
| 2 | Needs you. The engine asked a question, the work is waiting for review (no `--yes`), or a guard blocked the commit (`review-required`). |

Usage errors exit 1, not 2, so a script can tell "wrong flags" from "a human has to look".

## What a run does

1. Checks the project: a git repo with at least one commit, a clean working tree, no unsaved desktop buffers or AI holds under the allowed roots, no other run holding the workspace.
2. Creates the task branch and a safety ref `refs/somnia/safety/<task-id>` at the starting commit.
3. Starts the engine sidecar and streams its events.
4. On success without `--yes`, leaves the work uncommitted on the task branch and exits 2.
5. On success with `--yes`, commits files under the allowed roots as one commit marked as an unreviewed checkpoint. If the engine changed anything outside the allowed roots, nothing is committed and the exit code is 2.

Session records live in `.somnia/` inside the project and are excluded through `.git/info/exclude`, so they never show up in `git status`.

## Examples

```
somnia run "add a pricing section to index.html" --yes --json
somnia run "tidy the stylesheet" --allow-root site/css --request-id nightly-42
id=$(somnia run "rework the footer" --detach --json | jq -r .task_id)
somnia attach "$id"
```

## Environment

| Variable | Use |
| --- | --- |
| `SOMNIA_ENGINE_CMD` | JSON array that starts the engine sidecar, for example `["node","/path/engine.mjs"]`. Default: `sidecar/engine.mjs` next to the binary. |
| `SOMNIA_ATTRIBUTION_EMAIL`, `SOMNIA_ATTRIBUTION_NAME` | Identity for `--attribution` trailers. |
| `XDG_RUNTIME_DIR` | Where the private socket directory is created. Fallback: `/tmp/somnia-<uid>`. |

Provider keys are read by the engine sidecar from its own environment. The CLI never puts them in a protocol frame, record or commit.
