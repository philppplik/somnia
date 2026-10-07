# Direct Claude API for Somnia: implementation decision

Research date: 7 October 2026. Status: proposal, not implemented or paid-inference tested.
Repository baseline: `somnia-agent` at `467071380187a133eb90eb94e37963b0501ad480`.

## Decision

Build a direct Anthropic BYOK provider behind the native Tauri/Rust boundary. Use Messages with streaming and local, permission-checked project tools. Do not ship a Somnia-owned key, route through a Somnia server, enable browser SDK credentials, or reuse consumer Claude/Claude Code login for this adapter. Start with Sonnet 5.5 for everyday code/diff proposals. Keep Opus 5.5 an explicit quality option. This cost-conscious default is a Somnia recommendation, not Anthropic's general recommendation (its model overview starts with Opus 5.5). [1,2,11]

This is not a small OpenAI wire-format conversion: Claude uses typed content blocks, tool-result user messages, and signed thinking blocks. Extend the provider/session contract before enabling agentic tool rounds. Keep existing reviewable file proposals, privacy guards, cancellation and project boundaries. [4,5,7,12]

## Current models and prices

Direct Claude API, USD per million tokens, standard non-batch/global routing. Prices are a dated reference, not a billing guarantee. [1,2,16]

| Option | Exact API model ID | Context / max output | Input / output | 5m write / 1h write / cache read |
| --- | --- | --- | --- | --- |
| Everyday default | `claude-sonnet-5-5` | 1M / 128K | $2 / $10 | $2.50 / $4 / $0.20 |
| Explicit quality upgrade | `claude-opus-5-5` | 1M / 128K | $4 / $20 | $5 / $8 / $0.20 |
| Lower-cost option, not default | `claude-haiku-4-5-20251001` | 200K / 64K | $1 / $5 | $1.25 / $2 / $0.10 |
| Advanced, explicit opt-in only | `claude-fable-5-1` | 1M / 128K | $10 / $50 | $12.50 / $20 / $0.25 |

Haiku has alias `claude-haiku-4-5`; pin the dated snapshot. Dateless IDs from generation 4.6 onward are themselves pinned snapshots, not silently advancing aliases. The overview lists older available models including Sonnet 5/4.6 and Opus 5/4.8/4.7/4.6/4.5; do not hard-code this as a permanent catalog. Fable is a Covered Model with required 30-day retention and additional access/retention controls; Mythos is limited-access and should not be a general picker option. [1,13]

Use `GET /v1/models` with the user's credentials for account-visible choices. Follow pagination (`has_more`, `last_id`, `after_id`). Read capabilities, `max_input_tokens`, `max_tokens` and `line`; tolerate nulls and new lines. Do not infer capability from a model name or copy placeholder values from schema examples. Persist the chosen model without automatic upgrades or fallback to a more expensive model. [3]

## Endpoints and authentication

Base URL: `https://api.anthropic.com`. Fixed provider-owned host; no arbitrary URL from project files, model output or extension content. [4]

| Endpoint | Purpose | MVP decision |
| --- | --- | --- |
| `GET /v1/models` | Available models/capabilities; non-generating credential check | On explicit Connect/Refresh, cache result |
| `GET /v1/models/{model_id}` | Resolve alias/read one model | Optional validation |
| `POST /v1/messages` | Stateless conversational inference, SSE when `stream: true` | Required |
| `POST /v1/messages/count_tokens` | Model-specific input estimate | Preflight larger requests/context changes |
| Batches, Files, Skills, Managed Agents, server tools | Separate storage/compute/workflows | Out of scope |

Headers: `Authorization: Bearer <user-key>`, `anthropic-version: 2023-06-01`, `content-type: application/json`. `x-api-key` remains supported but current authentication docs call it legacy. Multi-workspace keys require `anthropic-workspace-id`; expose an optional workspace ID setting and report the provider's missing-workspace error. A single-workspace key can omit it. No beta headers by default. [4,11]

Suggested new-user request (tools supplied only after local validation):

