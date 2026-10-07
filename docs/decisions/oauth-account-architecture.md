# ADR: Provider account authentication

Date: 2026-10-07. Status: proposed, documentation only.
Base: `somnia-agent` at `bb9d1fab7682f402a6a88280e69dd0ab71640b81`.

## Decision

Use OpenAI's documented open-source Sign in with ChatGPT (SIWC) direct OAuth flow. It uses dynamic registration, Authorization Code + PKCE S256, the system browser and native loopback callback. Account tokens remain in Somnia's native credential broker. Inference goes to the documented API resource, not the Codex backend. API-key authentication remains independently selectable. Never reinterpret an account token as an API key or silently switch to paid API billing. No implementation, library, installer or CI changes are made here. [S1-S6]

The official SIWC contract removes the need to reuse Codex's first-party client ID. Codex app-server is a documented alternative, not the primary route. Account identity alone is not permission for ChatGPT plan inference or permission to send project content. Existing cloud consent, file-access controls and per-hunk diff review remain mandatory.

The discovery mismatch is real. Apply the fixed fail-closed policy in section 11. No real account login, token issuance, revocation or inference was tested in this work. An owner-controlled sign-in test remains a release gate.

## 1. Existing code and integration boundaries

Inspected the recorded base, including its conversion commits:

| File | Current behavior | Later integration |
| --- | --- | --- |
| `phase1/src-tauri/src/desktop.rs` | Trusted-editor command gate; keyring presence/save/delete; bounded provider streams | Account broker commands, connection-generation ownership, refresh/revoke |
| `phase1/src-tauri/src/provider_transport.rs` | Fixed URL/method allowlist; OpenAI Chat Completions and models | Separate SIWC Responses/models route policy |
| `phase1/src-tauri/src/agent_settings.rs` | Non-secret preferences; unknown fields rejected | Separate versioned connection selection |
| `phase1/src/lib/agent/providerAuth.ts` | Metadata-only key validation; native presence marker | Connection summaries, method-aware failures |
| `phase1/src/lib/agent/nativeProviderFetch.ts` | Secret-free IPC stream wrapper | Opaque connection selection, never account tokens |
| `phase1/src/components/agent/ProviderAuthentication.tsx` | Test/save/rotate/delete keys; cancel stale operations | Method/account picker and login states |
| `phase1/src/lib/agent/settings.ts` | Provider/model/prompts only; blank key on load | Selection migration, no credential persistence |
| `phase1/src-tauri/src/applog.rs` | Sensitive-field redaction | Exclude auth/callback URLs, ID-token hints and private responses |

Existing keyring service is `de.philipp-paulik.somnia.agent`; entry names are provider IDs. Keep these intact. `provider_http_start` currently obtains a saved key or uses a candidate key for a metadata GET. Neither `candidate_key` nor `somnia-native-key` is an account-auth abstraction.

## 2. Provider-scoped abstraction

Define provider, method and connection separately:

- `ProviderId`: `openai | claude | openrouter | ollama`.
- `AuthMethod`: `apikey | oauth-account | none`.
- `ConnectionId`: native-generated opaque UUID, never email/token or a renderer-selected storage key.
- `ConnectionSummary`: ID, provider, method, stable display label, auth state and billing/capability labels. Verified email is for the account picker only, not logs.
- Selection: provider + method + connection ID + generation. Every request snapshots one selection; switching cancels obsolete streams instead of retargeting them.
- Private account envelope: schema version, connection ID, verified issuer/subject, issued client ID, host ID, display identity, access/refresh/retained ID tokens, granted scopes, receive/expiry/earliest-refresh timestamps, generation.

Account identity is `(issuer, subject, issued client_id)`, not email alone. Support separate registrations with the same email. The native broker owns endpoint policies, credential access, header injection, refresh and revocation. Renderer commands never return a token, verifier, ID-token hint or token-bearing URL.

| Provider | Enabled methods | Decision |
| --- | --- | --- |
| OpenAI | API key; SIWC account after verification | Separate API billing and ChatGPT plan adapters |
| Claude | Existing API key | No account/subscription login inferred in this wave |
| OpenRouter | Existing API key | Its PKCE flow returns an API key, not a rotating account session; future adapter must model that distinction [S12] |
| Ollama | Existing local no-auth | No artificial account requirement |

