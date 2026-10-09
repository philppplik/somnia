# OpenRouter provider (Somnia Agent)

Cloud models through OpenRouter's Chat Completions API. Code: `phase1/src/lib/agent/openRouter.ts`. Tests: `providers/cloudProviders.test.ts` and `providerAuth.test.ts` (mocked `fetch`, no network; run via `npm run test:core`). For setup and troubleshooting see [Using OpenRouter and Ollama](using-openrouter-and-ollama.md). The local counterpart is [ollama-provider.md](ollama-provider.md).

## Contract

`OpenRouterProvider` implements the shared `AgentProvider` contract from `phase1/src/lib/agent/types.ts` with `id = 'openrouter'` and `locality = 'cloud'` (fixed, never inferred). The endpoint is a constant: `https://openrouter.ai/api/v1/chat/completions`. There is no user-configurable base URL.

Constructor options (`OpenRouterOptions`):

| Option | Meaning |
|---|---|
| `getApiKey` | Resolves the key at request time. It is never stored on the session. |
| `consentGuard` | Optional extra disclosure guard, called before the key is read. |
| `privacyGate` | Test/host injection of the shared consent gate. Default is the shared `agentPrivacy` gate. |
| `fetch` | Transport. In the desktop app this is `nativeProviderFetch('openrouter')`; in a browser it is the global `fetch`. |
| `requireZdr` | Default `true`. Only `false` turns off the ZDR restriction. The panel never passes it, so the panel always runs with ZDR. |
| `maxRetries`, `sleep` | Retry policy, see below. Default 3 retries. |

## Request

`streamAuthorized` sends one JSON body per model round:

- `model`, `stream: true`, `max_tokens` (from `maxOutputTokens`; the provider throws if the model is empty or the limit is not a positive integer).
- `provider: { zdr: true, allow_fallbacks: false, require_parameters: true }`. `zdr` limits routing to zero-data-retention endpoints. `allow_fallbacks: false` stops OpenRouter from switching to another provider. `require_parameters: true` rejects endpoints that cannot honour every parameter in the request, tools included. Effect: a model that has no ZDR endpoint, or none with tool support, fails instead of silently running somewhere weaker. See "Errors".
- `messages`: role and content, plus `tool_call_id` for tool results and `tool_calls` (`type: function`, arguments as a JSON string) for assistant turns.
- `tools`: each `AgentToolDefinition` as `{ type: 'function', function: <definition> }`, omitted when there are no tools (the session sends none on its final step).

Headers: `Authorization: Bearer <key>`, `Content-Type: application/json`. `redirect: 'error'`. A key that is empty or contains CR/LF is rejected with an `auth` error before any request.

## Streaming

The response must be `text/event-stream`. `dataEvents` is an incremental SSE parser: CRLF, comment lines, multi-line `data:` fields, UTF-8 split across chunks, a final event without a trailing blank line. One event is capped at 1 MiB (`limit` / `context` error).

| Stream content | Emitted event |
|---|---|
| `data: [DONE]` | ends the stream normally |
| `usage` | `usage` with `inputTokens`, `outputTokens`, `costUsd` (from `usage.cost`); values that are not finite and non-negative are left absent |
| `choices[0].delta.content` | `text` |
| `choices[0].delta.tool_calls[]` | `tool-call` fragments with `index`, `id`, `name`, `arguments`; the session assembles them. If a gateway omits `index`, calls are keyed by `id`, else they continue the last call. |
| `finish_reason` | `finish` with that string as `reason` |
| `chunk.error` | classified error (below) |

Only `choices` with index 0 are read. If the stream ends without `[DONE]` the provider throws a retryable `protocol` error ("ended without completion"); invalid JSON in an event is a `protocol` error too. Some upstream failures arrive as HTTP 200 with a JSON body: the provider reads it as an error body instead of treating it as a stream.

## Consent gate and backpressure

`stream()` wraps the whole request in `runWithProviderConsent` (`privacy.ts`). The gate checks consent before the request and again when output is accepted, and withdrawing consent aborts the active request. To keep the gate open until the last SSE byte is consumed, events pass through a single-slot bridge: the producer inside the gate pushes one event and waits for the consumer to take it. Returning a `Response` out of the gate instead would lose revocation during the stream. Aborting the caller's signal aborts the gate operation and the producer.

## Retries and errors

Retries use `fetchProviderResponse` (`retry.ts`), shared with Ollama. See [provider-errors.md](provider-errors.md) for the full policy. In short: 408, 429, 5xx and initial network failures are retried before streaming starts, up to 3 times with exponential backoff; `Retry-After` is honoured, and a wait over 60 s stops the retries. A started stream is never replayed.

`classifyHttp` (`errors.ts`) maps status codes to the agent error taxonomy; the body is read only up to 4 KB and reduced to three coarse hints (`tools`, `routing`, `quota`):

| Status / hint | `AgentError` detail |
|---|---|
| quota hint with 402, 403 or 429 | `quota` (not retried) |
| 401, 403 | `auth` |
| 402 | `credit` |
| 408 | `timeout` (retryable) |
| 429 | `rate-limited` (retryable) |
| 5xx | `server` (retryable) |
| tools hint | `tool-unsupported` / `no-tool-support` |
| 404, or routing hint (`no endpoints found`, `zdr`, `data policy`, `privacy`) | `model-not-found` |
| 413 | `limit` / `context` |
| anything else | `protocol` |

With the default routing flags, "no ZDR endpoint for this model" surfaces as `model-not-found`, and the panel text says the provider has no available endpoint for the model under the current privacy settings.

## Credentials and transport (desktop app)

- The key is saved through the native commands `agent_key_save`, `agent_key_status`, `agent_key_delete` into the OS credential store (service `de.philipp-paulik.somnia.agent`, entry `openrouter`). The renderer only learns whether a key exists. `loadProviderKey` returns the placeholder `somnia-native-key` (`NATIVE_KEY_MARKER`) instead of the key.
- `nativeProviderFetch` sends requests through `provider_http_start` / `provider_http_next` / `provider_http_cancel`. The Rust side checks the URL against a fixed allow-list (`provider_transport.rs`: `POST .../api/v1/chat/completions`; `GET .../api/v1/key` and `GET .../api/v1/models`), reads the key from the credential store, and adds the Bearer header itself. The placeholder is ignored.
- Native transport limits: no proxy, no redirects, 15 s connect timeout, 120 s total timeout, request body up to 2 MB, response chunks up to 1 MB, at most 4 concurrent provider requests.
- In a browser preview (no Tauri) the key lives in process memory only and is gone on reload.
- Preferences (`provider`, `model`, custom prompts) are stored separately and never contain a key. Saving settings does not touch stored keys.

## Authentication test and model list

- Test: `testProviderAuthentication('openrouter', key)` does `GET https://openrouter.ai/api/v1/key` through the consent gate, 12 s timeout, no retries. It only checks that the response is a JSON object with a `data` object. It does not read key labels or balances, and it does not prove model access or credit. A new key is sent as a one-off candidate and saved only after the test passes.
- Model list: `listProviderModels('openrouter')` does `GET .../api/v1/models` through the gate with the saved key. It accepts at most 10,000 entries and drops entries whose `id` is not a string under 256 characters. The list feeds the model field's suggestions only; the model ID can always be typed by hand.

## Not verified

No run against the real OpenRouter API from the packaged app is recorded in the repository: the tests use mocked `fetch`. Streaming shapes follow OpenRouter's documented Chat Completions format. Whether any given model has a ZDR endpoint with tool support is not known to Somnia and can change on OpenRouter's side.