```json
{
  "model": "claude-sonnet-5-5",
  "max_tokens": 8192,
  "stream": true,
  "output_config": {"effort": "medium"},
  "thinking": {"type": "adaptive"},
  "system": "Somnia's fixed session instructions and reviewed custom prompts",
  "messages": [{"role": "user", "content": [{"type": "text", "text": "User request"}]}],
  "tool_choice": {"type": "auto"}
}
```

`medium` is our latency/cost starting point, not a hard spend cap; Sonnet 5.5's API default is `high`, Opus 5.5's is `medium`. Validate with offline fixtures first and later with separately approved paid evals. Do not send temperature/top_p/top_k, manual thinking budgets, assistant prefill, forced `any`/named tool choice, or `thinking: disabled` to Sonnet 5.5. These incompatible settings can return 400. Its low-upfront-thinking alternative is `between_tools`, accepted at low/medium/high, but this does not remove the need to preserve thinking blocks in tool workflows. [6,7]

## Native-client security and existing code changes

Anthropic's TypeScript SDK disables browser use by default because credentials can be extracted from browser code. Do not turn on `dangerouslyAllowBrowser` in Somnia. Native BYOK is an architectural recommendation derived from that risk, not a claim that Anthropic certifies Tauri. [10]

At the inspected repository baseline:

- `phase1/src/lib/agent/settings.ts` and native preference validation accept only `ollama` / `openrouter`.
- `phase1/src-tauri/src/desktop.rs` stores a single `openrouter` key and returns its plaintext value in the settings reply to the trusted editor.
- `phase1/src/lib/agent/types.ts` exposes text, tool calls, usage and finish, but no complete native response blocks. `AgentMessage.content` is a string. `session.ts` snapshots therefore cannot preserve Claude thinking/signature/block order.
- Session defaults already provide 8192 output tokens, 16 steps, 48 tool calls, 1MiB context bytes and a 180-second timeout. These are application limits, not Anthropic API limits.

Recommended delta:

1. Add `anthropic` as a separate provider and provider-key namespace. Keep existing OpenRouter keys intact. UI load returns `hasKey`/status, not the stored Claude key. UI may submit a new key for storage but should not retrieve it afterward. Rust reads it only for authorized requests; redact logs and never include it in snapshots, exports, crash reports or extension messages.
2. Use native HTTPS transport and narrowly scoped IPC commands for models/count/messages/cancel. Only the trusted editor invokes them. Enforce endpoint, project/context consent, payload/response size and tool limits in the host, not only UI code. Redact auth headers and full provider errors; diagnostic IDs/status are enough.
3. Add provider-specific typed transcript storage for complete assistant `content` arrays and signatures. Keep the UI's text/tool projection separate. Snapshot version/migration, provider/account binding and restore tests are required. Preserve block ordering and replay exact received blocks; never invent or modify signatures.
4. Freeze system/custom prompts and tool definitions per session; messages are append-only. Model, account or prompt changes start a new session in MVP. Current models bind replayed thinking to the original prefix; new accounts can receive 400 when earlier system/tools/messages change. Do not trim history and keep incompatible later signatures. On context exhaustion, explicitly start a fresh summarized session instead. No beta drop-block workaround by default. [12]
5. Reuse the cloud-disclosure guard on every outbound request, including count-token requests and tool results. Send only user-approved context. API transport is cloud processing even though tools/files remain local.

App Attest is now documented for genuine iOS/macOS installations without embedded keys; it is an optional separate investigation, not a cross-platform BYOK replacement or Windows/Linux solution. Federated workload identity is also a separate route. Browser CORS is unavailable for ZDR organizations, another reason not to rely on Webview browser fetch. [11,13]

## Streaming contract

Implement and fixture-test an SSE state machine, not an OpenAI `[DONE]` parser. Preserve UTF-8 across chunks, multiline `data:`, CRLF and arbitrary network boundaries. [5]

