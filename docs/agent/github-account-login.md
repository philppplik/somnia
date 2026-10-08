# GitHub account login

Status: implemented on `feat/github-account-login`. Not yet tested against real GitHub (see "Open items").

## Flow: OAuth device flow

Chosen because Somnia is a distributed desktop app. The web flow and PKCE token exchange for GitHub OAuth Apps need a client secret, which cannot be kept secret in a public binary. The device flow needs only the public client id, no secret and no loopback listener.

1. `github_account_start` (Tauri command, trusted editor window only) asks `POST https://github.com/login/device/code` for a device code with scope `read:user repo`.
2. The host opens `https://github.com/login/device` and publishes only the `user_code` to the UI. The UI shows it in the Account popup > Connections.
3. The host polls `https://github.com/login/oauth/access_token` at GitHub's interval (minimum 5 s, `slow_down` handled), until approved, denied, expired (max 15 min) or cancelled.
4. On success the host reads `GET https://api.github.com/user` (login, name) and stores `{accessToken, login, name}` in the OS credential store, slot `github-oauth`, service `de.philipp-paulik.somnia.agent`.

## Security properties

- The access token and the device code never reach the renderer. The renderer gets `Status` only: state, public login/name, user code while pending.
- The verification page is pinned to `https://github.com/login/device`; any other value from the server is rejected.
- Redirects are disabled, no proxy, bounded timeouts. Raw server text is never surfaced.
- Scope is identity only. Wider scopes (repos, PRs) need a separate decision.
- Sign out deletes the keyring slot. GitHub OAuth App tokens can only be revoked on github.com/settings/applications (revocation by the app needs the client secret), the UI says so.

## Files

- `phase1/src-tauri/src/github_account.rs`: pure parsing, store, status, unit tests.
- `phase1/src-tauri/src/desktop.rs`: commands `github_account_status|start|cancel|disconnect`, polling loop.
- `phase1/src/lib/githubAccount.ts`, `phase1/src/components/GithubConnection.tsx`: UI, shown in `Account.tsx` under "Connections".

## OpenAI in Connections

The existing OpenAI account login (PKCE, keyring) is shown in the same Connections section (status, connect, disconnect). Agent settings keeps only the status and the "use account or API key" choice and points to Profile > Connections, so connect/disconnect exist in one place.

## More connections (existing infrastructure only)

Claude and OpenRouter: API key entry/test/replace/delete with the same keystore and test path as Agent settings (key never shown again). Ollama: a reachability check on demand. MCP servers: read-only list (running/stopped, tool count) with a button to Settings > AI > Tools; everything else about MCP stays there. No new OAuth app involved.

## Open items

- The OAuth App "Somnia" (owner philppplik, device flow on, user token expiry off, no client secret created) is registered; `CLIENT_ID` is set. Its page: github.com/settings/applications/3915710.
- Real login untested. The Rust commands in `desktop.rs` were reviewed but not compiled (no Tauri system libs in the authoring sandbox); CI must build them.

## Scope (owner decision B, 2026-10-08)

The login requests `read:user repo`: profile plus read access to public and private repositories. GitHub OAuth Apps have no read-only repository scope, so the token could technically also write. Somnia must only send read requests with it. The granted scope is stored with the account (`scope`, defaults to empty for older logins). If it lacks `read:user` or `repo`, the status carries `scopeUpgrade: true` and Connections shows a hint plus "Sign in again" (one new consent on GitHub). No OAuth App change is needed; scopes are requested per login.