Proposed native commands: list summaries; start/cancel an account attempt; select an existing connection with expected generation; sign out with expected generation. Extend provider transport to take an opaque connection ID and approved operation/body. All retain the trusted-editor gate and check provider ownership. Attempt/stream IDs are bound to trusted window and connection generation. Do not enable non-working account buttons for unsupported providers or browser preview.

## 3. SIWC registration and loopback flow

This is SIWC OSS registration, not first-party Codex login. [S1, S8-S9]

1. Generate and persist a stable `ext_agent_host_id=urn:uuid:...` for this installation **before** first login. Use an exclusive native file lock, owner-only config, fsync/atomic replacement. Reuse across sign-out/account switch; never derive from hardware/email or export/sync across machines.
2. Keep a pending login separate from the active connection. Bind it to provider, selected registration, trusted window and generation. Initially allow one pending attempt per provider.
3. Start a bounded native listener on `127.0.0.1:0`, then obtain its port. Callback is exactly `http://127.0.0.1:<port>/auth/callback`. Never bind LAN/0.0.0.0, substitute localhost, change the path or kill a process using Codex's port.
4. Generate cryptographically random state, nonce and verifier (at least 32 random bytes each). Encode base64url without padding; challenge is SHA-256(verifier). Keep transient data native-memory-only with a 10-minute deadline. Restart/cancel uses a fresh attempt, not persisted PKCE material.
5. Open the system browser at `https://auth.openai.com/api/accounts/authorize`, with individually encoded parameters:

| Parameter | Value |
| --- | --- |
| `response_type` | `code` |
| `client_id` | New: `dynamic_agent_client`; returning: saved issued ID |
| `agent_name_hint` | `Somnia`, initial registration only |
| `ext_agent_host_id` | Persisted host ID |
| `redirect_uri` | Exact listener URI including port and `/auth/callback` |
| `scope` | `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct` |
| `resource` | `https://api.openai.com/v1` |
| `state`, `nonce` | Fresh pending values |
| `code_challenge_method` | `S256` |
| `code_challenge` | Derived challenge |
| Returning optional hints | Retained account ID token as `id_token_hint`, validated email as `login_hint`; same selected registration |

6. Listener accepts only bounded GET requests on its exact path/host/port. Reject duplicates of security-critical parameters, malformed encoding, fragments and oversize requests. Constant-time state check precedes success **and** `access_denied`. Unmatched requests do not consume the attempt. Consume a matched callback once before exchange; close listener on terminal paths. Browser-launch failure cancels the attempt.
7. Initial callback must supply code, state and issued `client_id` (such as `oaiapp_...`). Never store/exchange using `dynamic_agent_client`. Returning callback may omit client ID, but a supplied different one is rejected. Callback scope is not the granted-scope authority.
8. Form POST to `https://auth.openai.com/api/accounts/oauth/token`: `grant_type=authorization_code`, issued client ID, code, verifier, exact same redirect URI and resource. No client secret or partner API key. Reject network redirects. Code exchange `invalid_grant` requires a fresh authorization, not unlimited code reuse. An issued but unvalidated registration remains pending, not an active account.
9. Verify ID-token signature only with `https://auth.openai.com/.well-known/jwks.json`, RS256 or PS256 and matching `kid`; require issuer exactly `https://auth.openai.com`, audience equal to issued client ID, original nonce, expiry and nonempty subject. Apply bounded clock skew and authorized-party checks for multiple audiences. Reject `none`, symmetric verification, token-selected JWKS/issuer and unverifiable claims. Unknown key ID may trigger one trusted JWKS refresh.
10. Returning verified identity must match the selected registration before replacement. Different subject/client requires a separate registration. Grant is read from the token response. A valid ID token without `chatgpt.tokens.use.direct` means signed-in identity with plan usage disabled, never ready for generation.
11. Store/read back the validated credential envelope before durable success. Apply only if pending generation remains current. Static callback page contains no account/code/token, no third-party assets, restrictive CSP and `Cache-Control: no-store`. Never log auth URLs containing hints. Clear pending secrets on every terminal path.

Only the loopback port may vary across later sign-ins. Scheme, host and path remain the same. No WebView login or website callback relay is required.

## 4. Deep-link policy: `somnia://`

**Not a SIWC OAuth redirect.** The documented OSS flow requires the HTTP loopback callback. Do not use `somnia://auth/callback`, forward codes/tokens through a scheme or substitute a relay when loopback is blocked. [S1]

