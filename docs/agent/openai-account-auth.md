# OpenAI account auth (Sign in with ChatGPT) - provider integration

Status: 7 October 2026. Implemented on `feature/openai-account-auth`. The
provider adapter is complete and unit-tested against mocks. No live OAuth
login, no real ChatGPT account and no paid inference was tested; the owner
live test is still pending, so treat every claim here as unverified against
production until then.

This is the official "Sign in with ChatGPT" (SIWC) flow for open-source apps.
It is NOT the Codex-CLI client registration and NOT the
`chatgpt.com/backend-api` endpoint. Primary sources (verified live 2026-10-07):

- <https://developers.openai.com/siwc/token-sharing-open-source/sign-in>
- <https://developers.openai.com/siwc/token-sharing-open-source/token-reference>
- <https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery>
- <https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations>

## Two explicit auth methods

`OpenAIProvider` takes exactly one of `getApiKey` (Chat Completions, unchanged
existing behavior) or `account` (Responses API, this feature). The constructor
rejects both and neither. The method is an explicit user choice
(`agent_account_set_method`, see the auth-ui contract); there is no silent
fallback in either direction, and no silent switch to other billing.

## Configuration (`phase1/src/lib/agent/openAIAccount.ts`)

`OPENAI_ACCOUNT_OAUTH_CONFIG` holds the shared values. Endpoint allowlist is
hardcoded and fail-closed (binding rule from the wave-3 research):

- authorize/token: `https://auth.openai.com/api/accounts/...` only; never
  adopt URLs from a fetched discovery document for token traffic.
- ID-token verification (oauth-client branch): JWKS only from
  `https://auth.openai.com/.well-known/jwks.json`, RS256/PS256 only, `kid`
  must be in the JWKS, `aud` must equal the issued `oaiapp_...` client ID,
  `exp` and `nonce` checked, `iss` must be exactly `https://auth.openai.com`
  (auth0.openai.com is rejected; the generic discovery there is Auth0 legacy).
  On any mismatch: abort the login, store nothing.
- Discovery (`openidConfiguration`) is a drift check, never a runtime anchor.
- Revocation: only to allowlist hosts; logout always deletes locally first.
- Extending the allowlist needs a real live test and a documented owner
  decision.

`openAIAccountConfigStatus()` / `requireOpenAIAccountConfig()` validate the
config fail-closed (including the pinned issuer/JWKS) without logging values.

Not in the shared config, by design: the stable `ext_agent_host_id`
(urn:uuid, persisted per installation BEFORE first login), the issued
per-account `client_id` (`oaiapp_...`; `dynamic_agent_client` is only the
first-registration entrypoint), and the tokens themselves. Those belong to
the token store (`feature/oauth-store`).

## Seam to the OAuth client / token store

The provider consumes only `OpenAIAccountAuth`:

```ts
interface OpenAIAccountAuth {
  getAccessToken(signal?: AbortSignal): Promise<string>; // honest account-auth error when unusable
  refresh(signal?: AbortSignal): Promise<string>;        // forced refresh after a 401
}
```

Requirements on the implementation (from the token reference): access tokens
live 1h; refresh tokens live 30d and ROTATE on every refresh - persist the
replacement with the access token and granted scopes before discarding the
old set; serialize refreshes single-flight; preserve credentials on temporary
network/infrastructure failures (503 codes); only terminal refresh failures or
confirmed revocation lead to re-login. `agent_account_disconnect` deletes only
the OAuth record; the API key stays (auth-ui contract).

## Requests with an account token

- Inference: `POST https://api.openai.com/v1/responses` with Bearer account
  token, `store: false`, `stream: true`, `instructions` for system content
  (explicit system message items are rejected on this route), `input` as an
  array, function tools only (`{type:'function', name, description,
  parameters}`). Web search is a hosted capability subject to model and
  account policy; Somnia never sends it.
