export interface OAuthClientConfig {
  /** Public client id. No provider defaults are baked in. */
  clientId: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  scopes: readonly string[];
  /** Only for confidential clients. Desktop apps are public clients, leave unset. */
  clientSecret?: string;
  /** Scope delimiter in the authorize URL. RFC 6749 says space. */
  scopeSeparator?: string;
  /** Extra authorize query parameters (e.g. `prompt`, `audience`, `login_hint`). Cannot override protocol parameters. */
  extraAuthorizeParams?: Readonly<Record<string, string>>;
  /** Extra token request parameters (e.g. `resource`). Cannot override protocol parameters. */
  extraTokenParams?: Readonly<Record<string, string>>;
  /** Body encoding for token requests. RFC 6749 requires form. Default 'form'. */
  tokenRequestFormat?: 'form' | 'json';
  /** How client credentials are sent when clientSecret is set. Default 'body'. */
  clientAuthMethod?: 'body' | 'basic';
  /** Send an OIDC `nonce` and verify it in the returned id_token. Default false. */
  useNonce?: boolean;
  /** Expected `iss` for RFC 9207 callback validation. When set, a differing `iss` callback parameter is rejected. */
  issuer?: string;
  /** Scopes that must appear in the server's explicit `scope` response. Missing -> OAuthError 'scope-missing'. Not checked when the server omits `scope`. */
  requiredScopes?: readonly string[];
  /** Accept a `client_id` parameter on the callback (dynamic registration, the server issues the real id) and use it for token exchange and refresh. Default false. */
  acceptIssuedClientId?: boolean;
  /** RFC 7009 revocation endpoint (e.g. from discovery). */
  revocationEndpoint?: string;
  /**
   * Fail-closed endpoint allowlist: exact URL prefixes (e.g. 'https://auth.example/api/accounts/').
   * When set, authorize/token/revocation endpoints must start with one of them or createOAuthClient throws
   * 'insecure-endpoint'. Discovery output is never trusted past this check.
   */
  endpointAllowlist?: readonly string[];
  /** Allow plain http for non-loopback endpoints. Test/dev only. Default false. */
  allowInsecureEndpoints?: boolean;
  /** Per-request timeout for token calls. Default 30 000 ms. */
  requestTimeoutMs?: number;
}

export interface OAuthDeps {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
  /**
   * Full id_token verification (signature via JWKS, iss, aud = the client id that was actually used, nonce).
   * Called after the code exchange when an id_token came back; must throw to reject. Build with verifyIdToken().
   * Without it the client only checks the nonce claim unsigned (TLS to the token endpoint is the trust).
   */
  verifyIdToken?: (idToken: string, ctx: { clientId: string; nonce?: string; issuer?: string }) => Promise<void>;
}

export interface OAuthTokenSet {
  /** client_id that obtained these tokens (issued id when dynamic registration was used). Pass it back to refresh/revoke via the token set. */
  clientId: string;
  accessToken: string;
  tokenType: string;
  refreshToken?: string;
  idToken?: string;
  /** Epoch ms, absent when the server sent no `expires_in`. */
  expiresAt?: number;
  /** Granted scopes. Falls back to the requested scopes when the server omits `scope` (RFC 6749 5.1). */
  scopes: string[];
  /** Server JSON minus the secrets above, for provider-specific extra fields. */
  extra: Record<string, unknown>;
}

/** Everything the client must remember between authorize-URL and callback. In memory only. */
export interface OAuthAuthorizationSession {
  readonly url: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly nonce?: string;
  /** Secret. Never log or persist. */
  readonly codeVerifier: string;
  readonly createdAt: number;
}

export interface LoopbackReceiver {
  /** Redirect URI to register in the authorize request, e.g. http://127.0.0.1:1455/auth/callback. */
  readonly redirectUri: string;
  /** Resolves with the full callback URL (path + query) as requested by the browser. */
  waitForCallback(signal?: AbortSignal): Promise<string>;
  close(): Promise<void>;
}