Optional future `somnia://auth/return` is a focus hint only: opens connection settings, with no code/token/state/account/client ID or success assertion. Broker state determines success. Primary login must work without a protocol handler.

A future provider-supported custom scheme needs a separate registered exact redirect and threat model. `somnia` can be claimed by another local app; PKCE mitigates stolen-code exchange but not handler denial-of-service. Prefer verified/reverse-domain app binding where supported. [S8]

For optional focus links, statically configure Tauri deep-link handling, strictly parse scheme/host/path and never log argv. Windows/Linux links launch a process; single-instance plugin with deep-link integration must initialize first. macOS registration is static and tested in an installed bundle; Linux AppImage moves can invalidate registration. Test NSIS/MSIX, macOS and Linux separately. Fake command-line links remain untrusted. [S10]

## 5. Credential storage and migration

Keep existing API-key entries untouched. OAuth has a separate service, e.g. `de.philipp-paulik.somnia.agent.oauth.v1`, keyed by opaque connection ID. Store tokens, retained ID token, account metadata, scopes, expiry and generation in one versioned protected envelope; host ID/selection are separate privacy-sensitive non-secret native settings.

Use a per-registration mutex and cross-process app-data file lock for mutation; keyring is not a lock. Reload after locking. Never hold the global settings mutex across browser/network waits. Define one consistent lock order for refresh/logout/migration.

No plaintext credential or browser-storage fallback. Verify platform credential size limits and replacement/readback semantics, especially Windows envelope size and Linux Secret Service availability. If envelope exceeds keystore limits, block until a separately reviewed encrypted-at-rest design with its wrapping key in the OS store is implemented/tested. A write failure is not saved success; stop using unsaved new tokens and attempt safe revocation where verified.

Migration is idempotent and requires no generation/network probe:

1. Presence-check old provider entries; locked store is an error, not no key.
2. Map each existing key to an API-key connection without moving/deleting/rotating the secret. Preserve prior provider/model/prompts and API-key selection. Ollama remains no-auth.
3. Persist auth selection in a separate versioned file, or coordinate a parser migration. Existing Rust preferences use `deny_unknown_fields`; injecting new fields into that file breaks old readers.
4. Account login creates separate credentials and selection. Sign-out never deletes an API key; key deletion never revokes an account.
5. Interrupted migration repeats the same legacy mapping. Downgrade still sees legacy keys/preferences. Browser preview remains session-key-only and account login desktop-only.
6. Never export account records, host ID or tokens through preferences, project ZIPs, collaboration or diagnostics.

## 6. Token lifecycle and request concurrency

Access lifetime is documented as one hour; use actual `expires_in` and receive time. Refresh tokens last 30 days; each successful refresh rotates to a replacement with a fresh 30-day lifetime. Save `earliest_refresh_at` and honor the server's renewal bound; verify its exact representation, never guess units. Refresh is lazy/on demand, not an idle keep-alive. [S2, S5]

Under per-registration cross-process lock, reload current envelope and join a single-flight renewal. Form POST to the fixed token endpoint with `grant_type=refresh_token`, issued client ID, current refresh token and resource; omit scope. Never use `dynamic_agent_client`. Validate response/grant/expiry and persist the replacement refresh token, access token, scopes and timing together before unblocking starts. If a new ID token exists, validate signature/issuer/audience/subject against that account; do not invent a refresh nonce.

Remote rotation and local storage are not one atomic transaction. Write failure/crash can lose a replacement; timeout can mean the remote server already rotated. Mark renewal uncertain, stop unsafe automatic reuse, and use controlled recovery/reauthorization. Do not endlessly retry the old token.

Terminal refresh errors (`invalid_grant`, invalid/expired/invalidated/reused refresh token codes) clear unusable tokens, retain account/client mapping and host ID, and offer sign-in again. `invalid_client` is configuration failure. Temporary network/5xx does not delete working credentials. [S4]

Selection changes/sign-out increment generation, block new starts and cancel old streams. Late login/refresh replies cannot resurrect the account. No generation replay after output/tool execution or ambiguous disconnect. Never automatically repeat edits after partial streaming.

### Sign-out and revocation

