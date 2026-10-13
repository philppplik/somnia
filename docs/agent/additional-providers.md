# Additional AI providers: Grok (xAI), Meta Model API, DeepSeek

Status: 13 October 2026, unreleased. The implementation has offline fixture coverage only, not live-service verification. Each provider uses its own OS credential slot, consent identity and authenticated model catalog. No provider is routed through OpenRouter.

| Provider | Id | Somnia Agent inference | Model catalog |
| --- | --- | --- | --- |
| Grok (xAI) | `xai` | `POST https://api.x.ai/v1/responses` | `GET https://api.x.ai/v1/models` |
| Meta Model API | `meta` | `POST https://api.meta.ai/v1/responses` | `GET https://api.meta.ai/v1/models` |
| DeepSeek | `deepseek` | `POST https://api.deepseek.com/chat/completions` | `GET https://api.deepseek.com/models` |

## Protocol replay

Somnia Agent reuses the incremental SSE parser in `openAI.ts`. The vendor registry chooses the protocol; the code never guesses capabilities from a model ID.

- DeepSeek's `delta.reasoning_content` fragments are accumulated separately from visible text. A complete response records that content as private protocol state on its assistant message. Tool-enabled requests replay it unchanged for all matching prior assistant messages, including earlier user turns. Requests without tools omit it, as the documented API ignores it in that mode. Each completed assistant message replaces its own response state; reasoning from separate responses is never concatenated together.
- xAI and Meta use Responses with `store: false`, `include: ["reasoning.encrypted_content"]` and a visible-output limit (`max_output_tokens`). The complete terminal `output` array is kept and replayed unchanged, including encrypted reasoning, tool references, message annotations and Meta commentary phases. It replaces reconstruction from the visible text and tool calls, so there are no duplicated messages or calls.
- Meta reasoning-only output gets a minimal assistant separator before the next user message. Reasoning items must contain both encrypted content and a summary array; bare server IDs fail closed.
- Replay is scoped to the exact provider and model. Switching either does not send the prior provider's private state. Replay is bounded by the session context limit and validated on restore. It is local conversation data, never a credential, instruction, tool authorization, log entry or UI event. Session snapshots do contain it and must be treated as private conversation data.
- No `previous_response_id` is used. Meta disallows combining it with encrypted-content inclusion; stateless history also avoids opting users into server-managed conversation storage.
- OpenAI ChatGPT account mode retains its separate restricted request contract. These vendor fields are not added to that route.

DeepSeek thinking mode and reasoning effort are not forced. They are model-specific and may affect cost. The adapter preserves reasoning whenever the API returns it; it does not infer an effort value from a model-name prefix.

## Catalog maintenance

Model IDs come from the authenticated vendor catalog or the user's manual input. There is no seeded model list, dated default or inference probe during refresh. Empty catalogs stay empty; failed refreshes never invent replacements. Entries are validated, deduplicated and sorted. Listed IDs do not prove inference access, tool support or available credits. No reasoning-effort, context-window or pricing table is maintained by guessing from names.

Meta's catalog overview does not expose a complete JSON response schema in the fetched documentation. The parser accepts the documented OpenAI-compatible list convention (`data` entries with `id`) and rejects unknown shapes rather than silently using a static list. Native Vibe Space only shows explicitly configured models; it is not a full remote catalog.

## Security and native boundary

- Keys stay in the OS credential store under the provider id. The renderer never learns a stored key.
- Native transport allow-lists only each vendor's exact model-list GET, Chat Completions POST and (xAI/Meta only) Responses POST. Query-string variations, redirects and cross-vendor routes are rejected. Candidate-key tests only call the catalog.
- The CSP lists the three official hosts. Existing cloud consent and revocation cover both streaming and catalog requests. Errors never echo provider bodies or keys.
- User review still gates every proposed file change. Reasoning replay is not visible reasoning, and it cannot authorize tools.

**Vibe Space is a separate Rust engine.** Its provider mapping still uses Chat Completions, not this frontend Responses adapter. The v2 replay feature applies to Somnia Agent only. Reasoning continuity in native Vibe Space remains a follow-up and must not be claimed as shipped or tested. Chat Completions is a legacy route in current xAI docs and has no encrypted-reasoning replay field.

## Verification and remaining checks

- Synthetic-only fixtures exercise the actual adapters and session tool loops, including fragmented UTF-8 SSE, errors, retries, cancellation, consent revocation, encrypted replay, provider/model isolation, session restoration and review-only writes.
- No real keys, inference requests, servers or paid Actions runs were used. Live API behavior, model availability and pricing remain unverified.
- Rust tests and desktop builds were not run here: no Rust toolchain is available. Native allow-list tests were added for CI, not reported as executed.
- This repository's existing missing `slides-engine/pkg/somnia_slides.js` blocks a full clean TypeScript check. No new provider TypeScript diagnostics were observed.
- xAI's output-token cap is for the visible answer; reasoning and function-call tokens are outside it. It is not a dollar spending cap. Existing session timeout remains unchanged and may be shorter than vendor recommendations for long reasoning requests.

## Official sources checked 13 October 2026

- DeepSeek thinking mode and mandatory tool-enabled replay: https://api-docs.deepseek.com/guides/thinking_mode/
- DeepSeek catalog: https://api-docs.deepseek.com/api/list-models
- xAI Responses and stateless complete-output replay: https://docs.x.ai/developers/model-capabilities/text/best-practices
- xAI encrypted reasoning: https://docs.x.ai/developers/model-capabilities/text/reasoning
- xAI Responses endpoint: https://docs.x.ai/developers/rest-api-reference/inference/responses
- xAI catalog: https://docs.x.ai/developers/rest-api-reference/inference/models
- Meta Responses, encrypted replay, ordering and commentary phases: https://llama.developer.meta.com/docs/features/responses
- Meta tool-call pairing: https://llama.developer.meta.com/docs/features/tool-calling
- Meta Responses overview: https://llama.developer.meta.com/docs/api-reference/responses
- Meta catalog overview: https://llama.developer.meta.com/docs/api-reference/models
- Meta official SDK compatibility and current endpoint: https://llama.developer.meta.com/docs/quickstart
