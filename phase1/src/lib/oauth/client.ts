import { OAuthError } from './errors';
import { parseCallback } from './callback';
import { base64UrlDecode, codeChallengeS256, createCodeVerifier, defaultRandomBytes, randomToken, safeEqual } from './pkce';
import type { LoopbackReceiver, OAuthAuthorizationSession, OAuthClientConfig, OAuthDeps, OAuthTokenSet } from './types';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const PROTOCOL_PARAMS = ['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'code_challenge', 'code_challenge_method', 'nonce', 'grant_type', 'code', 'code_verifier', 'refresh_token', 'client_secret'];

function parseUrl(value: string, what: string): URL {
  try { return new URL(value); } catch (cause) { throw new OAuthError('invalid-config', `${what} is not a valid URL.`, { cause }); }
}

function checkEndpoint(value: string, what: string, allowInsecure: boolean, allowlist?: readonly string[]): void {
  const url = parseUrl(value, what);
  if (allowlist && !allowlist.some((prefix) => value.startsWith(prefix))) throw new OAuthError('insecure-endpoint', `${what} is not on the endpoint allowlist.`);
  if (url.hash) throw new OAuthError('invalid-config', `${what} must not contain a fragment.`);
  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && (allowInsecure || LOOPBACK_HOSTS.has(url.hostname))) return;
  throw new OAuthError('insecure-endpoint', `${what} must use https.`);
}

/** RFC 8252 7.3: native apps redirect to http loopback. */
export function assertLoopbackRedirect(redirectUri: string): void {
  const url = parseUrl(redirectUri, 'redirectUri');
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname) || url.hash) throw new OAuthError('invalid-config', 'redirectUri must be an http loopback URL without fragment.');
}

/** Decode the payload of a JWT WITHOUT verifying its signature. Only for reading `nonce`/`exp` of a token we just received over TLS from the token endpoint. */
export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length < 2) throw new OAuthError('protocol', 'id_token is not a JWT.');
  try {
    const value = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* fall through */ }
  throw new OAuthError('protocol', 'id_token payload is not valid.');
}

export interface AuthorizeOptions {
  receiver: LoopbackReceiver;
  /** Hand the authorize URL to the system browser. Must not be the app webview. */
  openUrl: (url: string) => void | Promise<void>;
  signal?: AbortSignal;
  /** Wait for the user. Default 5 minutes. */
  timeoutMs?: number;
  extraAuthorizeParams?: Record<string, string>;
}

export interface OAuthClient {
  readonly config: Readonly<OAuthClientConfig>;
  beginAuthorization(redirectUri: string, extraParams?: Record<string, string>): Promise<OAuthAuthorizationSession>;
  /** Validate the callback (state, iss, error) and exchange the code. A session works once. */
  completeAuthorization(session: OAuthAuthorizationSession, callback: string, signal?: AbortSignal): Promise<OAuthTokenSet>;
  /** begin + browser + loopback wait + exchange, always closes the receiver. */
  authorize(options: AuthorizeOptions): Promise<OAuthTokenSet>;
  /** Single-flight per refresh token. Keeps the old refresh token when the server does not rotate. */
  refresh(token: Pick<OAuthTokenSet, 'refreshToken' | 'scopes'> & { clientId?: string }, signal?: AbortSignal): Promise<OAuthTokenSet>;
  /** RFC 7009. Resolves when the server accepted (or the token was already invalid). Needs config.revocationEndpoint. */
  revoke(token: string, hint?: 'refresh_token' | 'access_token', clientId?: string, signal?: AbortSignal): Promise<void>;
  isExpired(token: Pick<OAuthTokenSet, 'expiresAt'>, skewMs?: number): boolean;
}