Stop account use first. SIWC docs prescribe a form POST of refresh token, issued client ID and `token_type_hint=refresh_token` to discovery's revocation endpoint, with empty HTTP 200 as success. But discovery conflicts with SIWC. Remote revocation must remain disabled until an exact endpoint on a reviewed allowlisted host is verified; do not invent a path or send a token to the discovered Auth0 route. [S5, S11, S14]

Always attempt local deletion and clear memory regardless of remote result. With an established endpoint use bounded transient retry, never a hidden token-retaining job. Retain client/account mapping, not tokens. Return independent local and remote outcomes:

- Local deletion done, remote unconfirmed: "Signed out on this device. Remote revocation could not be confirmed. Disconnect Somnia in ChatGPT Settings."
- Local deletion failed: "Sign-out is incomplete. Unlock the credential store and retry." Current process still blocks use; do not claim tokens were deleted.

## 7. Inference adapter and billing boundary

API key = OpenAI API billing. Account = ChatGPT plan. Display the active route beside the connection. Switching must be explicit. Existing API key transport is not automatically converted by account login.

SIWC native allowlist: `GET https://api.openai.com/v1/models`, `POST https://api.openai.com/v1/responses`. Token/JWKS/auth traffic has separate fixed policy. Bearer injection is native. Never send account tokens to Codex backend, other providers, proxies or arbitrary renderer URLs; do not inject Codex headers or interpret opaque access-token auth metadata. [S2-S3]

SIWC serializer: `store=false`, `stream=true`, array `input` with needed history; `instructions` or developer messages, no explicit system-message items. Omit `previous_response_id` on HTTP. Omit `background`, `conversation`, `max_output_tokens`, `max_tool_calls`, `metadata`, `moderation`, `multi_agent`, `prompt`, `prompt_cache_retention`, `safety_identifier`, `temperature`, `top_logprobs`, `top_p`, `truncation`, `user`. Do not spread generic API settings into this body. [S6]

Initial Somnia tools use function/custom types with existing local access/review controls. Although the docs allow model/policy-dependent web search, do not enable it in this wave. Hosted MCP/connectors, native computer use, Code Interpreter, file search, image generation and `tool_search` are unsupported. Local tool execution does not make unsupported wire types valid. Discover models with the selected account, not its API-key counterpart. [S3, S6]

HTTP 200/text deltas are not completion. Require `response.completed`; handle failed/incomplete/truncated streams and late usage failures separately. Buffer complete tool arguments before execution, never auto-apply partial edits. Connection tests use metadata only, never paid inference. Existing cloud consent remains separate.

## 8. UI states and recovery

Account auth does not create a Somnia cloud account or collaboration identity. Keep controls in existing settings/panel, with method picker and distinctly labeled saved registrations, including same-email cases.

| State | UI/action | Inference |
| --- | --- | --- |
| disconnected | Continue with ChatGPT / Use API key | No |
| preparing / awaiting-browser | Preparing / Finish in browser; cancel | Previous connection unaffected |
| exchanging / validating / saving | Finishing sign-in; guarded completion | New account not usable |
| ready | Verified account + ChatGPT plan; switch/sign out | Existing privacy/model gates |
| refreshing | Renewing session | New starts wait |
| plan-permission-disabled | Enable plan usage or Use API key | No |
| reauth-required | Sign in again | No |
| ineligible | Explain plan/workspace/policy restriction | No OAuth loop |
| usage-limited | ChatGPT Settings → Usage | Pause plan starts |
| network-unavailable / renewal-uncertain | Retry later or safe session recovery | No unsafe reuse |
| keystore-locked / persistence-error | Unlock/retry; no plaintext fallback | No new account use |
| configuration-error | Safe diagnostic reference; API-key option | No |
| signing-out / revocation-unconfirmed | Separate local/remote result | No |

Use accessible status/live regions, actionable alerts and stable keyboard focus; no spinner-only states. Disabled methods do not get stub buttons. Follow approved Continue with ChatGPT branding at UI implementation. A valid identity without plan scope remains signed in but unusable for inference. Explicit enable-plan action repeats OAuth with saved client ID/full scopes; documented `prompt=consent` precedes unconfirmed `force_reconsent` rollout. Never force every returning login. [S4]

Error mapping [S4]:

