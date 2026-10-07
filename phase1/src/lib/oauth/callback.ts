import { OAuthError } from './errors';
import { safeEqual } from './pkce';

export interface ParsedCallback { code: string; state: string; iss?: string; clientId?: string }

/**
 * Validate a redirect the browser delivered to the loopback receiver.
 * Accepts a full URL, a path+query, or a bare query string. Throws OAuthError.
 * Error messages never echo the code.
 */
export function parseCallback(input: string, expectedState: string, expectedIssuer?: string): ParsedCallback {
  let params: URLSearchParams;
  try {
    if (input.startsWith('?')) params = new URLSearchParams(input);
    else params = new URL(input, 'http://127.0.0.1').searchParams;
  } catch (cause) {
    throw new OAuthError('protocol', 'Callback URL is not valid.', { cause });
  }
  const state = params.get('state');
  const error = params.get('error');
  // State is checked first, also for error redirects: an attacker-injected error must not end a real flow.
  if (!state || !safeEqual(state, expectedState)) throw new OAuthError('state-mismatch', 'Authorization callback state does not match.');
  const iss = params.get('iss') ?? undefined;
  if (expectedIssuer !== undefined && iss !== undefined && iss !== expectedIssuer) throw new OAuthError('issuer-mismatch', 'Authorization callback issuer does not match.');
  if (error) {
    const description = params.get('error_description') ?? undefined;
    throw new OAuthError(error === 'access_denied' ? 'access-denied' : 'authorization-error', `Authorization failed: ${error}`, { providerError: error, providerDescription: description?.slice(0, 300) });
  }
  const code = params.get('code');
  if (!code) throw new OAuthError('protocol', 'Authorization callback carries no code.');
  return { code, state, iss, clientId: params.get('client_id') ?? undefined };
}
