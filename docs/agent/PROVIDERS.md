# Somnia Agent providers

Status: design/integration draft, 6 October 2026. This document describes supported architecture paths, not a released compatibility list. No paid inference or subscription sign-in was tested for this documentation task.

## Provider matrix

| Route | Authentication | Processing location | Readiness |
| --- | --- | --- | --- |
| OpenRouter | User's API key | OpenRouter and routed model provider | First cloud adapter under development |
| Ollama, local model | Local daemon; deployment-specific auth if needed | User's local daemon/model | Additional adapter under development |
| Ollama remote/cloud route | Server-specific configuration | Configured remote server/cloud provider | Not a local-only privacy exception |
| ChatGPT/Codex subscription | Official supported agent login/flow, if eligible | Relevant OpenAI service | Official open-source route documented; implementation and eligibility checks pending |
| Claude/Claude Code subscription | Official supported agent login/flow, if permitted | Relevant Anthropic service | Not permitted for third-party Pro/Max login under current policy |
| Direct model APIs | Separate provider credentials and billing | Selected provider | Future adapter, not implied by a consumer subscription |

Model API, MCP tools and ACP agent sessions are different integrations. An OpenRouter Claude model is not Claude Code. An OpenAI model is not automatically the Codex agent. Do not label an arbitrary OpenAI model "Codex".

## OpenRouter

Use the Chat Completions path first: `POST https://openrouter.ai/api/v1/chat/completions`, Bearer authentication, explicit model, messages, tool schemas, output limit and streaming. Keep credentials in the native host and normalize transport events before the core sees them. Separate transport parsing from the bounded tool loop.

Model discovery should read the live catalog, then restrict editing to tested model/provider combinations. Show model ID, display name and capabilities. Catalog presence is not proof of account availability, endpoint policy or practical agent quality. Do not freeze model IDs or prices in the product promise.

SSE handling must account for network-chunk boundaries, comments, tool-argument fragments, usage-only frames, completion and errors after an HTTP success. Execute only complete validated tool calls. Stop aborts local work and attempts remote cancellation; it does not promise no further charge.

### Routing and privacy

Recommend strict ZDR-compatible inference routing. Apply restrictions in the request/host policy, not a UI label alone. If no eligible endpoint exists, stop and explain. Disable or explicitly constrain provider/model fallbacks so that none weakens privacy, required tool capability or budget policy. No silent relaxation.

ZDR applies to inference routing, not automatically to plugins and external tools. No-training and no-retention are different. Do not infer EU hosting or GDPR compliance from either. The user must review the actual OpenRouter and downstream-provider settings/policies. Keep outgoing context inspectable and exclude secrets.

### Usage and billing

Show dated estimates where available; mark unknown advance cost honestly. Reconcile reported usage/request IDs and costs afterwards. Local step/token/time budgets are safety controls, not a guaranteed cent-exact cap. Never display missing usage as zero. Handle authentication, credit, rate-limit, timeout and mid-stream failures separately; make billable retries explicit.

Sources:

