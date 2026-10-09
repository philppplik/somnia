# Ollama provider (Somnia Agent)

Local models through the Ollama daemon. Code: `phase1/src/lib/agent/providers/ollama.ts`. Tests: `ollama.test.ts` (mocked `fetch`, no daemon needed; run via `npm run test:core`). Setup and troubleshooting: [Using OpenRouter and Ollama](using-openrouter-and-ollama.md). The cloud counterpart is [openrouter-provider.md](openrouter-provider.md).

## Contract

`OllamaProvider` implements the shared `AgentProvider` contract from `phase1/src/lib/agent/types.ts` with `id = 'ollama'`. `locality` is derived from the validated endpoint: `'local'` only for an `http:` URL on a loopback host (`localhost`, `127.0.0.0/8`, `::1`); anything else (LAN IP, https, hostnames that merely start with `localhost`/`127.`, `0.0.0.0`) is `'cloud'` and must go through `runWithProviderConsent`, where the privacy gate does the host check.

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
| Context window | Optional `numCtx` constructor option, sent as `options.num_ctx` (positive integer). Unset means the daemon default. Ollama may clamp it to what the model or memory allows, so a larger value is a request, not a guarantee; do not advertise context sizes in the UI. |
| Extras (not in contract) | `listModels()` (`GET /api/tags`, sorted, with size/details) and `health()` (`GET /api/version`, never throws). `listModels()` feeds the model suggestions in Settings > AI > Providers (`modelCatalog.ts`); `health()` is not used by the panel. The panel's connection test (`testProviderAuthentication('ollama')`) calls `GET /api/tags` itself. 5 s timeout on these calls. |

## Local verification (`verifyLocalModel`)

`panelBridge.guardedOllama` calls `await provider.verifyLocalModel(model)` before every request and sets `processing:'local'` only on `{ local: true }`; any other result is treated as cloud and needs consent. Cloud-flavoured Ollama models (for example `...-cloud` tags) and a loopback daemon that forwards to a hosted model both look "local" by URL, so the URL check alone is not enough.

It calls `POST /api/show` and passes only if all of these hold, otherwise it returns `{ local: false, reason, message }` (it never throws, errors fail closed):

1. The endpoint is http loopback (`locality === 'local'`); no request is sent otherwise.
2. The model name is not a `-cloud` / `:cloud` tag.
3. The response has no `remote_host` / `remote_model` (the fields Ollama sets for models it forwards to another host; present in `/api/show`, `/api/tags` and chat chunks in Ollama's `api/types.go`).
4. `model_info` is a non-empty object, as positive evidence of local weights. Cloud models can omit `model_info` (ollama-python issue 607), so a missing one is treated as not local.

Reasons: `endpoint-not-loopback`, `cloud-name`, `remote-model`, `no-local-weights`, `model-not-found`, `unreachable`, `invalid-response`.

Defense in depth: while streaming, a provider with `locality:'local'` throws `ProviderError('not-local')` if any chunk carries `remote_host` / `remote_model`, so a model that turns out to be remote is cut off mid-turn; Core should discard that turn.

Limits: this trusts what the daemon says. A custom local proxy that fakes `/api/show` and strips the remote fields cannot be detected from the adapter. Re-verify per session and after the user changes model or endpoint; do not cache across them. These fields come from Ollama's source and docs; not tested against a live daemon.

## Assumptions (confirmed by agent/core unless noted)

Confirmed by Core: errors throw typed `ProviderError`; `finish: 'aborted'` is treated as cancelled; `stop`/`tool_calls` give reviewable turns, `length`/`aborted` discard partial proposals.

1. **Errors throw.** The contract has no error event, so `stream` throws `ProviderError` (`errors.ts`) with code `unreachable | model-not-found | http | protocol | timeout`. If Core wants an error event, change in one place.
2. **Abort is a normal finish** with reason `'aborted'`, not an exception.
3. **Finish reason strings** are `stop`, `length`, `tool_calls`, `aborted` (finish reason is an open string in the contract).
4. **Locality** is derived from the endpoint (see Contract). Confirmed by Core.
5. **Model support for tools varies.** Models without tool support return an HTTP 400 from Ollama; this surfaces as `ProviderError('http')` with Ollama's message.
6. **Only `num_ctx` is configurable** (see table). No `keep_alive` or sampling options. Without `numCtx`, Ollama's small default context can silently truncate long project contexts.

## Wiring in the app

- `panelBridge.createProvider('ollama')` returns `guardedOllama(new OllamaProvider())`: always the default endpoint `http://127.0.0.1:11434`, no `numCtx`. Neither the endpoint nor the context size is configurable in the UI; a different endpoint exists only as a constructor option in code.
- Requests use the webview's own `fetch`, not the native Rust transport that OpenRouter uses. No credentials are involved (`loadProviderKey('ollama')` returns an empty string, and the keyring commands reject `ollama`).
- `guardedOllama` calls `verifyLocalModel` before each request and throws "Native studio mode requires a verified local Ollama model" unless it returns `{ local: true }`. A non-local result is refused, not sent through the consent flow. It then streams inside `agentPrivacy.run` with `processing: 'local'`, which `isLocalOllama` accepts only for an `http:` loopback endpoint without credentials, so no cloud consent is needed.
- The panel's per-run disclosure checkbox and the `agentPrivacy.assert` call apply to every provider except Ollama.
- The webview CSP (`tauri.conf.json`, `csp` and `devCsp`) allows `http://127.0.0.1:11434` and `http://localhost:11434` in `connect-src`.
- Error mapping (`errors.ts`, `toAgentError`): `unreachable` becomes `network`, `model-not-found` stays, `timeout` stays, `not-local` becomes `consent`, `http` and `protocol` become `server` and `protocol`. HTTP failures before the stream go through the shared retry policy ([provider-errors.md](provider-errors.md)); a 400 whose body says the model has no tool support becomes `no-tool-support`.

## Not verified

Not run against a live Ollama daemon (none available in the build environment). Wire format follows Ollama's documented `/api/chat`, `/api/tags`, `/api/show`, `/api/version`. Whether Ollama accepts requests from the packaged webview's origin is not tested on a real run; the CSP side is allowed in the config, the daemon's origin check is a separate matter.
