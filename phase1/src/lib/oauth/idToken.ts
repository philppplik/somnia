import { OAuthError } from './errors';
import { base64UrlDecode, safeEqual } from './pkce';

export interface Jwk { kty: string; kid?: string; alg?: string; use?: string; n?: string; e?: string; crv?: string; x?: string; y?: string }
export interface IdTokenExpectations {
  issuer: string;
  /** Must be contained in `aud`. */
  audience: string;
  nonce?: string;
  /** Keys, or a function that fetches them (e.g. from jwks_uri). */
  jwks: readonly Jwk[] | ((kid: string | undefined) => Promise<readonly Jwk[]>);
  /** Accepted algorithms. Default all three. */
  algorithms?: readonly ('RS256' | 'PS256' | 'ES256')[];
  now?: () => number;
  clockSkewSec?: number;
}

const json = (b64: string): Record<string, unknown> => JSON.parse(new TextDecoder().decode(base64UrlDecode(b64)));
const bad = (msg: string, cause?: unknown) => new OAuthError('id-token-invalid', msg, { cause });

/** Load a JWKS document (https, loopback http allowed). */
export async function fetchJwks(uri: string, deps: { fetch?: typeof globalThis.fetch; timeoutMs?: number } = {}): Promise<Jwk[]> {
  const u = new URL(uri);
  if (u.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw new OAuthError('insecure-endpoint', 'jwks_uri must use https.');
  try {
    const res = await (deps.fetch ?? globalThis.fetch)(uri, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(deps.timeoutMs ?? 15_000), redirect: 'error' });
    if (!res.ok) throw new OAuthError('protocol', `JWKS answered HTTP ${res.status}.`, { status: res.status });
    const doc = await res.json() as { keys?: Jwk[] };
    if (!Array.isArray(doc.keys)) throw new OAuthError('protocol', 'JWKS has no keys.');
    return doc.keys;
  } catch (cause) {
    if (cause instanceof OAuthError) throw cause;
    throw new OAuthError('network', 'JWKS could not be loaded.', { cause });
  }
}

/**
 * Verify an OIDC id_token: signature (RS256, PS256, ES256; restrict with `algorithms`), iss, aud, exp/nbf/iat skew, nonce.
 * `alg: none` and HMAC are rejected. Returns the claims.
 */
export async function verifyIdToken(idToken: string, exp: IdTokenExpectations): Promise<Record<string, unknown>> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw bad('id_token is not a compact JWS.');
  let header: Record<string, unknown>, claims: Record<string, unknown>;
  try { header = json(parts[0]); claims = json(parts[1]); } catch (cause) { throw bad('id_token is not decodable.', cause); }
  const alg = header.alg;
  if ((alg !== 'RS256' && alg !== 'PS256' && alg !== 'ES256') || !(exp.algorithms ?? ['RS256', 'PS256', 'ES256']).includes(alg)) throw bad('id_token algorithm is not supported.');
  const kid = typeof header.kid === 'string' ? header.kid : undefined;
  const keys = typeof exp.jwks === 'function' ? await exp.jwks(kid) : exp.jwks;
  const candidates = keys.filter((k) => (kid ? k.kid === kid : true) && (alg !== 'ES256' ? k.kty === 'RSA' : k.kty === 'EC' && k.crv === 'P-256') && (!k.use || k.use === 'sig') && (!k.alg || k.alg === alg));
  if (!candidates.length) throw bad('No matching signing key.');
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`) as Uint8Array<ArrayBuffer>;
  const sig = base64UrlDecode(parts[2]) as Uint8Array<ArrayBuffer>;
  let ok = false;
  for (const jwk of candidates) {
    try {
      const importAlg = alg === 'RS256' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : alg === 'PS256' ? { name: 'RSA-PSS', hash: 'SHA-256' } : { name: 'ECDSA', namedCurve: 'P-256' };
      const key = await crypto.subtle.importKey('jwk', jwk as JsonWebKey, importAlg, false, ['verify']);
      ok = await crypto.subtle.verify(alg === 'RS256' ? 'RSASSA-PKCS1-v1_5' : alg === 'PS256' ? { name: 'RSA-PSS', saltLength: 32 } : { name: 'ECDSA', hash: 'SHA-256' }, key, sig, data);
      if (ok) break;
    } catch { /* try next key */ }
  }
  if (!ok) throw bad('id_token signature is invalid.');
  if (claims.iss !== exp.issuer) throw bad('id_token issuer does not match.');
  const aud = claims.aud;
  if (!(typeof aud === 'string' ? aud === exp.audience : Array.isArray(aud) && aud.includes(exp.audience))) throw bad('id_token audience does not match.');
  const nowSec = Math.floor((exp.now ?? Date.now)() / 1000), skew = exp.clockSkewSec ?? 120;
  if (typeof claims.exp !== 'number' || nowSec - skew >= claims.exp) throw bad('id_token is expired.');
  if (typeof claims.nbf === 'number' && nowSec + skew < claims.nbf) throw bad('id_token is not valid yet.');
  if (typeof claims.iat === 'number' && nowSec + skew < claims.iat) throw bad('id_token was issued in the future.');
  if (exp.nonce !== undefined && (typeof claims.nonce !== 'string' || !safeEqual(claims.nonce, exp.nonce))) throw new OAuthError('nonce-mismatch', 'id_token nonce does not match.');
  return claims;
}
