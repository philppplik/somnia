# Provider authentication decision

Status: recommended design, not implemented. Evidence checked 7 October 2026.
Baseline: `somnia-agent` at `467071380187a133eb90eb94e37963b0501ad480`, the v11.1.1-beta.1 development line.
No real credentials, inference calls, client registration, paid services or CI were used.

## Decision

Build a native credential/HTTP broker first, then direct Anthropic and OpenAI API-key adapters. Add the official OpenAI ChatGPT-plan OAuth flow as a separate, feature-gated connection for Somnia's open-source/local distribution. Do not implement Claude.ai subscription login or copy another app's tokens.

The OS credential store is the right persistence layer. It is not yet a native-only security boundary: current code returns the stored key to React and makes authenticated OpenRouter requests there. Fix this before adding providers or refresh tokens.

| Stage | Build | Gate |
| --- | --- | --- |
| 1 | Native broker, per-connection records, scoped transport, OpenRouter key migration | Mock tests and real packaged-app credential tests on all three desktop OSes |
| 2 | Anthropic/OpenAI BYOK, discovery-only check, explicit account/billing labels | No secret-returning IPC; failure/permission checks; real inference only with separate cost approval |
| 3 | Official OpenAI OSS/local ChatGPT-plan OAuth | Somnia registration/eligibility, identity/scopes, refresh/revocation and secure persistence verified |
| Not now | Claude Code runtime bridge, WIF/cloud IAM, App Attest, org administration | Separate policy/architecture review |

No Somnia cloud account, shared vendor key, credential relay or hosted paid AI backend is required. These are recommended changes, not implemented features.

## 1. Provider options and boundaries

### Anthropic

Direct Claude API keys now include identity-backed personal keys and service-account keys. Current docs prefer these to legacy workspace keys. A key may be scoped to one workspace; an identity-backed key without that scope needs `anthropic-workspace-id` in requests. Personal keys act as the user and stop working after relevant access removal; service-account keys act as the service identity. Key expiration is selected at creation, subject to organization policy. [A1]

Current direct HTTP auth is `Authorization: Bearer <key>`, with required `anthropic-version`. Legacy `x-api-key` still works. Send one credential header, not both, to the official `https://api.anthropic.com` API. [A1, A2]

Anthropic explicitly forbids third-party apps offering Claude.ai login, collecting/storing/intermediating its credentials/session tokens, or routing requests with Free/Pro/Max subscription credentials. A Claude subscription is not authorization for Somnia's own API adapter. [A3]

Separate permitted case: products may run the unmodified official Claude Code binary under the published commercial conditions. Authentication must remain its own official flow, with usage billed directly to the end user. This does not permit extracting its tokens or imitating its login. Any future runtime bridge requires its own restricted execution and terms review. [A3]

Other options include Workload Identity Federation for cloud/CI/Kubernetes and App Attest for registered iOS/macOS apps. App Attest bills the developer workspace and authorizes Messages calls; it is neither a subscriber-login substitute nor a cross-platform Somnia BYOK solution. Cloud inference providers have their own IAM/billing. Defer these routes. [A1, A2]

UI: "Claude API" and "API usage is billed separately from a Claude subscription." Prefer a dedicated workspace-scoped personal key. Accept an intentionally admin-provisioned service-account key, but never require an org-wide or Admin API key.

### OpenAI

Direct API access uses Bearer API keys. Recommend a dedicated project and restricted user/project key with only the required discovery and Responses permissions. Service accounts exist for project-managed workloads; do not encourage sharing one secret across all employee desktops. Admin credentials are unnecessary. [O1, O2]

`OpenAI-Organization` and `OpenAI-Project` select context for multi-org or legacy user keys; they do not authenticate. Prefer project-scoped keys; place overrides in explicit advanced connection settings. [O1]

OpenAI now documents an official public-client OAuth route for open-source and locally hosted apps to request optional ChatGPT plan usage. It uses dynamic registration, PKCE, system browser, loopback callback and a stable host ID. Eligible inference uses the public Responses API. It grants no ChatGPT conversation/history access. Somnia's MIT/local distribution is a plausible fit, not verified eligibility or registration. Paid/remotely hosted variants have a separate interest/approval path. [O3, O4, O5]

Do not confuse that flow with generic website identity sign-in, which is a selected-commercial-partner trial and whose ID token alone grants no inference entitlement. Official Codex apps also support ChatGPT or API-key sign-in; an app-server bridge is a separate agent-runtime integration. Never import `~/.codex/auth.json` or another application's issued client identity. [O6, O7]

UI: separate "OpenAI API key" from "ChatGPT plan". API keys use API billing; plan usage consumes eligible account/workspace allowances and possibly user credits under their settings. No "free", "unlimited" or guaranteed model-access promise. Never silently fall back to API billing. [O2, O3, O8]

