# Somnia CLI: TUI protocol v1 and answering questions

How `somnia run --tui-stdio` talks to `somnia-tui` (or any other client). Code: `phase1/cli/src/tui_adapter.rs` (core side), `phase1/crates/somnia-tui/src/protocol.rs` (client side). The protocol stays at version 1; everything below is additive.

## Transport

NDJSON on stdio. The core writes events to stdout and reads commands from stdin. Every line carries `"v":1`. Unknown event types are ignored. Other versions are rejected. Stdout carries frames only. Tokens and credentials are never fields: a command with a credential-like key (`token`, `api_key`, ...) is rejected.

## Events (core to client)

`session_started`, `text_delta`, `tool_call`, `tool_result`, `diff_proposed`, `guard_blocked`, `status`, `needs_input`, `done`. See `phase1/crates/somnia-tui/README.md` for fields.

`session_started` has an optional `capabilities` array. `["answer"]` means the core can wait for an answer after `needs_input`.

## Commands (client to core)

| Command | Fields | Meaning |
| --- | --- | --- |
| `review_decision` | `review_id`, `content_hash`, `accepted_hunks[]`, `rejected_hunks[]` | Decide a proposed diff. Verified against the proposal and the current worktree. |
| `cancel` | none | Stop the run. |
| `hello` | `capabilities[]` | Optional handshake, sent once after start. `["answer"]` says the client can answer questions. |
| `answer` | `text` | Answer the last `needs_input` question. |

## Answering a `needs_input` question

1. The engine asks (`needs-input` in the task-engine contract). The core emits `needs_input {question}`.
2. If the client sent `hello` with `"answer"`, the core waits. Otherwise it behaves as before: it emits `done {status:"needs_input"}` and exits with code 2. A client that never says hello can never hang a run.
3. The client sends `answer {text}`. The core restarts the engine for the same task, on the same branch and worktree, with the answers so far in the start message: `task.answers: [{"question","answer"}]` (oldest first, omitted when empty). Engines that ignore the field simply ask again.
4. A run pauses for at most 5 questions (`MAX_ANSWER_ROUNDS`). After that it ends as `needs_input` as before.
5. `cancel` or closing stdin while waiting ends the run as `done {status:"needs_input"}`, exit code 2. The record status is `waiting-input`.

Answer rules: non-empty after trimming, at most 8 KiB. A bad answer, a `review_decision` while no review is pending, or an unknown frame produces `guard_blocked` with the reason. The question stays open.

Answers go to the engine only. They are not written to the session event log.

## somnia-tui

- Interactive terminal: sends `hello` automatically. While a question is open, typed characters build the answer, Enter sends it, Esc clears the draft, Backspace edits, Ctrl-C cancels.
- No terminal (pipe, CI) or `--plain`: no raw mode, no ANSI. One text line per event. A proposed diff is listed and left pending, the run is cancelled, exit code 2. No hello is sent, so a question ends the run (exit 2).
- Exit codes: 0 done, 1 failed, 2 needs input or review pending.

## Tests

- `phase1/cli/tests/tui_adapter.rs`: answer resumes the engine, two questions in order, legacy client without hello, cancel and EOF while waiting, bad answers.
- `phase1/crates/somnia-tui/tests/snapshots.rs`: TestBackend goldens (including the answer prompt), key flow, command encoding.
- `phase1/crates/somnia-tui/tests/pty.rs` with `scripts/pty_e2e.py`: real pseudo-terminal, raw mode and alternate screen, typed answer, hunk approval, exit 0. Needs python3, node and git; skipped otherwise.
