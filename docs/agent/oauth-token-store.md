# OpenAI account: token storage, refresh, logout

Scope: Wave 3, Auth-Dev 2/4. Storage and refresh only. The browser login flow (`agent_account_start` / `agent_account_cancel`) is a separate work item and uses the API below.

## Where tokens live

- OS credential store (`keyring`), service `de.philipp-paulik.somnia.agent`, same broker as API keys.
- Slots: `openai` (API key, unchanged), `openai-oauth` (JSON: access, refresh, optional id token, `expiresAtMs`, optional `accountId`, `needsReauth`), `openai-auth-method` (`account` | `api-key`).
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

- Token endpoint `https://auth.openai.com/oauth/token`, JSON body `{client_id, grant_type:"refresh_token", refresh_token}` (same shape as Codex CLI, openai/codex, Apache-2.0; checked 2026-10-07).
- On demand: `provider_http_start` for `openai` with method `account` calls `oauth_access_token()`, which refreshes when the token is expired or within 5 min of expiry. Single-flight lock because refresh tokens may rotate.
- Background: `oauth_refresh_loop` sleeps until `expiry - 5 min` (min 30 s), woken by login/logout.
- Expiry: `expires_in`, else JWT `exp` (no signature check, scheduling only), else +1 h.
- Missing refresh/id token in the response keeps the old value.
- Permanent failure (`invalid_grant`, expired/reused/invalidated refresh token, HTTP 401) sets `needsReauth` -> state `expired`. Transient failures (network, 5xx, 429) retry in 5 min and keep the tokens.

## API key and account side by side

Both stay stored. `method` decides which one is used. No silent switching: only `set_method`, a fresh login (explicit) and logout (account cannot work without tokens) change it.

## Open points

- The Codex client id belongs to OpenAI's own app. Using it in Somnia is a policy/ToS decision for the owner; the constants are in `oauth_store.rs`.
- Tokens issued for the ChatGPT account may not be accepted by `api.openai.com/v1` (Codex talks to a ChatGPT backend). `provider_transport.rs` still allows only the API endpoints; the flow/transport item must settle the target endpoint.

## Tests

`cd phase1/src-tauri && cargo test --no-default-features --lib oauth_store`
`cd phase1 && npx tsx --test src/lib/agent/accountAuth.test.ts`