## 2. Baseline inspection

Inspected: `phase1/src-tauri/src/desktop.rs`, `agent_settings.rs`, `Cargo.toml`, `capabilities/editor.json`, and `phase1/src/lib/agent/{settings,panelBridge,openRouter}.ts`.

Already present in code: separate non-secret JSON preferences; keyring 3.6.3 with Apple-native, Windows-native and synchronous Linux Secret Service; blocking store operations off the async thread; in-process mutex; no plaintext secret fallback; browser preview persists only non-secret preferences. Native persistence is not proven by these code facts. [R1]

Concrete gaps:

- `agent_settings_load` returns the full key to React; `panelBridge` keeps it and renderer `fetch` sends it. Secure disk storage does not prevent renderer theft.
- A single keyring entry, `de.philipp-paulik.somnia.agent` / `openrouter`, cannot represent multiple providers/accounts.
- Save writes the key before preferences. Preference failure can leave a changed key with old metadata despite a failed-save message.
- Native gate checks the `main` window label. Keep it and prevent untrusted preview/extension/remote content from executing in that trusted window. Tauri capabilities restrict IPC, not arbitrary JS already inside an allowed renderer. [T1]
- Redaction must include all new key/token formats and authorization URLs with `id_token_hint`. It is defense in depth, not permission to log credentials.

## 3. Native broker and storage

Rust owns credential lookup, authenticated transport and OAuth callbacks/refresh. React receives summaries (`hasCredential`, state, masked label), model lists and normalized events, never stored secrets. No secret getter and no generic authenticated-fetch IPC.

Proposed typed operations: list/import/update/check/remove connection; begin/cancel OAuth; bounded approved inference/cancel. Host enforces connection, auth mode, fixed HTTPS origin and allowed path. Reject credential forwarding on redirects and arbitrary proxies. An enterprise gateway needs a separate connection type. Never disable TLS checks or let project/model/MCP/extension content choose an auth destination.

Pasted key import briefly crosses renderer memory unless a native secure input dialog is added. Clear the field after import; never return it later, persist it in React or put it in snapshots/logs. Native inference removes the long-lived renderer copy, not every possible import exposure.

Connection identity: opaque UUID + provider + auth type + account/registration + billing context. Conversations/model selection must stay tied to that connection. Non-secret settings can include label, project/org/workspace IDs, selected model, last discovery timestamp and credential generation. Protect account metadata too. OAuth identity binds verified issuer, subject and issued client ID; email is only a label and is not a workspace identifier. [O4, O9]

Keep OS storage: macOS Keychain, Windows Credential Manager, Linux Secret Service. Fail closed if locked/missing; offer explicit memory-only mode, never silent plaintext fallback. Ensure builds cannot accidentally select keyring's mock store. Do not encrypt local JSON with a key shipped in the app. [T2]

Use a versioned service namespace and non-empty connection/generation IDs. Store OAuth access/refresh/retained ID tokens, scopes and expiry as a logically consistent set. Check real backend size limits before choosing one JSON blob; Windows/backend limits may require multiple secret entries with durable generation-pointer recovery.

API-key replacement transaction: write new generation, durably commit metadata/pointer, then delete old generation. Preserve the prior active generation on failure and report orphan cleanup. OAuth refresh is harder: remote rotation may invalidate the old refresh token before local save succeeds. Persist/recover the replacement securely or stop and reauthorize; never claim old-token rollback is safe.

Serialize refresh and OS operations per connection across processes/windows. In-process mutex alone cannot guard multiple app processes. Cancel old work and reject stale generation events after switch/rotation/removal. Minimize secret lifetimes and zeroize Rust buffers where practical, without claiming protection against compromised OS/admin access.

Migration: copy only the existing OpenRouter key to a new OpenRouter connection, verify and commit its metadata before deleting the old slot. Make migration idempotent and partial-failure safe. Preserve custom prompts/model settings. Do not infer provider identity from a key prefix. Keep browser preview session-only; native OAuth is not a browser-preview feature.

## 4. Validation and test calls

"Check connection" is a user-initiated metadata call, not generation:

| Connection | Request | Success proves |
| --- | --- | --- |
| Claude API | GET `https://api.anthropic.com/v1/models`, key/version/workspace as required | Credential/context accepted for discovery at this time |
| OpenAI API | GET `https://api.openai.com/v1/models`, key and explicit context if needed | Discovery permission at this time |
| ChatGPT plan | Validate OAuth identity/scopes; GET same OpenAI model URL with selected account token | Authorized registration and current discovery, not completed inference |

