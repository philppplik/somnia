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

- Unix location: `$XDG_RUNTIME_DIR/somnia/<repo-id>-<task-id>.sock`. The directory must be mode 0700 and owned by you, the socket is 0600. Otherwise the CLI refuses to start.
- The server checks the peer's uid (`SO_PEERCRED`) and drops other users silently.
- No TCP or HTTP port.
- Windows: a named pipe `\\.\pipe\somnia-cli-<user-sid>-<repo-id>-<task-id>` replaces the socket. The user's SID is part of the name, the task id is reduced to letters, digits, `-` and `_`. The pipe is local only, protected by a DACL that grants the current user alone, and both ends check that the other end's process runs as the same user (see security.md). The frames are identical on both platforms.
- A frame is at most 64 KiB.

Request:

```json
{"protocol":1,"request_id":"r1","capability":"read","body":{"type":"status","task_id":"t-abc123"}}
```

`body.type` is `hello`, `status`, `attach` or `cancel`. `capability` must match: `cancel` needs `"cancel"`, everything else `"read"`. Unknown fields are rejected. Any object key that looks like a credential (`token`, `password`, `secret`, `authorization`, `api_key`, `credential` and similar) at any depth is rejected with `bad-request`, and the value is never echoed.

Responses are frames with a `frame` tag: `hello`, `event`, `result`, `ack`, `error`.

Events (`event` tag): `status`, `plan`, `progress`, `needs-input`, `model` (`provider`, `model`), `tool-call` (`id`, `name`, `summary`), `tool-result` (`id`, `status` `ok` or `error`, `summary`), `usage` (cumulative `tokens`, `cost` or `null` when no provider price is known), `result`. Each carries `protocol`, `task_id` and a rising `seq`. The same events are appended to `.somnia/sessions/<task-id>.events.ndjson`, so `attach` can replay a finished or dead run.

A request with another protocol number gets `version-mismatch` with `details.server` and `details.client`.

## 3. Engine sidecar, `somnia.task-engine/1`

The CLI starts the sidecar (`SOMNIA_ENGINE_CMD`, else `sidecar/engine.mjs` next to the binary or in a source checkout, run with Node 20 or newer) and talks over stdio. stderr is discarded. The full contract, configuration variables and behaviour are in [docs/agent/TASK-ENGINE-CONTRACT.md](../agent/TASK-ENGINE-CONTRACT.md); this is the summary.

CLI to engine, one JSON object per line:

```json
{"op":"start","contract":"somnia.task-engine/1","task":{"taskId":"t-1","prompt":"...","cwd":"/path","allowedRoots":["."],"bare":false,"studio":null,"maxTokens":null,"maxCost":null}}
{"op":"cancel"}
```

`cancel` is sent when the run is cancelled (`somnia cancel`, Ctrl-C in the TUI). The engine aborts its provider request and exits; the CLI waits about one second and then kills the process. A cancelled run ends as `cancelled` and nothing is committed.

When the host resumes a run after a `needs-input` question, the task also carries `"answers":[{"question":"...","answer":"..."}]` (oldest first, at most 5; the field is omitted when there are none, so the first start message is unchanged). The answers are user text. The bundled sidecar adds them to the model prompt as quoted context (clipped to 500 / 4000 characters, also with `--bare`); they never change tool rules or scope. An engine may ignore the field. See [TUI-PROTOCOL.md](TUI-PROTOCOL.md) for how an answer reaches the host.

Engine to CLI, one line per event:

```
{"event":"plan","text":"..."}
{"event":"progress","text":"..."}
{"event":"model","provider":"ollama","model":"..."}
{"event":"tool-call","id":"c1","name":"read_file","summary":"README.md"}
{"event":"tool-result","id":"c1","status":"ok","summary":"README.md 1 lines"}
{"event":"usage","tokens":250,"cost":0.01}
{"event":"needs-input","reason":"..."}                                  terminal
{"event":"done","summary":"...","tokens":1,"cost":0.02}                 terminal
{"event":"failed","message":"...","code":"auth","retryable":false}      terminal
```

- Tool summaries carry a path (and a size for writes), never arguments or file content. Any `status` other than `ok` is recorded as `error`.
- Events are written to the event log and forwarded as they arrive, so `attach` and the TUI see them live. `model` fills `producer.provider` and `producer.model` in the session record. The final `done` totals replace the streamed `usage`.
- `failed.code` maps to a stable error kind and is kept in `error.details` as `engine_code`, with `retryable`:

| Engine code | Error kind |
| --- | --- |
| `auth`, `consent` | `auth` |
| `config` | `engine-unavailable` |
| `conflict` | `stale-plan` |
| `scope` | `review-required` (exit 2) |
| `budget`, `limit`, `provider`, `timeout`, `internal` and anything else | `internal` |

- Lines that are not valid events, and event names the CLI does not know, are ignored and never forwarded.
- No credentials travel on this channel. The sidecar reads provider, model and keys from its own environment.
- A sidecar that exits without a terminal event is `engine-unavailable`, and the message includes its exit code.
- `needs-input` is part of the contract, but the current engine never sends it. Answering a question (`task.answers`) is not implemented yet.

## 4. TUI adapter, `run --tui-stdio`

Protocol v1 for `somnia-tui`. stdout carries frames only, commands arrive on stdin, every frame has `"v":1`.

Core events map to `status`, `text_delta`, `needs_input` (the client may answer it, see [TUI-PROTOCOL.md](TUI-PROTOCOL.md)), `guard_blocked` (review required) and `done`. `tool-call` and `tool-result` map to `tool_call` and `tool_result` (summaries only). `usage` maps to a `status` frame with `tokens` and `cost_usd`; an unknown cost is sent as 0 because the TUI schema has no "unknown", while `tokens` stays accurate. `model` is announced by sending `session_started` again with the model filled in. Without `--yes` the uncommitted work is offered as one `diff_proposed` per file. A `review_decision` is applied only if its `content_hash` matches both the proposal and the current worktree and every hunk is named exactly once; otherwise the answer is `guard_blocked` and the review stays pending. Rejected hunks are reverse-applied. Accepted hunks stay uncommitted.

Not available yet: answering `needs_input` from the TUI (the engine does not ask questions, and `task.answers` is not implemented).
