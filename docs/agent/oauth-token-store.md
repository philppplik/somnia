# OpenAI account: token storage, refresh, logout

Scope: Wave 3, Auth-Dev 2/4. Storage and refresh only. The browser login flow (`agent_account_start` / `agent_account_cancel`) is a separate work item and uses the API below.

## Where tokens live

- OS credential store (`keyring`), service `de.philipp-paulik.somnia.agent`, same broker as API keys.
- Slots: `openai` (API key, unchanged), `openai-oauth` (JSON: access, refresh, clientId, optional id token, `expiresAtMs`, optional `accountId`, `needsReauth`), `openai-auth-method` (`account` | `api-key`).
- Tokens never reach the renderer. The UI gets `Status` only: `{provider, state, method, expiresAt?}`. Nothing else (no token, e-mail, account id).
- `Debug` on tokens is redacted. Errors are generic.

## Modules

- `phase1/src-tauri/src/oauth_store.rs`: pure logic (no Tauri), trait `SecretBackend`, 12 unit tests.
- `desktop.rs`: keyring backend, commands, refresh, scheduler.
- `phase1/src/lib/agent/accountAuth.ts`: renderer client for the UI contract.

## Commands (this item)

| Command | Result |
|---|---|
| `agent_account_status({provider})` | `Status` |
| `agent_account_disconnect({provider})` | deletes OAuth only, API key stays; falls back to `api-key` method |
| `agent_account_set_method({provider, method})` | explicit switch; `account` needs stored, non-expired-for-good tokens |

States: `disconnected` (no tokens), `pending` (login in flight, `OAUTH_PENDING`), `connected` (tokens usable or refreshable), `expired` (refresh permanently failed, re-login needed).

## Hooks for the login flow

After exchanging the code, call `Store::save_tokens(&Tokens{..})` (selects the account method, since login is an explicit user action), then `oauth_saved()`. Set/clear `OAUTH_PENDING` in start/cancel.

## Refresh

- Official sign-in-with-ChatGPT flow. Token/refresh endpoint `https://auth.openai.com/api/accounts/oauth/token`, body `application/x-www-form-urlencoded`: `grant_type=refresh_token&client_id=<oaiapp_...>&refresh_token=...`.
- No first-party client id. The `client_id` issued by dynamic client registration at first login is stored per account in the token record (`clientId`, required) and used for refresh.
- Issuer validation fails closed: an `id_token` in a refresh response must have `iss == "https://auth.openai.com"` exactly, otherwise the response is rejected and nothing is stored. JWKS source is only `https://auth.openai.com/.well-known/jwks.json` (`OAUTH_JWKS_URL`). Signature verification belongs to the login flow (id_token at exchange); the store checks `iss` only.
- On demand: `provider_http_start` for `openai` with method `account` calls `oauth_access_token()`, which refreshes when the token is expired or within 5 min of expiry. Single-flight lock because refresh tokens may rotate.
- Background: `oauth_refresh_loop` sleeps until `expiry - 5 min` (min 30 s), woken by login/logout.
- Expiry: `expires_in`, else JWT `exp` (scheduling only), else +1 h. Missing refresh/id token in the response keeps the old value.
- Permanent failure (`invalid_grant`, expired/reused/invalidated refresh token, HTTP 401) sets `needsReauth` -> state `expired`. Transient failures retry in 5 min and keep the tokens.

## API key and account side by side

Both stay stored. `method` decides which one is used. No silent switching: only `set_method`, a fresh login (explicit) and logout (account cannot work without tokens) change it.

## Open points

- `provider_transport.rs` must allow `POST https://api.openai.com/v1/responses` (Bearer access token) for the account method; not part of this item.
- Whether the refresh request needs `resource=https://api.openai.com/v1` is unverified; it is currently omitted.
- Refresh format/endpoint follow the owner-supplied SIWC spec and are not tested live.

## Tests

`cd phase1/src-tauri && cargo test --no-default-features --lib oauth_store`
`cd phase1 && npx tsx --test src/lib/agent/accountAuth.test.ts`
