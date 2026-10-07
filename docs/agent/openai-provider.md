# OpenAI BYOK provider

Implemented adapter: `phase1/src/lib/agent/openAI.ts`. Provider ID: `openai`.
This is OpenAI API-key access, not ChatGPT subscription authentication or Codex.
No live inference, paid API requests or packaged desktop tests were performed.

## Contract

`OpenAIProvider` implements `AgentProvider`. Construct with `getApiKey`, optionally
`fetch`, `privacyGate`, `consentGuard`, `maxRetries` (0-3) and `sleep`.
Resolve the key at request time with `getApiKey: () => loadProviderKey('openai')`.
The shared cloud privacy gate is mandatory even if `consentGuard` is supplied.
The optional disclosure callback receives the exact chat request before key access.
Model discovery is also gated, but sends no chat or project content.

- `POST https://api.openai.com/v1/chat/completions`: streaming chat and tools.
- `GET https://api.openai.com/v1/models`: model discovery without inference.
- Exported constants: `OPENAI_CHAT_ENDPOINT`, `OPENAI_MODELS_ENDPOINT`.
- `listModels(signal)` returns sorted, deduplicated `OpenAIModel[]` containing
  `{id, ownedBy, created}`. It never auto-selects a model or calls inference.
- The catalog includes non-chat models. Catalog membership is not a promise of
  tool or Chat Completions support. Keep manual model-ID entry available and show
  unsupported-model errors, rather than silently selecting a different model.

## Wire format and stream behavior

The adapter sends Bearer auth, `model`, `messages`, `stream: true`, `store: false`,
`max_completion_tokens`, `stream_options: {include_usage: true}`, and optional
function tools. No OpenRouter routing or ZDR fields are sent. System instructions
map to `developer` for modern models; GPT-3.5/GPT-4 family IDs retain `system`.
No temperature is sent, avoiding unsupported reasoning-model parameters.
Assistant tool calls and tool-result IDs survive round trips.

SSE handles split UTF-8, CRLF, heartbeat comments and data lines. Choice 0 emits
text deltas, indexed tool-call fragments, finish reasons and usage. `[DONE]` is
required; a truncated body rejects even if partial text has been shown. The
session retains responsibility for rejecting incomplete turns and proposals.
Usage reports input/output tokens only. OpenAI does not report a USD amount in
this schema, so cost remains unknown, never invented as zero.

Cancellation, early consumer return and cloud-consent withdrawal cancel the
body and suppress buffered output. JSON bodies and SSE events have size bounds.
HTTP/API error codes map to `AgentError`; raw error messages, keys and prompts
never enter visible error text. Quota, billing, spend and usage limits are not
retried, including HTTP 429 cases. Temporary 408/429/5xx rejection responses get
at most three retries. Valid `Retry-After` seconds/dates are honored; a delay
above 15 seconds returns the retryable error instead of retrying too soon.
Ambiguous network failures and errors after streaming starts are never retried.

`store: false` is not a zero-retention or no-training guarantee. Provider policies,
account terms and consent remain separate integration/release requirements.

## Builder integration (central files intentionally untouched)

The companion `integration/openai-wiring.patch` is an **unapplied reference patch**
against commit `467071380187a133eb90eb94e37963b0501ad480`. Apply/adapt only after
merging the Auth branch. It adds export, provider union, preferences allowlists,
factory creation using the Auth branch's runtime key accessor, and CSP origin.
It does not replace Auth's per-provider keyring or UI work.

1. Merge this adapter and the Auth module. Use `loadProviderKey('openai')` in the
   factory, not `config.apiKey`, localStorage or the OpenRouter credential entry.
2. Add OpenAI (cloud) to the panel's provider selection and use the Auth component
   to select/test/store a separate OpenAI key. Changing provider must not reuse a
   previous provider's key. Auth owns credential storage and Rust IPC.
3. In the central model-selection UI, call
   `new OpenAIProvider({getApiKey: () => loadProviderKey('openai')}).listModels(signal)`
   only on an explicit refresh after cloud consent. Bind returned IDs to a native
   select/datalist; require the user to choose/enter an ID, with no paid probe.
   Disable refresh while pending, show redacted `AgentError` text and abort on
   provider/key change, panel close or a new refresh. Ignore stale results.
4. Preserve active-file permissions, cloud-consent gate, project boundaries,
   custom prompts, tool review and manual retry behavior. Do not expose API keys
   in model/catalog URLs, console logging, chat snapshots or exported projects.
5. Run unit/type checks and fixture panel tests after integration. Visually
   inspect the integrated panel. Test the packaged app's CSP/OS-store path with
   the owner before claiming real provider compatibility.

## Verification

`openAI.adapter.test.ts` covers payloads, UTF-8, tools, usage, model discovery,
missing consent, billing/rate errors, safe failures, revocation and cleanup.
Tests use local mocked fetch and fixture credentials only.

## Official sources checked 7 October 2026

- Chat schema: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create/
- Model catalog: https://developers.openai.com/api/reference/resources/models/methods/list/
- SSE semantics: https://developers.openai.com/api/docs/guides/streaming-responses
- Error codes: https://developers.openai.com/api/docs/guides/error-codes
- Retry guidance: https://developers.openai.com/api/docs/guides/rate-limits

OpenAI recommends Responses for new projects. Chat Completions remains the
implemented documented API here because Somnia already uses its provider-neutral
chat/tool-call contract. Responses/Codex session semantics are a separate adapter.
