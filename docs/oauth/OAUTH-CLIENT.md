# Generic OAuth 2.0 PKCE client

Code: `phase1/src/lib/oauth/`. Tests: `npm run test:core` (`oauth.test.ts`, `node:test` via `tsx`, mock authorization server on 127.0.0.1).
No runtime dependencies. Web Crypto + `fetch` only. No provider is hardcoded: endpoints, client id, scopes and extra parameters come from configuration.

Implements RFC 6749 (authorization code), RFC 7636 (PKCE S256 only), RFC 8252 (native app, http loopback redirect), RFC 7009 (revocation), RFC 9207 (`iss` callback check), OIDC id_token validation (core claims), OIDC Discovery (optional helper).

## Modules

| File | Purpose |
|---|---|
| `client.ts` | `createOAuthClient(config, deps)`: `beginAuthorization`, `completeAuthorization`, `authorize` (full flow), `refresh`, `revoke`, `isExpired` |
| `pkce.ts` | verifier (32 random bytes), S256 challenge, `state`/`nonce`, base64url |
| `callback.ts` | `parseCallback`: state, `iss`, `error`, `code`, issued `client_id` |
| `loopback.node.ts` | `startNodeLoopback`: Node `LoopbackReceiver` (127.0.0.1 only, one callback). Not for the webview bundle |
| `idToken.ts` | `verifyIdToken` (RS256, PS256, ES256; iss, aud, exp/nbf/iat, nonce), `fetchJwks` |
| `tokenManager.ts` | `createTokenManager`: persist-before-use, single-flight refresh, sign-out |
| `discovery.ts` | `fetchDiscovery`, `configFromDiscovery` (helper; see fail-closed rule below) |
| `errors.ts` | `OAuthError` with stable `code`; never contains tokens, codes, verifiers |

## Flow

```ts
const client = createOAuthClient({
  clientId, authorizeEndpoint, tokenEndpoint, scopes,
  extraAuthorizeParams: { resource: '…', ext_agent_host_id: '…' },
  useNonce: true, requiredScopes: ['…'], acceptIssuedClientId: true,
  endpointAllowlist: ['https://auth.example/api/accounts/'],
}, { verifyIdToken: async (jwt, { clientId, nonce }) => { await verifyIdToken(jwt, { issuer, audience: clientId, nonce, jwks, algorithms: ['RS256', 'PS256'] }); } });

const tokens = await client.authorize({ receiver, openUrl: (url) => openSystemBrowser(url) });
await store.save(tokens);
```

`authorize` = `beginAuthorization` -> open system browser -> `receiver.waitForCallback` -> `completeAuthorization`; the receiver is always closed (success, denial, timeout 5 min default, abort, browser-open failure).

### Loopback receiver in Tauri
`LoopbackReceiver` is an interface (`redirectUri`, `waitForCallback(signal)`, `close()`). In the app the Rust host owns the listener (bind 127.0.0.1, optional fixed port and path such as `/auth/callback`, answer one GET, return `path?query` to TS). `loopback.node.ts` is the reference behaviour and the test double: 404 for other paths/methods/hosts, 409 for a second hit, `no-store` pages.

## Security properties (all covered by tests)

- PKCE S256 with 256-bit verifier; verifier never in URL, logs or error messages. Session object is in memory only and single-use (`session-used`).
- `state` is checked before anything else, also on `error` redirects, so a forged error cannot end a real flow.
- Endpoints must be https (http only for 127.0.0.1/localhost/[::1] or with `allowInsecureEndpoints`). Token/revoke requests use `redirect: 'error'`.
- `endpointAllowlist` (URL prefixes) is fail-closed for authorize, token and revocation endpoints. Prefix must end in `/` to avoid host-suffix tricks (`https://auth.example.evil.com` does not match `https://auth.example/`).
- Reserved protocol parameters cannot be overridden through `extraAuthorizeParams` / `extraTokenParams`.
- Redirect URI must be an http loopback URL.
- `requiredScopes` is checked against the server's explicit `scope` response (`scope-missing`). If the server omits `scope`, requested scopes are assumed (RFC 6749 5.1) and no check is possible; callers that must know should also test the capability.
- id_token: without `deps.verifyIdToken` only the `nonce` claim is compared (unsigned; trust = TLS to the token endpoint). Production use must pass a verifier built from `verifyIdToken` + JWKS.
- `alg: none` and HMAC are rejected. Keys are matched by `kid`, `kty` and `use`.

## Dynamic client registration (`acceptIssuedClientId`)
Start with the registration client id (e.g. `dynamic_agent_client`). When the callback carries `client_id`, the code exchange uses it and `OAuthTokenSet.clientId` stores it. Persist it per account and pass the token set (with `clientId`) to `refresh`, `revoke` and the token manager. Without the flag a callback `client_id` is ignored.

## Rotating refresh tokens
`refresh` is single-flight per refresh token, returns the replacement and keeps the old token only when the server does not rotate. `createTokenManager` saves the new set before returning the access token; transient failures keep the stored login, `invalid-grant` clears it (`OAuthError.requiresReauth`). The store's `save` must be durable (OS keyring in the Rust host).

## Revocation and sign-out
`client.revoke` follows RFC 7009 (200 and 400 are both "nothing left to revoke"; other statuses throw `token-error`). `tokenManager.signOut` revokes the refresh token (if `revocationEndpoint` is configured and allowed) and ALWAYS clears local storage, returning `{ revoked, revokeError }` so the UI can tell the user to disconnect in the provider's settings when `revoked` is false.

## Discovery
`fetchDiscovery` checks https and the issuer match. Treat it as a drift test or setup helper. Endpoints that receive tokens should come from `endpointAllowlist` + explicit config, not from a discovery document at runtime.

## Error codes
`invalid-config`, `insecure-endpoint`, `state-mismatch`, `nonce-mismatch`, `issuer-mismatch`, `access-denied`, `authorization-error`, `invalid-grant`, `token-error`, `protocol`, `network`, `timeout`, `cancelled`, `scope-missing`, `id-token-invalid`, `session-used`. `providerError` / `providerDescription` (<= 300 chars) carry the server's OAuth error for logs. UI must map codes to localized generic messages, never show raw errors.

## Not covered here
Provider presets (OpenAI SIWC endpoints, scopes, host id, JWKS/issuer allowlist, error classes), the Rust loopback listener, keyring `TokenStore`, Tauri commands (`agent_account_*`), UI. Nothing here was tested against a real provider account; the owner test is pending.

## Libraries
None added. Dependencies: Node/Web platform APIs only (`fetch`, `crypto.subtle`, `node:http` in the Node receiver and tests). Dev: `tsx` (MIT, already in repo).
