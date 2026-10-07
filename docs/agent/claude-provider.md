# Direct Claude API provider

Implemented adapter on `feature/provider-claude`, based on `somnia-agent` at v11.1.1-beta.1. This is not an assertion of released UI integration or tested native networking. No paid inference was used for verification.

## Contract

`phase1/src/lib/agent/providers/claude.ts` exports:

- `ClaudeProvider`: `AgentProvider`, `id = 'claude'`, `locality = 'cloud'`.
- `ClaudeOptions`: `getApiKey`, optional `fetch`, `privacyGate`, `consentGuard`, `maxRetries`, `sleep`, `allowBrowserAccess`.
- `ClaudeModel`: `{id, name, createdAt?}`.
- `stream(request: AgentProviderRequest): AsyncGenerator<AgentProviderEvent>`.
- `listModels(signal: AbortSignal): Promise<ClaudeModel[]>`.

The default privacy gate denies all cloud access until explicit consent. The gate remains active through SSE consumption and model discovery; withdrawal cancels reads and rejects buffered output. `consentGuard` is an additional outgoing-context check, not a replacement for the privacy gate. Model catalog calls transmit only credentials and pagination, never project text. `listModels` uses the cloud gate directly, not the inference-only `consentGuard` callback.

Endpoints:

- `POST https://api.anthropic.com/v1/messages`
- `GET https://api.anthropic.com/v1/models?limit=100`, followed by `after_id` pages.

Authentication: `x-api-key`, `anthropic-version: 2023-06-01`. No Claude.ai subscription OAuth, copied sessions, API pricing claims, hardcoded model catalog, or account entitlement claims. Unknown cost stays absent, not zero. Keys are resolved at each request, never written into session snapshots, logs or adapter storage.

## Supported content and tool rounds

System text becomes top-level `system`. Conversation text becomes native `text` blocks. Assistant tool calls become `tool_use` objects with parsed object input. Tool results become `user`-role `tool_result` blocks referencing their original IDs. Adjacent same-role messages are combined, so parallel tool results occupy one following user message. Malformed tool inputs fail before network disclosure.

SSE handles UTF-8 splits, CRLF, comments, named events and JSON `type` fields. Text fragments stream directly; `input_json_delta` fragments use the content block index. Empty tool input emits `{}`. The adapter does not execute tools. Usage fields are cumulative snapshots, not incremental token charges. Initial and final usage are emitted separately; missing values remain undefined. No cost is invented.

Stop reasons normalize to the existing session contract:

| Anthropic | Session |
| --- | --- |
| `end_turn`, `stop_sequence` | `stop` |
| `tool_use` | `tool_calls` |
| `max_tokens`, `model_context_window_exceeded` | `length` |
| `refusal` | `content_filter` |

Unknown stop reasons fail closed. `message_stop` is mandatory. The session cannot execute a partial tool call after a truncated/error stream. Unknown future SSE event types are ignored as required by the vendor's forward compatibility guidance. Unknown content-block types are rejected, because dropping them could make the next tool round invalid.

## Migration boundary

This adapter deliberately does not enable extended/adaptive thinking, server tools, or native agent sessions. Current `AgentMessage`/snapshot history stores only text and client tool calls; it cannot preserve native thinking blocks, signatures, redacted thinking, or pause/resume state. Receiving those blocks fails closed. Adding such support requires a versioned native-content history/snapshot contract and round-trip tests, not merely accepting more SSE types. Models that require native thinking state are not supported by this adapter.

Prefer a Rust/native transport supplied through `ClaudeOptions.fetch`. The transport must preserve streaming, abort, redirects, HTTP status and headers. The current TypeScript credential callback necessarily returns a key to the caller; an actual no-key-in-WebView migration additionally requires native key resolution inside that transport. A fetch proxy that still receives `x-api-key` does not meet that stronger boundary. No Rust transport is implemented by this isolated branch.

`allowBrowserAccess` defaults to false. An un-injected browser request is rejected before credential lookup unless a deliberate preview prototype opts in. Opt-in sets the official SDK's `anthropic-dangerous-direct-browser-access: true` header. This is a prototype escape hatch, not the recommended native security design. Do not silently enable it in shipping desktop builds. Native HTTP/CORS/CSP/credential handling still need real desktop tests.

## Errors and retries

HTTP 401/403, 404, 413, 429 and 5xx map to existing fixed-text `AgentError` categories. Stream error types map similarly, including 529 overload. Provider error text and private exception text are never echoed. Malformed/non-SSE responses are protocol errors. Network/stream failures are generic and retryable for explicit user retry.

Automatic retries are limited to failures before consuming a stream (maximum three retries), with capped exponential backoff and numeric/date `Retry-After`. Mid-stream errors are never automatically replayed. Request abort or consent withdrawal stops the backoff/reader. Cancellation is not a promise that no provider charge occurred; a pre-stream network retry can still be billable at the remote endpoint.

## Builder integration

1. Apply the optional factory/settings patch in `integration/claude-wiring.patch` manually alongside other provider branches. It is a wiring template, not a complete native runtime. `providerAuth.ts` is delivered by the auth branch, not this branch.
2. Create `ClaudeProvider({getApiKey: () => loadProviderKey('claude'), fetch: nativeProviderFetch})` through the central factory. Do not snapshot credentials or carry a stale key from `config.apiKey`.
3. Extend the shared TS/Rust provider allowlists with `claude`; use the auth branch's independent keyring entry and UI. Do not reuse the OpenRouter credential entry.
4. The central configuration UI should offer `Claude (API key, cloud)`. Use `listModels(signal)` for a refreshable model select with names and exact IDs, loading/error/empty states and cancellation on provider changes. Never auto-switch the saved model on discovery failure. Explicit model input remains usable. Discovery requires cloud consent, but is not inference and must not create an inference charge.
5. Add the adapter's export to the shared barrel if needed. Configure native endpoint allowlists/CSP. Test native request abort, consent withdrawal, model refresh and credential errors.
6. Verify text chat and parallel read/propose tool rounds on Windows/macOS with a user-approved API request. Paid smoke testing was intentionally not performed here.

## Verification

24 mocked provider tests cover schema, tools, split SSE, usage, finish reasons, HTTP errors, retry, consent, abort, discovery pagination/loops, malformed content, consumer return and sensitive transport failures. The whole core suite and build passed before the final four additional tests; see handover for final run counts. No UI pixels were verified because this branch changes no rendered UI.

## Official sources consulted

- Messages schema: https://docs.anthropic.com/en/api/messages
- Streaming lifecycle, deltas and errors: https://docs.anthropic.com/en/api/messages-streaming
- Model discovery and pagination: https://platform.claude.com/docs/en/api/models/list
- Official SDK client source, explicit browser header: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts

Only the stable text/client-tool subset is used. Presence in a live catalog is not evidence that a model supports this history subset or that its inference is free.
