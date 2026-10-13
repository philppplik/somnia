# Task-engine contract `somnia.task-engine/1`

How `somnia run` (the headless CLI core, `phase1/cli`) drives the agent engine. The Rust side is `cli/src/engine.rs` (`SidecarEngine`). The engine is `cli/sidecar/engine.ts`, bundled to `cli/sidecar/engine.mjs` with `npm run build:cli-engine` (from `phase1/`). It runs the same `AgentSession`, `AgentProjectTools` and provider classes as the desktop panel (`src/lib/agent/`), without UI.

Where the CLI finds the engine: `SOMNIA_ENGINE_CMD` (JSON array), else `<exe-dir>/sidecar/engine.mjs`, else `<cli>/sidecar/engine.mjs` for a source checkout. Node 20 or newer.

## Wire format

One JSON object per line on stdio. Non-JSON lines on the engine's stdout are ignored by the host. Unknown event names are ignored too, so the contract can grow.

Host to engine:

| Message | Meaning |
| --- | --- |
| `{"op":"start","contract":"somnia.task-engine/1","task":{taskId,prompt,cwd,allowedRoots,bare,studio,maxTokens,maxCost}}` | First line, once. |
| `{"op":"cancel"}` | Abort the provider request and exit. The host waits about one second, then kills the process. |

Engine to host:

| Event | Fields | Notes |
| --- | --- | --- |
| `progress` | `text` | Assistant text, flushed per line and before each tool call. |
| `plan` | `text` | One line about the run setup (bare or notes loaded, files in scope). |
| `model` | `provider`, `model` | Sent once at the start. Stored in the session record (`producer.provider`, `producer.model`). |
| `usage` | `tokens`, `cost` | Cumulative for the run. `cost` is `null` until a provider reports a price. Unknown is never zero. |
| `tool-call` | `id`, `name`, `summary` | `summary` is the path (and the size for `write_file`). Arguments and file content are never forwarded. |
| `tool-result` | `id`, `status` (`ok` or `error`), `summary` | Any status other than `ok` is treated as `error` by the host. |
| `needs-input` | `reason` | Terminal. The agent loop has no ask-the-user step yet, so the current engine does not send it. |
| `done` | `summary`, `tokens`, `cost`, `verification?` | Terminal. File changes are already in the working tree. |
| `failed` | `message`, `code`, `retryable` | Terminal. See the code table. |

Exactly one terminal event ends a run. A host cancel produces none: the engine exits and writes nothing.

## Mapping in the CLI

| Engine event | `somnia.run/1` event log (`.somnia/sessions/<id>.events.ndjson`) | `--tui-stdio` frame |
| --- | --- | --- |
| `progress`, `plan` | `progress`, `plan` | `text_delta` |
| `model` | `model` | `session_started` again, now with `model` |
| `tool-call`, `tool-result` | `tool-call`, `tool-result` | `tool_call`, `tool_result` |
| `usage` | `usage` | `status` with `cost_usd` (0 while unknown) and `tokens` |

Events are logged and forwarded while the engine runs, so `attach` and the TUI see them live. The final `done` totals replace the streamed ones in the record.

Failure codes map to the stable error kinds and keep the engine code in `error.details`:

| Engine `code` | Error `kind` | `details` |
| --- | --- | --- |
| `auth`, `consent` | `auth` | `{engine_code, retryable}` |
| `config` | `engine-unavailable` | same |
| `conflict` (a file changed while the agent worked) | `stale-plan` | same |
| `scope` | `review-required` | same |
| `budget`, `limit`, `provider`, `timeout`, `internal` | `internal` | same |

## Configuration (engine environment only)

Credentials never travel over the stdio channel and are never fields in any CLI protocol.

| Variable | Meaning |
| --- | --- |
| `SOMNIA_ENGINE_PROVIDER` | `openrouter`, `claude`, `openai` (API key) or `ollama`. |
| `SOMNIA_ENGINE_MODEL` | Model id. |
| `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Key for the chosen cloud provider. Checked before any request. |
| `SOMNIA_ENGINE_CLOUD_CONSENT=1` | Required for any cloud provider and for a non-loopback Ollama URL. Same consent gate as the panel; without it the run fails with `consent` before anything is sent. |
| `SOMNIA_ENGINE_OLLAMA_URL` | Default `http://127.0.0.1:11434`. |
| `SOMNIA_ENGINE_TIMEOUT_MS` | Optional turn timeout (default 180000). |

OpenAI account sign-in (OAuth tokens in the OS keyring) is desktop only. The headless engine uses API keys.

## Behavior

- **Tools.** `list_files`, `read_file`, `write_file` from `AgentProjectTools`. The engine reads text files below `allowedRoots` into memory (no symlinks, no `.git`, `.somnia`, `node_modules`, `.env`, keys; at most 2000 files of 256 KB). `write_file` only stages a proposal.
- **Applying changes.** After the turn ends cleanly the engine writes the staged files to the working tree. Every path is checked again against `allowedRoots` and the project root (symlinks refused), and each file must still match what the agent read, otherwise nothing is written (`scope` or `conflict`). The CLI then treats the changes as uncommitted work (review) or commits them locally with `--yes`.
- **`--bare`.** Bare runs send only the task prompt. Without `--bare` the first user message also carries `AGENTS.md` from the project root (clipped to 8 KB, marked as context that never overrides tool rules) and the studio name. The `plan` event says which one happened.
- **Budgets.** `maxTokens` and `maxCost` abort the run as soon as a `usage` event passes them (`budget`, nothing written). A cost budget needs a provider that reports prices.
- **Errors.** Provider and session errors keep the fixed, secret-free texts from `src/lib/agent/errors.ts`. Anything else is redacted with the app log redactor and clipped.
- **Abort.** Cancel, budget and timeout abort the provider stream through the session's `AbortController`. No file is written after an abort.

## Tests

- `npm run test:cli-engine` (from `phase1/`): the real bundled engine against a scripted loopback Ollama. Covers tool mapping, usage, bare, scope, blocked paths, malformed streams, config errors, budget, cancel and the workspace guard.
- `cargo test` in `phase1/cli`: fake-engine tests for the mapping and error codes, plus real-sidecar tests (skipped with a message when `sidecar/engine.mjs` is not built).

Not covered: a live run against a real cloud provider, and Windows (the CLI has no named-pipe transport yet).
