# OAuth auth test suite (OpenAI ChatGPT-plan login)

Status: scaffolding and executable contract. The production OAuth client does not exist on this branch yet.
Branch `feature/auth-tests`, based on `origin/somnia-agent` at bb9d1fa. Run: `npm run test:auth` (node:test via tsx, no Vitest, no network, no paid API, no CI cost). Add `src/lib/agent/oauth/*.test.ts` to `test:core` when integrating.
Spec: [AUTH-DECISION.md](AUTH-DECISION.md) section 5 and 6, plus the SIWC facts and fail-closed rules handed over on 2026-10-07 (see "Decisions encoded").
Nothing here was tested against a real OpenAI account. Owner test is still open.

## Layout (`phase1/src/lib/agent/oauth/`)

| File | Purpose |
| --- | --- |
| `testSupport/mockOAuthServer.ts` | Real HTTP mock on 127.0.0.1: authorize (dynamic first registration via `dynamic_agent_client`), token (authorization_code, refresh_token), revoke, JWKS, discovery, `/v1/models`, `/v1/responses`. RS256 ID tokens, PKCE S256, single-use codes, rotating refresh tokens with reuse detection, `earliest_refresh_at`, fault injection |
| `testSupport/clock.ts` | `FakeClock`: deterministic expiry and timers |
| `testSupport/pkce.ts` | Independent PKCE oracle (RFC 7636). Test-only |
| `testSupport/browserSim.ts` | System-browser and loopback-listener stand-ins |
| `testSupport/fakeCredentialStore.ts` | Keyring stand-in: lock, one-shot and persistent write failure, size limit, leak dump |
| `subject.ts` | `OAuthSubject` contract + `SubjectDeps` (injected allowlisted endpoints, clock, store, fetch, browser) |
| `conformance.ts` | 39-case suite, runs against any `OAuthSubjectFactory` |
| `migrationConformance.ts` | Storage migration suite for legacy single-key entries |
| `testSupport/referenceSubject.ts`, `referenceMigration.ts` | Known-good reference implementations that prove the suites are satisfiable. Not production code, never import from app code |
| `*.test.ts` | Mock self-tests, reference runs |

## Wiring the real client (when the dev branches land)

```ts
// realSubject.test.ts
import {defineConformanceSuite} from './conformance';
import {createOpenAiChatGptAuth} from '../openAiChatGptAuth'; // real module
defineConformanceSuite('real',d=>createOpenAiChatGptAuth(d));
```
The real module must accept `SubjectDeps`: in production `endpoints` is the hardcoded allowlist (`https://auth.openai.com/api/accounts/...`), in tests the mock's. Same for the migration suite via `defineMigrationSuite('real',migrate,keyFor)`.
In the Tauri build the Rust side owns tokens; run the same suite against a TS adapter over the Rust-side logic or port the cases to `cargo test` using the mock server as an external process (`MockOAuthServer.start(port)`).

## Covered

- PKCE: RFC 7636 appendix B vector, verifier shape, fresh state, nonce and challenge per attempt, `plain` rejected by server, verifier mismatch, no client secret ever sent.
- Registration: first login with `client_id=dynamic_agent_client`, `agent_name_hint=Somnia`, persisted `urn:uuid` host id; issued `oaiapp_` id stored and reused; reauthorization with the saved id; different account rejected, old connection kept.
- Callback: forged state, denial, cancel, timeout (listener closed), loopback-only redirect (`localhost` and https rejected by the mock).
- ID token: bad nonce, issuer, audience, signature, expiry, missing token. Scope decision from granted scopes (missing `chatgpt.tokens.use.direct` rejected).
- Refresh: not before `earliest_refresh_at`, 30 s expiry margin, rotation persisted, single-flight for 20 concurrent callers, cross-instance race (two windows, one store), transient failure keeps tokens, terminal `invalid_grant` clears tokens and stops looping, 30-day refresh expiry, persistence failure after rotation (one-shot and persistent).
- 401 handling: one refresh and one retry, no loop, concurrent 401s share one refresh, bearer only in header.
- Inference contract: mock enforces `store=false`, `stream=true`, array `input`, rejects `temperature`, `top_p`, `previous_response_id`, `max_output_tokens`, `metadata`. Error codes pass through unchanged: `subscription_sharing_user_not_eligible` 403, `subscription_sharing_usage_limit_exceeded` 429, `subscription_sharing_invalid_user` 401.
- Sign-out: remote revoke, failure reported as `remoteRevoked=false`, local clear always, client and host mapping kept.
- Storage: no secret outside the store, locked store recovers, write failure leaves nothing falsely connected, migration at every write-failure point, idempotence, size-limited backend, existing OAuth record untouched.
- Endpoints: a poisoned discovery document is ignored.

## Decisions encoded (fail closed)

- Authorize, token and revoke endpoints are an injected allowlist, never read from discovery at runtime. Discovery is for a drift test only.
- ID token `iss` must equal the allowlisted issuer exactly (`https://auth.openai.com`). `auth0.openai.com` must not pass. The mock's "bad issuer" case signs `https://evil.example`; add an `auth0.openai.com` case in the real wiring.
- Suite proven by mutation: removing the issuer check in the reference makes the "bad issuer" case fail.

## Open points

- UI-flow tests (ProviderAuthentication panel: connect, cancel, reauthorization-required, quota blocked, policy blocked, sign-out text "disconnect in ChatGPT settings" on unconfirmed revoke) wait for the dev branch. Needed from it: a pure state model or hook to drive, and stable test ids. Matrix to implement: not-configured, connecting, connected, reauthorization-required, quota-blocked, policy-blocked, credential-locked, removing.
- Rust-side port (cargo tests) for refresh locking, since tokens live in the Rust host.
- JWKS: production allows RS256/PS256 only. Mock signs RS256 only. Add a PS256 and an `alg=none` / HS256-confusion case once the verifier exists.
- Revocation endpoint source is documented inconsistently upstream. The mock exposes `/revoke`; the real endpoint and host allowlist still need an owner decision and a live check.
- Real-account smoke test (owner, eligible Plus/Pro plan) is not done.
- Licenses: no third-party code or libraries added. Only node built-ins (`node:http`, `node:crypto`, `node:test`) and the existing tsx runner.