OAuth catalog uses `models` with `slug`, `display_name`, `visibility`; API-key catalog uses `data`/`id`. Anthropic has its own data/pagination contract. Separate parsers. [A4, O5, O10]

No project content in checks. Bound time, response size and retries; support cancellation. Restricted keys can permit inference but deny discovery. Show "Model discovery is not permitted", not "Invalid key", and allow explicit model configuration.

Show dated "Connection checked", not "All models verified". Discovery proves neither selected-model inference/tool support nor credits, future availability or privacy guarantees. No automatic generation on save/startup/OAuth completion/model change.

Optional "Test selected model" needs separate confirmation of provider/account/billing path and possible money, credits or plan use. Tiny fixed prompt, no project content/tools, bounded output. Only a terminal completion proves that request; a stream can fail after initial success. No such call was made in this zero-cost assignment. Token counting is not a generation test. [A5, O5]

## 5. Official OpenAI OAuth requirements

Implement only the documented OSS/local public-client flow. [O3, O4, O9, S1]

1. Start listener bound to `127.0.0.1` before system browser. Fixed callback path; available port may vary between attempts. Use identical URI for authorize/exchange; never substitute `localhost`.
2. Fresh cryptographic state, nonce and PKCE verifier with S256. Expiring, one-use transaction bound to pending connection. Validate state even on error callbacks. Close listener on completion/cancel/timeout. No embedded password WebView.
3. Initial `client_id=dynamic_agent_client`, consistent `agent_name_hint=Somnia`, stable opaque `ext_agent_host_id`. Save issued callback client ID, never bootstrap ID. Reauthorization uses saved issued ID; reject mismatch.
4. Request `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`, resource `https://api.openai.com/v1`. Granted token-response scopes establish plan permission, not requested scopes or ID token alone. Decline leaves existing connection unchanged and triggers no paid fallback.
5. Rust code exchange without client secret; validate ID-token JWKS signature, issuer, audience against issued ID, expiry and original nonce. Check returning verified identity before replacing connection.
6. OS-store protected token set/retained ID token. Honor response expiry and `earliest_refresh_at`. Current docs describe one-hour access and 30-day rotating refresh lifetime; consume metadata rather than promise fixed lifetimes. Refresh near expiry with issued ID and resource, serialized per session. [O11]
7. Inference: POST `https://api.openai.com/v1/responses`, `store:false`, `stream:true`, selected account model. No private `backend-api`. Wait for `response.completed`; incomplete, failed and interrupted streams are separate outcomes.
8. Sign-out stops requests, attempts refresh-token revocation at discovered endpoint, clears local tokens. If unconfirmed, say local sign-out succeeded but remote revocation was not confirmed; direct user to ChatGPT settings. Retain client/host mapping for later sign-in; explicit connection removal deletes local mapping too. [O9]

Fetch discovery from the documented issuer and verify endpoint origins against fixed provider configuration. Never accept auth/discovery URLs from external project content. OAuth authorization is independent of Somnia's project-context consent.

## 6. Errors, quota and recovery

Connection states: not configured, stored unchecked, checking, connected, discovery denied, credential locked, reauthorization required, quota blocked, policy blocked, temporarily unavailable, removing. Keep auth/discovery/model-test status separate.

| Failure | Recovery |
| --- | --- |
| Store locked/unavailable | Unlock/retry or explicit session-only mode; no fallback or credential erasure |
| Invalid input | Reject empty key/control characters/oversize; prefix proves nothing |
| API 401 | Expired/revoked/malformed possible; replace key, no same-key retry loop |
| 403/404 workspace/model | Explain context/policy/access issue; do not automatically switch account |
| 400 | Fix request/config; Anthropic spend limit can also return 400 |
| 429 | Classify rate limit versus spend/credit/plan cap before deciding retry |
| Network/TLS/timeout/5xx/529 | Preserve credentials; bounded metadata retry; no TLS bypass |
| Unknown inference completion/stream failure | No automatic replay; explain uncertain remote usage |
| OAuth callback mismatch/denial | Stop pending flow; active account unchanged |
| Terminal refresh error | Clear unusable token set; reauthorize with saved issued ID |
| Persistence failure after refresh | Securely recover replacement or reauthorize; old rotating token is not safe rollback |

Anthropic 429 can mean tier spend cap without retry-after. OpenAI hard-spend limits also return 429. Current OpenAI docs support enforceable org/project caps with propagation overshoot; alerts alone are not caps. Older project-help text describes soft limits alongside a newer hard-limit section; use the current spend-limit guide, not a cent-exact promise. [A6, O12]

