# Official Sign in with ChatGPT contract

Provider documentation checked 7 October 2026. This is a source-verified provider
contract, **not a claim that Somnia implements it**. Implementation remains pending
in the inspected baseline. The official route is distinct from imitating Codex's
OAuth client or importing its token file.

## Registration and sign-in

The [official sign-in guide](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
describes a public-client flow with no client secret or partner API key:

- Persist a stable installation/host ID before opening the first login. A UUIDv4
  prefixed with `urn:uuid:` is a supported format. Restart, sign-out and switching
  profiles do not create a new host. The [overview](https://developers.openai.com/siwc/token-sharing-open-source)
  also recommends optional public-key thumbprint host IDs.
- Open the system browser at `https://auth.openai.com/api/accounts/authorize`.
  Use `response_type=code`, fresh state and nonce, PKCE S256, and resource
  `https://api.openai.com/v1`.
- Start a listener first, bound to `127.0.0.1`, with redirect
  `http://127.0.0.1:<port>/auth/callback`. Across attempts only the port may vary.
  Use the exact same URI in authorization and exchange, never substitute localhost.
- Request `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`.
- For initial registration use `client_id=dynamic_agent_client`, the saved
  `ext_agent_host_id`, and consistent `agent_name_hint=Somnia`.
- Validate state on success and denial. Initial success returns an issued client ID,
  such as `oaiapp_...`. Missing issued ID is incomplete registration.
- Exchange the code by form POST to
  `https://auth.openai.com/api/accounts/oauth/token` with authorization-code grant,
  issued client ID, code, verifier, matching redirect and resource. Never exchange
  with or persist the bootstrap `dynamic_agent_client` as the issued identity.
- Validate ID-token signature against published JWKS, issuer, audience equal to
  the issued client ID, expiration and original nonce. Verify returning identity
  before replacing an account's credentials. Email is not a workspace identifier.
- Granted token-response scope, not requested scope or callback text, determines
  `chatgpt.tokens.use.direct` entitlement. Identity sign-in alone is insufficient.

Reauthorization reuses that registration's issued client ID and host ID, with fresh
state/nonce/PKCE. Omit `agent_name_hint`. If present, retained ID-token and email hints
must belong to the selected registration; redact authorization URLs with hints.
Reject a different callback client ID instead of silently replacing the registration.
Keep separate registration records even if two accounts share an email address.

## Token lifecycle and sign-out

[Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
and [token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference):

- Token response carries access, refresh and ID tokens, token type, expiry, granted
  scopes and `earliest_refresh_at`. Current docs describe one-hour access tokens
  and 30-day refresh tokens. Use returned metadata rather than hardcode UI promises.
- Form POST a refresh-token grant to the SIWC token endpoint using the issued
  client ID, saved refresh token and resource; omit scope to retain the grant.
- Refresh rotates the token and renews the 30-day lifetime. Save the replacement
  token set together and serialize same-session refresh across processes. If
  storage fails after rotation, do not pretend the old token remains usable.
- On sign-out stop requests, attempt revocation, then clear local tokens. Retain
  account/client mapping and host ID for later sign-in; removing a registration is
  a separate lifecycle decision.
- The sessions guide directs discovery of `revocation_endpoint` from
  `https://auth.openai.com/.well-known/openid-configuration`, followed by form POST
  of refresh token, `token_type_hint=refresh_token` and issued client ID. Empty HTTP
  200 indicates success, including an already-invalid token.
- If remote revocation cannot be confirmed, clear local tokens and say so. The
  user can disconnect the app in ChatGPT Settings. Local deletion is not remote proof.

### Discovery/issuer mismatch: unresolved

The fetched [discovery document](https://auth.openai.com/.well-known/openid-configuration)
on 7 October 2026 identifies issuer `https://auth0.openai.com/`, authorization endpoint
`https://auth.openai.com/authorize`, token endpoint `https://auth0.openai.com/oauth/token`
and revocation endpoint `https://auth0.openai.com/oauth/revoke`.

In contrast, the SIWC sign-in example records issuer `https://auth.openai.com`, the
SIWC token reference names that production issuer, and the SIWC flow uses the
`/api/accounts/...` authorize/token routes above. The token-reference claim concerns
access tokens; it must not alone establish the ID-token issuer contract.

Somnia's selected fail-closed implementation contract is:

1. Pin SIWC authorize/token/refresh to the `/api/accounts/...` allowlist above.
   Discovery does not supply runtime token destinations; use it only to detect drift.
2. Validate ID tokens using `https://auth.openai.com/.well-known/jwks.json`, require
   RS256 or PS256 and a matching JWKS key ID, verify signature, issued-client-ID
   audience, expiration and nonce, and require issuer exactly
   `https://auth.openai.com`. Do not accept `https://auth0.openai.com/`. On mismatch,
   abort login and save no tokens. This is the selected validation rule, not an
   inference that the discovery document is consistent or a live-token test result.
3. Revocation remains a source-contract ambiguity. Never forward a token to an
   unreviewed discovery URL. Restrict any revocation attempt to explicitly reviewed
   destinations; always finish local token deletion. If remote outcome is unknown,
   report that and direct the user to disconnect in ChatGPT Settings.
4. Expanding issuer or destination acceptance requires a reviewed, documented
   decision based on actual verified provider behavior, not a generic retry fallback.

**TODO - implementation verification:** inspect these controls in the delivered
Rust code. No real account, ID token, sign-in, exchange, refresh or revocation has
been tested here. A packaged-app account test remains required before release.

## Model discovery and inference

[Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference):

- GET `https://api.openai.com/v1/models` with the selected account's bearer token.
  This route returns a `models` array with `slug`, `display_name` and `visibility`,
  not the API-key adapter's `data`/`id` catalog. Refresh on account switch.
- POST `https://api.openai.com/v1/responses` with that access token. Do not use
  `chatgpt.com/backend-api`, Chat Completions or another app's registered client.
- Set `store:false`, `stream:true`, and send required history as an input array.
  Use instructions or developer messages rather than explicit system message items.
- Only `response.completed` establishes completed inference. Handle
  `response.failed`, `response.incomplete` and interrupted streams separately.
  Usage errors can occur after streaming starts. Do not replay an uncertain request.

[Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
exclude `temperature`, `top_p`, `max_output_tokens`, `previous_response_id` over HTTP,
`metadata` and other listed fields. Function/custom tools are supported under the
documented placement rules; web search is subject to model/account policy. Hosted
MCP/connectors, file search, Code Interpreter, image generation, native computer use
and Responses tool search are unsupported. Do not confuse local tools conveyed by
function calls with hosted tool support.

## Error handling and billing

[Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery):

| Exact code | Status | Recovery |
| --- | --- | --- |
| `subscription_sharing_user_not_eligible` | 403 | Explain selected user/workspace/policy restriction; no OAuth loop |
| `subscription_sharing_usage_limit_exceeded` | 429 | Pause plan requests; direct user to ChatGPT Settings > Usage; do not guess reset |
| `subscription_sharing_usage_unavailable` | 503 | Preserve credentials; bounded later retry |
| `subscription_sharing_unsupported_capability` | 400 | Inspect parameter; fix unsupported request, not replay |
| `subscription_sharing_route_not_supported` | 403 | Check method and endpoint |
| `subscription_sharing_invalid_user` | 401 | Diagnose; reauthorize after confirmed revocation or terminal refresh error |
| `subscription_sharing_user_unavailable` | 503 | Preserve credentials; bounded later retry |

On unusable refresh-token errors, clear unusable tokens and repeat OAuth with the
saved issued client ID. `invalid_client` needs configuration repair. Not all errors
have an API error object; admission failures may contain only diagnostic `detail`.
Keep sanitized codes/status/request IDs, not raw token-bearing diagnostics.

There is no automatic switch to another billing path. If plan permission was not
granted, explain that and offer an explicit separately selected API-key connection.
Never silently send the same task through paid API billing.

## Eligibility and policy claims

The [official cookbook, published 28 September 2026](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)
describes eligible ChatGPT Plus and Pro users authorizing plan usage for an
open-source app. The route is documented, not a Codex-client impersonation workaround.
It does not establish unlimited allowance, access for every workspace, availability
in every distribution or a guarantee of no account risk. Current preview limits,
user consent, provider policy and registration correctness still apply.