- `access_denied`: validate state, cancel, preserve active connection.
- `subscription_sharing_user_not_eligible` (403): restriction, no repeated request/login.
- `subscription_sharing_usage_limit_exceeded` (429): pause plan requests; Usage settings; no guessed reset time or claim the entire plan is exhausted.
- `subscription_sharing_usage_unavailable` / `subscription_sharing_user_unavailable` (503): preserve credentials, bounded temporary backoff, no midstream replay.
- `subscription_sharing_invalid_user` (401): diagnose scope/identity/refresh; re-login after confirmed revocation/terminal refresh failure.
- `subscription_sharing_unsupported_capability` (400): identify parameter, do not repeat same invalid body.
- `subscription_sharing_route_not_supported` (403): integration error, no endpoint/billing switch.
- `chatpass_v2_scope_not_authorized` / `chatpass_v2_invalid_authorization_context`: grant/configuration error.
- Other admission 401/403/503 or `{detail: ...}`: keep safe status/category, never invent a machine code.

Preserve request ID/status/known code/event type in sanitized diagnostics, not raw error body, private content or HTML. A limit can arrive in `response.failed` after streaming began.

## 9. Fallback and alternative decisions

API key is the official explicit fallback. Existing saved key stays intact and is only used when selected, with API billing clearly labeled. Ollama is another explicit provider choice, never an automatic substitution.

Loopback blocked: cancel; retry fresh port/attempt or offer API key. No token paste, embedded login, relay, undocumented device flow or custom-scheme replacement.

Codex app-server is a documented later option (Apache-2.0 upstream), but introduces binary packaging, RPC/version dependency and a different tool-control model. The SIWC app-server guide's `env_key` setup receives app-managed tokens; renewal can require restart and thread resume. Do not conflate this with first-party Codex-managed login. It must not bypass Somnia per-hunk review. [S7]

Codex first-party client ID/backend is rejected: OSS source license is not OAuth client identity permission. Website partner identity login is also distinct from OSS plan-sharing scopes. SIWC is the direct documented route.

## 10. Libraries and license constraints

No libraries added. Checked candidate version metadata on crates.io, not claimed latest versions. Existing dependency families are reused when suitable. Final adoption requires pinned/transitive security and license review.

| Candidate checked | License | Purpose |
| --- | --- | --- |
| keyring 3.6.3 (existing) | MIT OR Apache-2.0 | OS credential storage |
| reqwest 0.12.24 (existing family) | MIT OR Apache-2.0 | Fixed HTTPS, no redirects |
| sha2 0.10.9 (existing family) | MIT OR Apache-2.0 | PKCE |
| rand 0.8.5 | MIT OR Apache-2.0 | OS-backed randomness |
| base64 0.22.1 | MIT OR Apache-2.0 | PKCE encoding |
| url 2.5.7 | MIT OR Apache-2.0 | Parsing/encoding |
| zeroize 1.8.2 | Apache-2.0 OR MIT | Best-effort cleanup, not all-copy erasure |
| oauth2 5.0.0 | MIT OR Apache-2.0 | Optional grant helpers |
| openidconnect 4.0.1 | MIT | Preferred OIDC validation candidate |
| jsonwebtoken 9.3.1 | MIT | Alternative only with complete application OIDC checks |
| tauri-plugin-opener 2.5.2 | Apache-2.0 OR MIT | Native allowlisted browser launch |
| tauri-plugin-deep-link 2.4.5 | Apache-2.0 OR MIT | Optional focus link |
| tauri-plugin-single-instance 2.3.4 | Apache-2.0 OR MIT | Optional focus routing |
| Codex upstream | Apache-2.0 | Alternative app-server; no copied source |

Provenance: `https://crates.io/api/v1/crates/<name>/<version>` metadata inspected for every row; Codex LICENSE inspected at checkout `1c7c43cd856a1ef451cb7ff9dc1b701ac7942c9d`. Use native standard/Tokio sockets for a bounded listener; no general web framework required. Never add a proxy/token-import convenience package. Source copying later requires license attribution/notices.

## 11. Open verification gates