Plan codes: user-not-eligible/route/policy failures stop without OAuth loops; usage-limit-exceeded pauses and links ChatGPT Usage, with no guessed reset; temporary usage/user unavailable permits bounded later retry. Terminal refresh codes include invalid_grant, invalid/expired/invalidated/reused refresh tokens. Invalid client requires fixing registration. There is no disconnect notification: detect at request/refresh. [O8]

UI uses fixed safe text. Diagnostics retain only sanitized status, normalized code, request ID and time, never raw bodies/headers/callback URLs. Genuine transient metadata limits can use bounded backoff/retry hints. Billable inference retries default off; uncertain completion needs explicit user retry and cost/duplicate warning.

## 7. Rotation and revocation

API-key rotation: create replacement in console, import new generation, optional metadata check, atomic switch and cancel old work, then retire old provider key. Failed discovery must not destroy the working key or be treated as proof inference is forbidden.

"Remove from this device" is not provider revocation or deletion on other devices. Offer separate console revocation guidance; never collect Admin keys for convenience. Anthropic disable is reversible, delete archives permanently, and expired keys need replacement. OpenAI key revocation propagates within seconds; other permission changes can take longer. Do not promise cancellation of accepted inference. [A1, O1]

OAuth sign-out: discovery revocation endpoint, form POST refresh token, token_type_hint and issued client ID. Empty 200 is success, even already invalid. On network/5xx retry boundedly while token is available; otherwise clear locally and report remote-unconfirmed. No plaintext/token-bearing retry queue. [O9]

No invented universal static-key rotation interval. Support expiry/admin-policy reminders; OAuth refresh rotates automatically, API-key replacement belongs to owner. Leaks require provider-side revocation, not only local removal.

## 8. Acceptance and handoff

Use mock HTTP, mock store and fixture JWKS, not paid provider calls, for automated tests:

- No secrets in settings/export/logs/list/load IPC; no preview/extension/MCP access.
- Wrong account/provider/origin/redirect/workspace/generation rejected.
- Repeatable migration and accurate state after partial save/cleanup failures.
- OAuth state/nonce/replay/issued-ID/signature/audience/expiry/scopes/identity failure tests.
- Cross-process refresh serialization, rotated-token persistence/recovery, reused-token handling.
- Separate OAuth/API catalogs; discovery-denied does not become invalid-key.
- 400/401/403/404/429 rate versus cap/5xx/529/TLS/terminal-stream coverage.
- Removal/account switch cancel old work; offline sign-out retains remote-unconfirmed warning.
- No silent allowance-to-API switch, paid test, fallback provider or upload to Somnia server.

Native release tests still needed: store save/restart/remove; locked/missing store; concurrency; macOS signing/update access; Windows secret-size limits; Linux Secret Service availability. Mocks do not prove these.

Suggested modules: `agent_credentials.rs`, `agent_connections.rs`, `agent_http.rs`, `agent_oauth_openai.rs`. Replace renderer key getter with opaque connection IDs and native events. Preserve propose/review/save boundaries; native HTTP does not grant AI unrestricted filesystem access.

Open stage-3 gates: real Somnia registration/eligibility, deployment preview limits and branding, backend token-size/transaction strategy, native/IPC security review, packaged OS credential tests. Nothing here establishes provider access, money approval or an implemented login button.

## Sources

All opened/read 7 October 2026. Recheck before shipping. Types: provider policies/help; primary API/library docs; IETF standard; live repository code. No community claim substitutes for provider policy.

- A1 https://platform.claude.com/docs/en/manage-claude/authentication
- A2 https://platform.claude.com/docs/en/api/overview
- A3 https://code.claude.com/docs/en/legal-and-compliance
- A4 https://platform.claude.com/docs/en/api/models/list
- A5 https://platform.claude.com/docs/en/build-with-claude/token-counting
- A6 https://platform.claude.com/docs/en/api/errors
- O1 https://developers.openai.com/api/reference/overview/
- O2 https://help.openai.com/en/articles/9186755-managing-your-work-in-the-api-platform-with-projects
- O3 https://developers.openai.com/siwc/token-sharing-open-source
- O4 https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- O5 https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- O6 https://developers.openai.com/siwc/website
- O7 https://developers.openai.com/codex/auth.md
- O8 https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery
- O9 https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- O10 https://developers.openai.com/api/reference/resources/models/methods/list/
- O11 https://developers.openai.com/siwc/token-sharing-open-source/token-reference
- O12 https://developers.openai.com/api/docs/guides/spend-limits
- T1 https://v2.tauri.app/security/capabilities/
- T2 https://docs.rs/crate/keyring/3.6.3
- S1 https://www.rfc-editor.org/rfc/rfc8252.html
- R1 live public repository https://github.com/philppplik/somnia at baseline hash above; exact inspected paths in section 2.
