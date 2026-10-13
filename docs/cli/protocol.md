# Somnia CLI: protocols

Three interfaces, all versioned, all newline-delimited JSON (NDJSON). Protocol version: **1**.

## 1. Run summary and error objects (`--json`)

`somnia run --json` prints exactly one line.

Summary, schema `somnia.run/1`. Keys: `schema`, `task_id`, `branch`, `status`, `base_sha`, `result_sha`, `prompt`, `plan`, `producer`, `overrides`, `usage` (`tokens`, `cost`), `verification`, `unreviewed_checkpoint`, `error`.

`status` is one of `preparing`, `running`, `done`, `failed`, `review`, `waiting-input`, `cancelled`.

Errors, schema `somnia.error/1`: `{"schema":"somnia.error/1","error":{"kind":"...","message":"...","details":{}}}`.

Error kinds (stable): `git-missing`, `identity-missing`, `auth`, `sso`, `protection`, `stale-plan`, `dirty-worktree`, `diverged`, `uncertain-outcome`, `review-required`, `version-mismatch`, `workspace-busy`, `engine-unavailable`, `bad-request`, `not-found`, `internal`.

## 2. Local IPC for background runs

A `--detach` run serves a Unix domain socket for `attach`, `status` and `cancel`.

- Location: `$XDG_RUNTIME_DIR/somnia/<repo-id>-<task-id>.sock`. The directory must be mode 0700 and owned by you, the socket is 0600. Otherwise the CLI refuses to start.
- The server checks the peer's uid (`SO_PEERCRED`) and drops other users silently.
- No TCP or HTTP port. Windows named pipes are not implemented yet; on Windows these commands return `engine-unavailable`.
- A frame is at most 64 KiB.

Request:

```json
{"protocol":1,"request_id":"r1","capability":"read","body":{"type":"status","task_id":"t-abc123"}}
```

`body.type` is `hello`, `status`, `attach` or `cancel`. `capability` must match: `cancel` needs `"cancel"`, everything else `"read"`. Unknown fields are rejected. Any object key that looks like a credential (`token`, `password`, `secret`, `authorization`, `api_key`, `credential` and similar) at any depth is rejected with `bad-request`, and the value is never echoed.

Responses are frames with a `frame` tag: `hello`, `event`, `result`, `ack`, `error`.

Events (`event` tag): `status`, `plan`, `progress`, `needs-input`, `result`. Each carries `protocol`, `task_id` and a rising `seq`. The same events are appended to `.somnia/sessions/<task-id>.events.ndjson`, so `attach` can replay a finished or dead run.

A request with another protocol number gets `version-mismatch` with `details.server` and `details.client`.

## 3. Engine sidecar, `somnia.task-engine/1`

The CLI starts the sidecar and talks over stdio. stderr is discarded.

CLI to engine, one line:

```json
{"op":"start","contract":"somnia.task-engine/1","task":{"taskId":"t-1","prompt":"...","cwd":"/path","allowedRoots":["."],"bare":false,"studio":null,"maxTokens":null,"maxCost":null}}
```

Engine to CLI, one line per event:

```
{"event":"plan","text":"..."}
{"event":"progress","text":"..."}
{"event":"needs-input","reason":"..."}                      terminal
{"event":"done","summary":"...","tokens":1,"cost":0.02}      terminal
{"event":"failed","message":"..."}                           terminal
```

Lines that are not valid events are ignored and never forwarded. No credentials travel on this channel; the sidecar reads provider keys from its own environment. A sidecar that exits without a terminal event is `engine-unavailable`.

## 4. TUI adapter, `run --tui-stdio`

Protocol v1 for `somnia-tui`. stdout carries frames only, commands arrive on stdin, every frame has `"v":1`.

Core events map to `status`, `text_delta`, `needs_input`, `guard_blocked` (review required) and `done`. Without `--yes` the uncommitted work is offered as one `diff_proposed` per file. A `review_decision` is applied only if its `content_hash` matches both the proposal and the current worktree and every hunk is named exactly once; otherwise the answer is `guard_blocked` and the review stays pending. Rejected hunks are reverse-applied. Accepted hunks stay uncommitted.

Not mapped yet: `tool_call`, `tool_result`, model and cost frames (the engine contract carries none).