- [API authentication](https://openrouter.ai/docs/api_reference/authentication)
- [Tool calling](https://openrouter.ai/docs/guides/features/tool-calling)
- [Streaming](https://openrouter.ai/docs/api_reference/streaming)
- [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
- [Zero Data Retention](https://openrouter.ai/docs/guides/features/zdr)
- [Provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging)
- [Data collection](https://openrouter.ai/docs/guides/privacy/data-collection)

## Ollama

The planned adapter discovers installed models with `/api/tags`, uses `/api/chat` for chat and parses its streamed response format rather than reusing an SSE parser. Tool-capable models can return tool calls; the host executes only permitted tools and supplies their results in a subsequent request. Not every installed model is suitable for editing.

Display daemon URL, connection state, selected model and whether the configured route is actually local. A localhost URL alone must not become a claim that a cloud model or a proxied request is private. Approve remote endpoints separately. Prevent untrusted project content from changing the endpoint.

Expose health/discovery failures, missing models, malformed frames and cancellation without silently switching to cloud. Do not automatically download large models or install software. Hardware, model/tool quality and native networking still need practical tests.

The parallel implementation reports `verifyLocalModel()` as a fail-closed locality check: HTTP loopback, cloud-tag rejection, `/api/show` remote-field checks and required model metadata. It also reports a `not-local` stream error for remote markers. Its claim is limited to "daemon reports local"; it cannot detect a dishonest loopback proxy. The revised Privacy guard also requires `processing: 'local'` from verified adapter metadata, not merely a loopback URL. These checks require actual integration/native tests and were not end-to-end exercised for this document.

If the verified route is local-only, no cloud-data opt-in is needed for that request. The AI error notice, context permissions, tool policy and manual review still apply. Cost is not "free" by assumption: remote deployments, compute and user infrastructure may have costs.

Source: [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling).

## Planned ChatGPT sign-in

Official OpenAI documentation now describes Sign in with ChatGPT for eligible open-source apps and local personal projects. Somnia's open-source distribution makes this a plausible supported path, not a claim of confirmed registration or account/model entitlement.

The documented flow uses a system browser, loopback callback on `127.0.0.1`, fresh state/nonce and PKCE, dynamic registration and explicit plan-usage permission. It requests offline access for refresh and an authorized resource invocation scope. The documented inference path is the public Responses API. A Rust/native-host implementation is the design recommendation: tokens in a verified OS credential store, signature/issuer/audience/nonce checks, refresh/revocation and safe cancellation, with no tokens exposed to the renderer.

A Codex app-server bridge is a separate option. Its model list can be a bundled catalog, not proof of entitlement; only a completed authorized inference verifies that request's access. Keep that external runtime's filesystem effects distinct from Somnia's native propose-only loop.

Registration/quickstart details, eligible deployment variants, exact plan/model limits and production token storage still need final verification before implementation. Do not promise free or unlimited use, reuse first-party tokens or ship an untested login button. Sign-in and plan-usage permission do not grant access to ChatGPT conversations.

Official sources checked 6 October 2026:

- [Sign in with ChatGPT](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)
- [Open-source integration with Codex app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
- [Codex authentication and credential storage](https://developers.openai.com/codex/auth.md)

## Claude subscription policy and supported alternatives

Anthropic's current legal/compliance documentation says OAuth is for ordinary use of Claude Code and native Anthropic applications. Third-party developers may not offer Claude.ai login or route requests through users' Free, Pro or Max credentials. It directs products using Claude capabilities to Claude Console API keys or a supported cloud provider and reserves enforcement without prior notice.

Do not implement Pro/Max subscription OAuth in Somnia or disguise token reuse as an ACP bridge. Retain Claude through a legitimate API-key/BYOK adapter, OpenRouter subject to its routed-provider terms, or separately verified supported cloud channels such as Bedrock. Provider access, billing and data policies need their own checks.

Official source: [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance). Current policy, not a promise that rules will never change. A future subscription option requires explicit provider permission before it becomes an implementation path.

## Authentication versus privacy

Privacy policies describe data handling, not authentication entitlement. Review the applicable product terms and supported authentication route independently. Do not scrape sessions, copy tokens from other apps, imitate first-party client identity or depend on undocumented consumer endpoints.

A runtime bridge must not bypass project boundaries, consent or reviewed-edit guarantees. Show runtime, data destinations, installed version, permissions and limits; use an audited restricted bridge if the runtime otherwise writes directly.

- [OpenAI privacy policy](https://openai.com/policies/privacy-policy/)
- [Anthropic privacy policy](https://www.anthropic.com/legal/privacy)

## Common adapter requirements

Use normalized cancellable events; expose actual capabilities; preserve request/model/provider identity; keep secrets out of renderer/log/export paths; require cloud opt-in before transmission; inspect context; enforce limits in the host; never execute model tools directly in the adapter; report unknown costs; preserve restrictions across retries and fallbacks. See [ARCHITECTURE.md](ARCHITECTURE.md) and the [privacy draft](PRIVACY.md).

## Errors and limits (OpenRouter and sessions)

Panel messages come from a fixed taxonomy (`phase1/src/lib/agent/errors.ts`), never from raw provider text.

| code | meaning | examples |
| --- | --- | --- |
| `limit` | bounded loop stopped | steps (default 16), tool calls (48), output tokens (8192, one automatic retry at 2x when a reasoning model emits nothing), timeout (180 s), context size |
| `tool-unsupported` | model/provider cannot do tool calls | HTTP 404/400 "no endpoints support tool use" |
| `provider-error` | provider/transport failure | 429 rate limit, 401/403 key, 402 credit, 5xx, network, bad stream |
| `aborted` | user stopped or consent withdrawn | Stop button |

- 408/429/5xx are retried automatically (up to 3 times, exponential backoff, honours `Retry-After`) before any output exists. Errors flagged retryable show a Retry button.
- The last step offers no tools, so the model must answer in text instead of the turn failing.
- Free models: with ZDR on (default), most `:free` models have no ZDR endpoint and return 404 (shown as "no available endpoint under current privacy settings"). Free models are also frequently rate-limited upstream.