- Never sent (route rejects them): `temperature`, `top_p`, `max_output_tokens`,
  `previous_response_id`, `metadata`, `background`, `conversation`,
  `max_tool_calls`, `moderation`, `multi_agent`, `prompt`,
  `prompt_cache_retention`, `safety_identifier`, `top_logprobs`, `truncation`,
  `user`. Consequence: the server-side output-token budget does not exist in
  account mode; the session's client-side turn/output limits still apply.
- Message mapping: user -> `input_text`; assistant text -> `output_text`;
  assistant tool calls -> `function_call` items; tool results ->
  `function_call_output`. Full history is sent each request (no
  `previous_response_id`).
- Model discovery: `GET /v1/models` with the account token.
- Streaming: own SSE parser over the Responses event model
  (`response.output_text.delta`, `response.output_item.added`,
  `response.function_call_arguments.delta/.done`, `response.completed`,
  `response.incomplete`, `response.failed`, `error`). A terminal
  `response.completed`/`response.incomplete` is required; unknown event types
  are ignored for forward compatibility; everything consumed is validated.
  Cross-checked against the MIT references anomalyco/opencode `codex.ts` and
  badlogic/pi-mono `openai-codex-responses.ts` (read, not copied; both MIT).

## 401 -> refresh -> retry

In account mode a single HTTP 401 (before any streamed output) triggers one
forced `refresh()` and one immediate retry with the new token. Concurrent
requests share one in-flight refresh (provider-level single-flight, in
addition to the store-level serialization). A second 401, a failed refresh or
an unusable token is an honest `account-auth` error ("reconnect the account
or switch back to an API key"), redacted from store/server details. API-key
mode never refreshes and keeps its existing `auth` error shape.

## Error mapping (codes only; provider text is never surfaced)

| SIWC code / status | Detail | Retryable |
| --- | --- | --- |
| `subscription_sharing_invalid_user` (401), any 401/403 after the refresh retry | `account-auth` (re-login) | no |
| `subscription_sharing_user_not_eligible` (403) | `not-eligible` (Plus/Pro required) | no |
| `subscription_sharing_usage_limit_exceeded` (429) | `usage-limit` (point to ChatGPT usage settings; no reset-time guessing) | no |
| `subscription_sharing_unsupported_capability` (400) | `no-tool-support` (remove the unsupported input; do not retry the same body) | no |
| `subscription_sharing_route_not_supported` (403) | `model-not-found` | no |
| `subscription_sharing_usage_unavailable` / `_user_unavailable` (503) | `server` | yes, bounded backoff |
| `response.incomplete` with `max_output_tokens` / `content_filter`; refusal deltas | `output-tokens` / `moderation` | per taxonomy |

User-facing texts live in `describeAgentError` (`errors.ts`) via the new
details `account-auth`, `not-eligible`, `usage-limit`.

## Tests

`phase1/src/lib/agent/openAI.account.test.ts` (node:test via tsx, 13 tests):
Responses wire format and restricted-field absence, event mapping, single
401-refresh-retry and its failure modes, SIWC error codes incl. retryable 503s,
terminal semantics, single-flight refresh, model discovery, consent gating,
constructor validation, config validation, token hygiene. Run:
`npx tsx --test src/lib/agent/openAI.account.test.ts` (all 170 agent tests stay
green; `npm run typecheck` clean).

## Open points for the builder

- Wire the store implementation of `OpenAIAccountAuth` into the provider
  factory (`panelBridge.ts`, owned by other branches) and select the method
  from `agent_account_set_method` state; pass `endpoints` only for tests.
- Native transport: the Rust `provider_transport.rs` allowlist covers only the
  API-key endpoints today; account mode needs `POST /v1/responses` (and the
  auth.openai.com token traffic) allowlisted there with the same fixed-host
  rules. Owned by the oauth-store/client branches.
- Owner live test with a real eligible ChatGPT Plus/Pro account is pending;
  nothing here was verified against production.