1. **Confirmed discovery conflict:** live metadata at `https://auth.openai.com/.well-known/openid-configuration` returned Auth0 issuer `https://auth0.openai.com/`, `/authorize` and Auth0 token/revocation paths. SIWC pages specify `https://auth.openai.com` and `/api/accounts/...`. [S1-S2, S13-S14]
   - Fixed allowlist: auth `https://auth.openai.com/api/accounts/authorize`, exchange/refresh `https://auth.openai.com/api/accounts/oauth/token`, JWKS `https://auth.openai.com/.well-known/jwks.json`.
   - Discovery is a drift test only, never a runtime configuration anchor. Do not transmit tokens to discovery-selected endpoints.
   - RS256/PS256 only, matching key ID, exact SIWC issuer, issued-client audience, expiry and attempt nonce. Auth0 is not a permitted alternative; mismatch aborts and saves nothing.
   - Allowlist expansion requires a real test and documented owner decision. Revocation stays unconfirmed until its exact SIWC endpoint is verified. Always attempt local deletion; point to ChatGPT Settings when remote disconnect is unconfirmed.
2. **Live owner test:** no real account tested. Confirm eligibility, scopes, installed loopback/browser behavior, ID-token binding, model metadata and refresh behavior before release claims. Product direction targets eligible Plus/Pro users; do not promise all users/workspaces or unlimited usage.
3. **Storage:** verify envelope size, persistence/readback, platform key stores, concurrent process locks and crash recovery. No plaintext fallback.
4. **Refresh:** verify exact `earliest_refresh_at` representation and rotating-token failure behavior with current official contract/fixtures.
5. **Privacy/UI:** review scopes/hints/labels/redaction and cloud consent. Deep-link packaging remains optional, not a prerequisite for SIWC.

## 12. Implementation and verification plan

Later feature branches: native model/migration; host/loopback manager; OIDC/storage/refresh/revoke; SIWC Responses adapter; UI/account/billing states; installed platform owner-controlled tests. Integration remains centralized.

Fixture tests use `tsx --test` and `node:test`; native broker tests use `cargo test`. No Vitest. No real services or paid requests in tests. Required cases:

- RFC PKCE vector; random uniqueness; concurrent first-launch host ID; failed persistence prevents browser launch.
- Exact loopback URI, listener-before-browser, wrong host/path/state, duplicate fields, oversize/replay, timeout/cancel/restart.
- New issued ID mandatory; returning client/subject binding; same-email registrations; stale completion cannot change selection.
- Signature/algorithm/issuer/audience/nonce/expiry rejection; JWKS rollover; discovery mismatch fail-closed.
- Missing plan scope, explicit re-consent, no billing fallback; locked store is not missing key; idempotent key migration/downgrade.
- Single-flight and cross-process rotation; write/crash/ambiguous timeout; sign-out during refresh; late replies cannot resurrect.
- Revocation unconfirmed/local deletion failure; no hidden retries; strict credential/route matrix.
- Unsupported payload-field stripping; SSE split frames, failed/incomplete/no terminal event, late limits, cancellation/duplicate tool events. No partial edits or replay after execution.
- No token/code/verifier/ID-token hint/raw auth URL/private body in logs, browser storage, exports or collaboration.

This branch verifies document coverage with `node --test`, docs-only changes, `git diff --check`, bundle integrity and patch application against base. No runtime test result is claimed.

## Sources

Read 2026-10-07. Official SIWC docs govern protocol; standards govern security; repo findings use the exact base above.

- **S1** OpenAI sign-in: https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- **S2** OpenAI tokens: https://developers.openai.com/siwc/token-sharing-open-source/token-reference
- **S3** OpenAI inference: https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- **S4** OpenAI errors: https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery
- **S5** OpenAI sessions: https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- **S6** OpenAI limits: https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- **S7** OpenAI SIWC app-server: https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server ; general integration: https://developers.openai.com/codex/app-server/ ; source/license: https://github.com/openai/codex
- **S8** IETF native apps: https://www.rfc-editor.org/rfc/rfc8252
- **S9** IETF OAuth security: https://www.rfc-editor.org/rfc/rfc9700
- **S10** Tauri platform guidance: https://v2.tauri.app/plugin/deep-linking/ (the similar `/plugin/deep-link/` path did not resolve).
- **S11** IETF revocation: https://www.rfc-editor.org/rfc/rfc7009
- **S12** OpenRouter PKCE/key lifecycle: https://openrouter.ai/docs/use-cases/oauth-pkce
- **S13** OpenAI website identity/JWKS example: https://developers.openai.com/siwc/website
- **S14** Live conflicting discovery: https://auth.openai.com/.well-known/openid-configuration (not accepted runtime configuration).
- **S15** OpenAI overview: https://developers.openai.com/siwc ; cookbook: https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt
