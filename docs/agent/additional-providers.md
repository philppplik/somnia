# Additional AI providers: Grok (xAI), Meta Model API, DeepSeek

Status: 13 October 2026, unreleased. Each provider has its own API route, its own key slot in the OS credential store and its own model list. None of them goes through OpenRouter.

| Provider | Id | Chat endpoint | Model list | Auth |
| --- | --- | --- | --- | --- |
| Grok (xAI) | `xai` | `POST https://api.x.ai/v1/chat/completions` | `GET https://api.x.ai/v1/models` | `Authorization: Bearer <key>` |
| Meta Model API (Muse) | `meta` | `POST https://api.meta.ai/v1/chat/completions` | `GET https://api.meta.ai/v1/models` | `Authorization: Bearer <key>` |
| DeepSeek | `deepseek` | `POST https://api.deepseek.com/chat/completions` | `GET https://api.deepseek.com/models` | `Authorization: Bearer <key>` |

All three speak the OpenAI Chat Completions format with SSE streaming and function tools, so they reuse the existing `OpenAIProvider` adapter with a `vendor` entry from `phase1/src/lib/agent/compatProviders.ts`. There is no second SSE parser. A vendor differs only by:

- its own provider id (consent, provenance and key slot use it),
- fixed endpoints (no custom base URL, no redirects, no ambient proxy),
- the output-limit field: `max_completion_tokens` for xAI and Meta, `max_tokens` for DeepSeek,
- no OpenAI-only request fields (`store`), and the plain `system` role instead of `developer`,
- a model list parser that does not require `created` or `owned_by` (DeepSeek returns neither `created`).

The model list is a metadata request, not inference. A listed model is not a promise of tool support, access or credits. Model IDs are never hardcoded; type one or refresh the list.

## Security model

- Keys live only in the OS credential store under the existing service, account name = provider id (`xai`, `meta`, `deepseek`). The editor only learns whether a key exists.
- `provider_transport.rs` allow-lists exactly the two routes above per vendor (HTTPS, exact URL, no query string, POST for chat, GET for models). A key slot can never reach another vendor's host.
- Candidate-key tests (before saving) may only call the model-list URL.
- The Content Security Policy `connect-src` lists the three hosts.
- Cloud consent applies as for every cloud provider, and the consent dialog links each vendor's policy.
- Errors are classified and fixed-text. Provider bodies and keys are never logged or echoed.

## Vibe Space

`provider_config` in `vibespace_commands.rs` maps the three ids to the same chat endpoints, and credentials are read from the same key slot. The configured provider/model appears in the Create-task model chooser like OpenRouter or OpenAI.

## Sources (official documentation, checked 13 October 2026)

- xAI: https://docs.x.ai/docs/api-reference (POST /v1/chat/completions, Bearer auth, base URL `https://api.x.ai/v1`), https://docs.x.ai/docs/rest-api-reference/inference/models (GET /v1/models), https://docs.x.ai/docs/models
- Meta Model API: https://dev.meta.ai/docs/protocols/chat-completions.md, https://llama.developer.meta.com/docs/api-reference/ (base URL `https://api.meta.ai/v1`, Bearer auth, `GET /v1/models`), https://llama.developer.meta.com/docs/authentication/. The API reference says `system` is accepted for compatibility (Meta prefers `developer`).
- DeepSeek: https://api-docs.deepseek.com/ (base URL `https://api.deepseek.com`, OpenAI format), https://api-docs.deepseek.com/api/list-models (GET /models)

## Not verified

- No real key and no real network call was used. Behavior against the live services is untested.
- The Meta model list response body shape is not shown in the official page we could read; the parser accepts the OpenAI-style `{"data":[{"id":...}]}`.
- Meta's docs disagree on current model IDs (`muse-spark-1.2` vs `muse-spark-1.3` in examples). Type or refresh; nothing is hardcoded.
- Reasoning-specific fields (DeepSeek `thinking`, `reasoning_content`) are not sent or replayed. Reasoning models may need a non-reasoning model ID for tool loops.
- Native build and Rust tests were not run in the authoring environment (no Rust toolchain). CI should run them.