- `message_start` initializes message and usage; content blocks start/delta/stop by index.
- `text_delta` feeds the UI. Accumulate `input_json_delta.partial_json` until the tool block closes, then parse and schema-check. Never execute partial arguments.
- Accumulate thinking/redacted-thinking/signatures for exact replay, separately from user-visible text. Default thinking display on Sonnet 5.5 is omitted, but blocks/signatures still arrive. [7,12]
- `message_delta` supplies final stop reason and cumulative usage. Replace/merge cumulative counters, never sum repeated totals. Finish only after `message_stop`.
- Ignore `ping`; tolerate new event types without mistaking unknown output blocks for executable tools. An SSE `error` can arrive after HTTP 200. EOF without completion is an interrupted turn, not success.
- Cancel closes native transport and stops local tools. Cancellation does not guarantee zero provider billing. Keep partial output marked incomplete; do not add it as a successful replayable assistant turn or apply its diff. No automatic retry after any emitted content or executed tool. User-requested text continuation on 4.6+ uses a user continuation message, not assistant prefill; partial tool/thinking blocks are not recoverable. [5]

## Client tool use and review boundary

Map `AgentToolDefinition.parameters` to Claude `input_schema` (JSON Schema), with detailed descriptions. Prefer `strict: true` for supported project tools; it constrains argument shape, not authorization or correctness. Current Sonnet 5.5 allows at most 20 strict tools. Use static generic schemas, no project secrets or private values in schema enums. [7,8]

1. A complete assistant response with `stop_reason: tool_use` can contain several `tool_use` blocks (`id`, `name`, object `input`) and thinking/text. Append its complete content array unchanged.
2. Host checks allowlisted tool name, schema, project scope, permission and current filesystem state. `write_file` stages the existing reviewable proposal; model output must never directly apply files or trigger shell/deploy/network calls.
3. Send one following user message containing `tool_result` blocks matched by `tool_use_id`. Results precede other text; simplest MVP sends only results. Return execution failures via `is_error: true`. Return results for every tool call, including denied/cancelled ones if continuing the turn. Group existing individual tool-role messages for this wire format.
4. Keep source content in tool-result blocks as untrusted data. Do not promote retrieved file text into system instructions. Preserve step/tool budgets and avoid parallel mutating tool execution. Strict schemas do not prevent prompt injection. [8]

`end_turn` is normal completion; `max_tokens` is incomplete and may truncate a tool block; `refusal` is a refusal, not a transport error; `stop_sequence` needs its own completion handling. `pause_turn` is server-tool continuation, not a finished answer. No server tools enabled in MVP, but handle unsupported/new stop reasons safely instead of claiming completion. [9]

## Cost, limits and retries

- Token counting is free but independently rate-limited and sends input to Anthropic. Counts are estimates, not invoices. Use the selected model's tokenizer, not byte/word counts. [14]
- Show estimated input plus requested output upper allowance before sending. Track actual usage and cache buckets; keep USD estimates labeled estimates and absent price/usage as unknown, never zero. For uncached Sonnet 5.5, 10K input + 2K output is $0.04; 10K input + all 8192 allowed output is $0.10192, before any other charges. These arithmetic examples are not preauthorizations.
- MVP: one active generation per session, no auto model fallback, no server tools/fast mode/batches/1h cache. Keep initial session limits above. An app estimate cap cannot enforce the user's organization spend cap; recommend their Console workspace spend limit. Rate/spend caps are organization/workspace-wide, not per installation. [2,15]
- Optional second milestone: automatic top-level `cache_control: {"type":"ephemeral"}` for 5-minute caching after usage accounting is correct. Cache writes cost extra and short prompts may not cache; do not advertise guaranteed savings. Keep static prefix unchanged. [17]
- API rate limits cover RPM, ITPM and OTPM by model class, plus acceleration limits. Current Start-tier Sonnet 5.5 table lists 1000 RPM / 2M ITPM / 400K OTPM; this is not a promise for an individual key. Respect actual response headers and account Console limits. Parse `anthropic-ratelimit-*` and `retry-after` (seconds). [15]

| Failure | Somnia response |
| --- | --- |
| 400 validation/spend setting | Explain incompatible field or configured spend limit; no blind retry |
| 401 | Key invalid/revoked/expired; request replacement securely |
| 402 | Billing issue; no retry loop |
| 403 | Resource/workspace permission problem; no fallback to different account |
| 404 | Endpoint/model/resource missing; offer model refresh, preserve user's choice |
| 413 | Request too large; reduce authorized context (Messages/count limit 32MB) |
| 429 with rate-limit evidence / retry-after | Cancellable countdown/backoff; bounded retries |
| 429 tier spend-cap, no retry-after and matching error message | Stop until billing/cap changes; no repeated retry |
| 408/409/network/500/504/529 before output | At most two bounded backoff attempts with jitter; reconcile conflict first |
| SSE error/EOF after output, abort, truncated tool block | Incomplete turn; no automatic replay or tool execution |

