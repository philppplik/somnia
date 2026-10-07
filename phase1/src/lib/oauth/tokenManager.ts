import { OAuthError } from './errors';
import type { OAuthClient } from './client';
import type { OAuthTokenSet } from './types';

export interface TokenStore {
  load(): Promise<OAuthTokenSet | undefined>;
  /** Must be durable before it resolves. With rotating refresh tokens a lost save means a lost login. */
  save(tokens: OAuthTokenSet): Promise<void>;
  clear(): Promise<void>;
}

export interface TokenManager {
  /** Valid access token, refreshing first when expiring. Concurrent callers share one refresh. */
  getAccessToken(opts?: { forceRefresh?: boolean; signal?: AbortSignal }): Promise<string>;
  /** Persist tokens from a fresh login. */
  setTokens(tokens: OAuthTokenSet): Promise<void>;
  /** Best-effort revoke (refresh token first) then clear. Clearing happens even if the server is unreachable; the revoke error is reported in `revokeError`. */
  signOut(signal?: AbortSignal): Promise<{ revoked: boolean; revokeError?: OAuthError }>;
}

/**
 * Refresh serialization + persistence for rotating refresh tokens:
 * the new tokens are saved BEFORE they are handed out, a failed refresh with `invalid-grant`
 * clears the store (the user must sign in again), transient failures keep it.
 */
export function createTokenManager(client: OAuthClient, store: TokenStore, opts: { skewMs?: number } = {}): TokenManager {
  let pending: Promise<OAuthTokenSet> | undefined;

  async function current(): Promise<OAuthTokenSet> {
    const t = await store.load();
    if (!t) throw new OAuthError('invalid-grant', 'Not signed in.');
    return t;
  }

  function refreshNow(signal?: AbortSignal): Promise<OAuthTokenSet> {
    if (pending) return pending;
    const run = (async () => {
      const old = await current();
      try {
        const fresh = await client.refresh(old, signal);
        await store.save(fresh);
        return fresh;
      } catch (e) {
        if (e instanceof OAuthError && e.code === 'invalid-grant') await store.clear();
        throw e;
      }
    })().finally(() => { pending = undefined; });
    pending = run;
    return run;
  }

  return {
    async getAccessToken(o = {}) {
      const t = await current();
      if (!o.forceRefresh && !client.isExpired(t, opts.skewMs)) return t.accessToken;
      return (await refreshNow(o.signal)).accessToken;
    },
    setTokens: (t) => store.save(t),
    async signOut(signal) {
      const t = await store.load();
      let revoked = false, revokeError: OAuthError | undefined;
      if (t && client.config.revocationEndpoint) {
        try {
          if (t.refreshToken) await client.revoke(t.refreshToken, 'refresh_token', t.clientId, signal);
          else await client.revoke(t.accessToken, 'access_token', t.clientId, signal);
          revoked = true;
        } catch (e) { revokeError = e instanceof OAuthError ? e : new OAuthError('network', 'Revocation failed.', { cause: e }); }
      }
      await store.clear();
      return { revoked, revokeError };
    },
  };
}