export function createOAuthClient(input: OAuthClientConfig, deps: OAuthDeps = {}): OAuthClient {
  const config: OAuthClientConfig = { ...input, scopes: [...input.scopes] };
  if (!config.clientId.trim()) throw new OAuthError('invalid-config', 'clientId is required.');
  checkEndpoint(config.authorizeEndpoint, 'authorizeEndpoint', !!config.allowInsecureEndpoints, config.endpointAllowlist);
  checkEndpoint(config.tokenEndpoint, 'tokenEndpoint', !!config.allowInsecureEndpoints, config.endpointAllowlist);
  if (config.revocationEndpoint) checkEndpoint(config.revocationEndpoint, 'revocationEndpoint', !!config.allowInsecureEndpoints, config.endpointAllowlist);
  for (const scope of config.scopes) if (!scope || /\s/.test(scope)) throw new OAuthError('invalid-config', 'Scopes must be non-empty tokens without whitespace.');
  for (const bag of [config.extraAuthorizeParams, config.extraTokenParams]) for (const key of Object.keys(bag ?? {})) if (PROTOCOL_PARAMS.includes(key)) throw new OAuthError('invalid-config', `Extra parameter "${key}" is reserved.`);

  const now = deps.now ?? Date.now;
  const random = deps.randomBytes ?? defaultRandomBytes;
  const doFetch = () => deps.fetch ?? globalThis.fetch;
  const timeout = config.requestTimeoutMs ?? 30_000;
  const used = new WeakSet<OAuthAuthorizationSession>();
  const inflight = new Map<string, Promise<OAuthTokenSet>>();
  const separator = config.scopeSeparator ?? ' ';

  async function beginAuthorization(redirectUri: string, extra: Record<string, string> = {}): Promise<OAuthAuthorizationSession> {
    assertLoopbackRedirect(redirectUri);
    for (const key of Object.keys(extra)) if (PROTOCOL_PARAMS.includes(key)) throw new OAuthError('invalid-config', `Extra parameter "${key}" is reserved.`);
    const codeVerifier = createCodeVerifier(random);
    const state = randomToken(random);
    const nonce = config.useNonce ? randomToken(random) : undefined;
    const url = new URL(config.authorizeEndpoint);
    const q = url.searchParams;
    for (const [k, v] of Object.entries({ ...config.extraAuthorizeParams, ...extra })) q.set(k, v);
    q.set('response_type', 'code');
    q.set('client_id', config.clientId);
    q.set('redirect_uri', redirectUri);
    if (config.scopes.length) q.set('scope', config.scopes.join(separator));
    q.set('state', state);
    q.set('code_challenge', await codeChallengeS256(codeVerifier));
    q.set('code_challenge_method', 'S256');
    if (nonce) q.set('nonce', nonce);
    return Object.freeze({ url: url.toString(), clientId: config.clientId, redirectUri, state, nonce, codeVerifier, createdAt: now() });
  }

  async function tokenRequest(clientId: string, grant: Record<string, string>, fallbackScopes: string[], previousRefresh: string | undefined, signal?: AbortSignal): Promise<OAuthTokenSet> {
    const body: Record<string, string> = { ...config.extraTokenParams, ...grant, client_id: clientId };
    const headers: Record<string, string> = { accept: 'application/json' };
    if (config.clientSecret) {
      if (config.clientAuthMethod === 'basic') headers.authorization = `Basic ${btoa(`${encodeURIComponent(clientId)}:${encodeURIComponent(config.clientSecret)}`)}`;
      else body.client_secret = config.clientSecret;
    }
    let payload: string;
    if (config.tokenRequestFormat === 'json') { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    else { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(body).toString(); }

    const timer = new AbortController();
    const onAbort = () => timer.abort(signal?.reason);
    if (signal?.aborted) throw new OAuthError('cancelled', 'Cancelled.');
    signal?.addEventListener('abort', onAbort, { once: true });
    const timeoutId = setTimeout(() => timer.abort(new OAuthError('timeout', 'Token request timed out.')), timeout);
    let response: Response;
    let text: string;
    try {
      response = await doFetch()(config.tokenEndpoint, { method: 'POST', headers, body: payload, signal: timer.signal, redirect: 'error' });
      text = await response.text();
    } catch (cause) {
      if (signal?.aborted) throw new OAuthError('cancelled', 'Cancelled.', { cause });
      if (timer.signal.aborted) throw new OAuthError('timeout', 'Token request timed out.', { cause });
      throw new OAuthError('network', 'Token endpoint is not reachable.', { cause });
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    }

    let json: unknown;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
    const obj = json && typeof json === 'object' && !Array.isArray(json) ? json as Record<string, unknown> : undefined;

    if (!response.ok) {
      const providerError = typeof obj?.error === 'string' ? obj.error : undefined;
      const description = typeof obj?.error_description === 'string' ? obj.error_description.slice(0, 300) : undefined;
      if (providerError === 'invalid_grant') throw new OAuthError('invalid-grant', 'Authorization is expired or revoked.', { providerError, providerDescription: description, status: response.status });
      if (providerError) throw new OAuthError('token-error', `Token endpoint rejected the request: ${providerError}`, { providerError, providerDescription: description, status: response.status });
      throw new OAuthError('protocol', `Token endpoint answered HTTP ${response.status}.`, { status: response.status });
    }
    if (!obj) throw new OAuthError('protocol', 'Token endpoint did not return JSON.', { status: response.status });
    // Some servers answer 200 with an error body.
    if (typeof obj.error === 'string') throw new OAuthError(obj.error === 'invalid_grant' ? 'invalid-grant' : 'token-error', `Token endpoint rejected the request: ${obj.error}`, { providerError: obj.error });
    if (typeof obj.access_token !== 'string' || !obj.access_token) throw new OAuthError('protocol', 'Token response has no access_token.');
    if (obj.token_type !== undefined && typeof obj.token_type !== 'string') throw new OAuthError('protocol', 'Token response token_type is invalid.');

    const { access_token, refresh_token, id_token, token_type, expires_in, scope, ...rest } = obj;
    let expiresAt: number | undefined;
    if (expires_in !== undefined && expires_in !== null) {
      const seconds = typeof expires_in === 'string' ? Number(expires_in) : expires_in;
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) throw new OAuthError('protocol', 'Token response expires_in is invalid.');
      expiresAt = now() + seconds * 1000;
    }
    const granted = typeof scope === 'string' && scope.trim() ? scope.trim().split(/[\s,]+/).filter(Boolean) : undefined;
    const missing = granted ? (config.requiredScopes ?? []).filter((r) => !granted.includes(r)) : [];
    if (missing.length) throw new OAuthError('scope-missing', `Server did not grant required scope: ${missing.join(' ')}`);
    return {
      clientId,
      accessToken: access_token,
      tokenType: typeof token_type === 'string' && token_type ? token_type : 'Bearer',
      refreshToken: typeof refresh_token === 'string' && refresh_token ? refresh_token : previousRefresh,
      idToken: typeof id_token === 'string' && id_token ? id_token : undefined,
      expiresAt,
      scopes: granted ?? fallbackScopes,
      extra: rest,
    };
  }

  async function completeAuthorization(session: OAuthAuthorizationSession, callback: string, signal?: AbortSignal): Promise<OAuthTokenSet> {
    if (used.has(session)) throw new OAuthError('session-used', 'This authorization session was already used.');
    const parsed = parseCallback(callback, session.state, config.issuer);
    used.add(session);
    const clientId = config.acceptIssuedClientId && parsed.clientId ? parsed.clientId : session.clientId;
    const tokens = await tokenRequest(clientId, { grant_type: 'authorization_code', code: parsed.code, redirect_uri: session.redirectUri, code_verifier: session.codeVerifier }, [...config.scopes], undefined, signal);
    if (session.nonce) {
      if (!tokens.idToken) throw new OAuthError('nonce-mismatch', 'Token response has no id_token to verify the nonce.');
      const claim = decodeJwtPayload(tokens.idToken).nonce;
      if (typeof claim !== 'string' || !safeEqual(claim, session.nonce)) throw new OAuthError('nonce-mismatch', 'id_token nonce does not match.');
    }
    if (tokens.idToken && deps.verifyIdToken) {
      try { await deps.verifyIdToken(tokens.idToken, { clientId, nonce: session.nonce, issuer: config.issuer }); } catch (cause) {
        throw cause instanceof OAuthError ? cause : new OAuthError('id-token-invalid', 'id_token verification failed.', { cause });
      }
    }
    return tokens;
  }

  async function authorize(options: AuthorizeOptions): Promise<OAuthTokenSet> {
    const { receiver, signal } = options;
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) abort.abort();
    const timeoutId = setTimeout(() => abort.abort(new OAuthError('timeout', 'No sign-in was completed in time.')), options.timeoutMs ?? 300_000);
    try {
      const session = await beginAuthorization(receiver.redirectUri, options.extraAuthorizeParams);
      const waiting = receiver.waitForCallback(abort.signal);
      waiting.catch(() => {}); // surfaced below; avoid unhandled rejection while the browser opens
      try { await options.openUrl(session.url); } catch (cause) { throw new OAuthError('network', 'The system browser could not be opened.', { cause }); }
      let callback: string;
      try { callback = await waiting; } catch (cause) {
        if (cause instanceof OAuthError) throw cause;
        if (signal?.aborted) throw new OAuthError('cancelled', 'Cancelled.', { cause });
        if (abort.signal.aborted) throw new OAuthError('timeout', 'No sign-in was completed in time.', { cause });
        throw new OAuthError('network', 'Waiting for the browser callback failed.', { cause });
      }
      return await completeAuthorization(session, callback, signal);
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      await receiver.close().catch(() => {});
    }
  }

  function refresh(token: Pick<OAuthTokenSet, 'refreshToken' | 'scopes'> & { clientId?: string }, signal?: AbortSignal): Promise<OAuthTokenSet> {
    const rt = token.refreshToken;
    if (!rt) return Promise.reject(new OAuthError('invalid-grant', 'No refresh token available.'));
    const existing = inflight.get(rt);  // rotation: a second parallel call must not burn the rotated token
    if (existing) return existing;
    const run = tokenRequest(token.clientId ?? config.clientId, { grant_type: 'refresh_token', refresh_token: rt }, token.scopes.length ? [...token.scopes] : [...config.scopes], rt, signal).finally(() => inflight.delete(rt));
    inflight.set(rt, run);
    return run;
  }

  async function revoke(token: string, hint?: 'refresh_token' | 'access_token', clientId?: string, signal?: AbortSignal): Promise<void> {
    if (!config.revocationEndpoint) throw new OAuthError('invalid-config', 'No revocationEndpoint configured.');
    checkEndpoint(config.revocationEndpoint, 'revocationEndpoint', !!config.allowInsecureEndpoints, config.endpointAllowlist);
    const params: Record<string, string> = { token, client_id: clientId ?? config.clientId };
    if (hint) params.token_type_hint = hint;
    if (config.clientSecret && config.clientAuthMethod !== 'basic') params.client_secret = config.clientSecret;
    const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
    if (config.clientSecret && config.clientAuthMethod === 'basic') headers.authorization = `Basic ${btoa(`${encodeURIComponent(params.client_id)}:${encodeURIComponent(config.clientSecret)}`)}`;
    let response: Response;
    try {
      response = await doFetch()(config.revocationEndpoint, { method: 'POST', headers, body: new URLSearchParams(params).toString(), signal: signal ?? AbortSignal.timeout(timeout), redirect: 'error' });
      await response.text().catch(() => '');
    } catch (cause) {
      if (signal?.aborted) throw new OAuthError('cancelled', 'Cancelled.', { cause });
      throw new OAuthError('network', 'Revocation endpoint is not reachable.', { cause });
    }
    // RFC 7009 2.2: invalid tokens also answer 200. 400 invalid_token-like answers mean nothing left to revoke.
    if (!response.ok && response.status !== 400) throw new OAuthError('token-error', `Revocation failed with HTTP ${response.status}.`, { status: response.status });
  }

  return { revoke, config, beginAuthorization, completeAuthorization, authorize, refresh, isExpired: (t, skew = 60_000) => t.expiresAt !== undefined && now() + skew >= t.expiresAt };
}
