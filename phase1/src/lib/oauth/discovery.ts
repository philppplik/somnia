import { OAuthError } from './errors';
import type { OAuthClientConfig } from './types';

export interface OAuthDiscovery {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint?: string;
  jwksUri?: string;
  scopesSupported?: string[];
}

/** Fetch `<issuer>/.well-known/openid-configuration` (or an explicit URL). https only (loopback http allowed). */
export async function fetchDiscovery(urlOrIssuer: string, deps: { fetch?: typeof globalThis.fetch; timeoutMs?: number; allowInsecure?: boolean } = {}): Promise<OAuthDiscovery> {
  let url: URL;
  try { url = new URL(urlOrIssuer); } catch (cause) { throw new OAuthError('invalid-config', 'Discovery URL is not valid.', { cause }); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (loopback || deps.allowInsecure))) throw new OAuthError('insecure-endpoint', 'Discovery URL must use https.');
  const explicit = url.pathname.includes('/.well-known/');
  if (!explicit) url = new URL(`${url.pathname.replace(/\/$/, '')}/.well-known/openid-configuration`, url);
  let res: Response;
  let doc: unknown;
  try {
    res = await (deps.fetch ?? globalThis.fetch)(url.toString(), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(deps.timeoutMs ?? 15_000), redirect: 'error' });
    if (!res.ok) throw new OAuthError('protocol', `Discovery answered HTTP ${res.status}.`, { status: res.status });
    doc = await res.json();
  } catch (cause) {
    if (cause instanceof OAuthError) throw cause;
    throw new OAuthError('network', 'Discovery document could not be loaded.', { cause });
  }
  const d = doc as Record<string, unknown> | null;
  const str = (k: string) => (typeof d?.[k] === 'string' && d[k] ? d[k] as string : undefined);
  const issuer = str('issuer'), authorizationEndpoint = str('authorization_endpoint'), tokenEndpoint = str('token_endpoint');
  if (!issuer || !authorizationEndpoint || !tokenEndpoint) throw new OAuthError('protocol', 'Discovery document lacks issuer or endpoints.');
  // OIDC Discovery 4.3: the issuer in the document must match the one it was fetched for.
  if (!explicit && new URL(issuer).origin + new URL(issuer).pathname.replace(/\/$/, '') !== url.origin + url.pathname.replace(/\/\.well-known\/openid-configuration$/, '')) throw new OAuthError('issuer-mismatch', 'Discovery issuer does not match the requested issuer.');
  return { issuer, authorizationEndpoint, tokenEndpoint, revocationEndpoint: str('revocation_endpoint'), jwksUri: str('jwks_uri'), scopesSupported: Array.isArray(d?.scopes_supported) ? (d!.scopes_supported as unknown[]).filter((x): x is string => typeof x === 'string') : undefined };
}

/** Fill endpoint fields of a client config from discovery. Explicit values in `base` win. */
export function configFromDiscovery(base: Omit<OAuthClientConfig, 'authorizeEndpoint' | 'tokenEndpoint'> & Partial<Pick<OAuthClientConfig, 'authorizeEndpoint' | 'tokenEndpoint'>>, d: OAuthDiscovery): OAuthClientConfig {
  return { ...base, authorizeEndpoint: base.authorizeEndpoint ?? d.authorizationEndpoint, tokenEndpoint: base.tokenEndpoint ?? d.tokenEndpoint, revocationEndpoint: base.revocationEndpoint ?? d.revocationEndpoint, issuer: base.issuer ?? d.issuer };
}