Use one retry owner, not SDK retries plus outer retries. Official SDK retries transient failures twice by default and its default timeout is much longer than Somnia's current 180 seconds; configure deliberately if using it. Repeated requests can incur repeated billing; connection loss does not establish whether the first request ran. Store sanitized `request-id`, status, model and usage for diagnostics, not prompt bodies. [10,18]

## Privacy wording and unresolved decisions

Do not promise local-only AI, no retention or default ZDR. Commercial standard policy says inputs/outputs are deleted within 30 days, with exceptions; ZDR is a separate organization arrangement. Fable/Mythos Covered Models require 30-day retention unless expressly authorized otherwise. Retention depends on feature/model/account, and public docs contain a broader "not retained by default" statement alongside the standard commercial 30-day policy. Use the conservative standard-policy wording until the user's contract establishes otherwise. No training without express permission is stated in API retention docs. [13,19]

Open choices: final effort/budget UI, workspace field placement, whether Haiku belongs in presets, optional caching milestone, privacy text review, native credential availability on all target OSes, and the scope of a later paid eval. No paid request, Actions job or auth/account setup was performed for this brief.

## Offline acceptance tests before merge

- Request fixtures: headers/workspace selection, top-level system, block order, strict schemas, grouped tool results and multiple calls.
- SSE fixtures: byte-split Unicode, CRLF/multiline data, interleaved indices, partial JSON, thinking signatures, unknown event, ping, cumulative usage, midstream error, malformed/truncated stream.
- Round trip: two tool rounds with byte-equivalent signed content and unchanged prefix; save/restart replay; account/prompt/model change resets; old snapshot migration cannot fabricate signatures.
- Safety: host-side project/tool allowlist, no auto apply, cloud consent revocation during transport, no secret returned to UI/log/export, bounded request/response, cancellable retries and tool limits.
- Errors: 400/401/402/403/404/413, rate 429 versus spend-cap 429, 500/504/529, interruption after first delta, output limit, refusal and unexpected stop reason.

## Official sources

All below read on 7 October 2026. Documentation-only research; model availability for a particular account remains untested.

1. Models overview: https://platform.claude.com/docs/en/models/overview
2. Pricing: https://platform.claude.com/docs/en/about-claude/pricing
3. Models API: https://platform.claude.com/docs/en/api/models/list
4. API overview: https://platform.claude.com/docs/en/api/overview
5. Streaming: https://platform.claude.com/docs/en/build-with-claude/streaming?_rsc=1ebj0
6. Effort: https://platform.claude.com/docs/en/build-with-claude/effort
7. Sonnet 5.5 migration: https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide
8. Tool definition/results/strict schemas: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools ; https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls ; https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
9. Stop reasons: https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons
10. Official TypeScript SDK: https://github.com/anthropics/anthropic-sdk-typescript
11. Authentication: https://platform.claude.com/docs/en/manage-claude/authentication
12. Thinking replay/prefix: https://platform.claude.com/docs/en/build-with-claude/thinking-tool-workflows ; https://platform.claude.com/docs/en/build-with-claude/preserved-thinking
13. Retention/feature constraints: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
14. Token counting: https://platform.claude.com/docs/en/build-with-claude/token-counting
15. Rate and spend limits: https://platform.claude.com/docs/en/api/rate-limits
16. Public pricing corroboration: https://claude.com/pricing
17. Prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
18. Errors: https://platform.claude.com/docs/en/api/errors
19. Standard commercial retention: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
20. Messages schema: https://platform.claude.com/docs/en/api/messages/create

Freshness reconciliation: search returned an older `/about-claude/models/overview` excerpt listing Sonnet/Opus 5; fetched canonical `/models/overview`, fetched pricing and public pricing agree on 5.5. Recheck catalog/prices before shipping. Published retirement lower bounds are not scheduled retirement dates; no exact sunset is assumed here.
