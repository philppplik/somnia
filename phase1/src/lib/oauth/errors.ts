export type OAuthErrorCode =
  | 'invalid-config'      // bad client configuration or redirect URI
  | 'insecure-endpoint'   // non-https endpoint (loopback http is allowed)
  | 'state-mismatch'      // callback state differs from the one we issued (CSRF / stale tab)
  | 'nonce-mismatch'      // id_token nonce differs from the one we issued
  | 'issuer-mismatch'     // RFC 9207 `iss` callback parameter differs from the expected issuer
  | 'access-denied'       // user declined (error=access_denied)
  | 'authorization-error' // any other `error` returned on the redirect
  | 'invalid-grant'       // code or refresh token rejected / expired / revoked
  | 'token-error'         // token endpoint returned an OAuth error
  | 'protocol'            // response not valid OAuth (not JSON, missing access_token, ...)
  | 'network'             // fetch failed
  | 'timeout'             // no callback or no response in time
  | 'cancelled'           // caller aborted
  | 'scope-missing'       // server granted fewer scopes than requiredScopes
  | 'id-token-invalid'    // id_token signature/iss/aud/exp check failed
  | 'session-used';      // authorization session completed twice

/**
 * Error with a stable code. `message` and `providerError` never contain tokens,
 * codes, verifiers or client secrets.
 */
export class OAuthError extends Error {
  readonly code: OAuthErrorCode;
  /** OAuth `error` value from the server (RFC 6749 5.2), when present. */
  readonly providerError?: string;
  readonly providerDescription?: string;
  readonly status?: number;
  constructor(code: OAuthErrorCode, message: string, extra: { providerError?: string; providerDescription?: string; status?: number; cause?: unknown } = {}) {
    super(message, extra.cause === undefined ? undefined : { cause: extra.cause });
    this.name = 'OAuthError';
    this.code = code;
    this.providerError = extra.providerError;
    this.providerDescription = extra.providerDescription;
    this.status = extra.status;
  }
  /** True when the user has to sign in again (refresh token is unusable). */
  get requiresReauth(): boolean { return this.code === 'invalid-grant'; }
}
