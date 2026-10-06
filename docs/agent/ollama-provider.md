# Ollama provider (Somnia Agent)

Local models through the Ollama daemon. Code: `phase1/src/lib/agent/providers/ollama.ts`. Tests: `ollama.test.ts` (mocked `fetch`, no daemon needed; run via `npm run test:core`).

## Contract

`phase1/src/lib/agent/provider.ts` is a verbatim copy of the Core agent's provider contract (`AgentProvider { id, locality, stream(request) }`). When `agent/core` merges, delete this copy and import theirs. `OllamaProvider` implements it with `id = 'ollama'` and `locality = 'local'`.

## Behaviour

| Topic | Implementation |
|---|---|
| Endpoint | Default `http://127.0.0.1:11434`. `normalizeBaseUrl` accepts bare hosts, strips trailing slashes, rejects non-http(s). |
| Chat | `POST /api/chat`, `stream: true`, NDJSON lines parsed across arbitrary chunk boundaries. `maxOutputTokens` maps to `options.num_predict`. |
| Text | Each non-empty `message.content` becomes `{type:'text'}`. |
| Tools | `AgentToolDefinition` maps to Ollama `tools` (`type: function`). Ollama sends each call complete, so each becomes one `tool-call` event with a running `index`, a synthesized id (`ollama-call-N`) if none given, and `arguments` as a JSON string. |
| Tool history | Assistant `toolCalls` are sent with parsed argument objects; `tool` messages get `tool_name` resolved from the matching `toolCallId`. |
| Usage | `usage` event with `prompt_eval_count` / `eval_count`. `costUsd` is left absent (contract: absent = unknown). |
| Finish | `tool_calls` if any call was emitted, `length` on `done_reason: length`, else `stop`. |
| Abort | Aborted signal ends the stream with `{type:'finish', reason:'aborted'}`, no throw. |
| Extras (not in contract) | `listModels()` (`GET /api/tags`, sorted, with size/details) and `health()` (`GET /api/version`, never throws). For the settings/model picker UI. 5 s timeout on those. |

## Assumptions to confirm with agent/core

1. **Errors throw.** The contract has no error event, so `stream` throws `ProviderError` (`errors.ts`) with code `unreachable | model-not-found | http | protocol | timeout`. If Core wants an error event, change in one place.
2. **Abort is a normal finish** with reason `'aborted'`, not an exception.
3. **Finish reason strings** are `stop`, `length`, `tool_calls`, `aborted` (finish reason is an open string in the contract).
4. **No cloud consent guard.** `AgentCloudConsentGuard` applies to cloud providers only. Requests go to the configured daemon URL; if a user points it at a non-loopback host, the Core privacy layer should treat that as remote. `locality` is fixed `'local'` here, so Core may want to derive it from the host.
5. **Model support for tools varies.** Models without tool support return an HTTP 400 from Ollama; this surfaces as `ProviderError('http')` with Ollama's message.
6. **No `keep_alive`, sampling or context-size (`num_ctx`) options** are set; Ollama defaults apply. Ollama's default context is small, so long project contexts may be truncated by the daemon silently. Worth a setting later.

## Not verified

Not run against a live Ollama daemon (none available in the build environment). Wire format follows Ollama's documented `/api/chat`, `/api/tags`, `/api/version`; check against a real daemon in the evening test.
