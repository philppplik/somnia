import { AgentError } from './errors';

/**
 * OpenAI account authentication: the official "Sign in with ChatGPT" (SIWC)
 * flow for open-source apps, next to classic API-key auth.
 *
 * Values below come from the wave-3 SIWC research (official OpenAI sources:
 * https://developers.openai.com/siwc and the linked cookbook, checked
 * 2026-10-07). This is deliberately NOT the Codex-CLI client registration and
 * NOT the chatgpt.com/backend-api endpoint.
 *
 * This module owns:
 *  1. The shared OAuth/API configuration for the account login.
 *  2. The seam between the OpenAI provider adapter and the OAuth client/token
 *     store (branches feature/oauth-client, feature/oauth-store): the provider
 *     only knows `OpenAIAccountAuth`.
 *
 * UI contract (feature/auth-ui, binding): the auth method is an explicit user
 * choice - 'account' or 'api-key'. There is no silent fallback between them.
 */

export interface OpenAIAccountOAuthConfig {
  /** Authorization endpoint for the system-browser login (PKCE S256). */
  authorizeEndpoint: string;
  /** Token endpoint for the code exchange and refresh (form POST). */
  tokenEndpoint: string;
  /** Expected ID-token issuer (exact match; auth0.openai.com is NOT accepted). */
  issuer: string;
  /** Only source for ID-token signature verification keys (RS256/PS256). */
  jwksUri: string;
  /**
   * OIDC discovery document. DRIFT-CHECK ONLY: never take token/authorize
   * endpoints from a fetched discovery document at runtime.
   */
  openidConfiguration: string;
  /**
   * Client ID used for the FIRST login of an installation (dynamic client
   * registration). The callback issues a per-account client ID (oaiapp_...)
   * that the token store persists and reuses for refresh and re-login.
   */
  registrationClientId: string;
  /** Requested scopes; chatgpt.tokens.use.direct gates direct API inference. */
  scopes: string[];
  /** Audience/resource indicator requested with the grant. */
  resource: string;
  /** Display name hint shown on the OpenAI consent screen. */
  agentNameHint: string;
  /** Loopback callback path; the port is chosen by the OAuth client. */
  callbackPath: string;
  /** Account-token inference endpoint (Responses API). */
  responsesEndpoint: string;
  /** Model discovery endpoint, valid for account tokens too. */
  modelsEndpoint: string;
}

/**
 * Official SIWC values (wave-3 research, 2026-10-07). Per-installation state
 * that is NOT here on purpose: the stable ext_agent_host_id (urn:uuid, must be
 * persisted before the first login) and the issued per-account client ID -
 * both belong to the token store, never to this shared constant.
 */
/**
 * BINDING FAIL-CLOSED RULE (owner-facing decision, wave-3 research 2026-10-07):
 * these endpoints are a hardcoded allowlist. Token traffic only ever goes to
 * https://auth.openai.com/api/accounts/*, ID-token verification only against
 * the pinned JWKS URI and issuer below. Discovery documents are drift checks,
 * never runtime anchors. Extending this allowlist requires a real live test
 * and a documented owner decision. None of this has been tested against a
 * real ChatGPT account yet.
 */
export const OPENAI_ACCOUNT_OAUTH_CONFIG: OpenAIAccountOAuthConfig = {
  issuer: 'https://auth.openai.com',
  jwksUri: 'https://auth.openai.com/.well-known/jwks.json',
  authorizeEndpoint: 'https://auth.openai.com/api/accounts/authorize',
  tokenEndpoint: 'https://auth.openai.com/api/accounts/oauth/token',
  openidConfiguration: 'https://auth.openai.com/.well-known/openid-configuration',
  registrationClientId: 'dynamic_agent_client',
  scopes: ['openid', 'profile', 'email', 'offline_access', 'resource.invoke', 'chatgpt.tokens.use.direct'],
  resource: 'https://api.openai.com/v1',
  agentNameHint: 'Somnia',
  callbackPath: '/auth/callback',
  responsesEndpoint: 'https://api.openai.com/v1/responses',
  modelsEndpoint: 'https://api.openai.com/v1/models',
};

export interface OpenAIAccountConfigStatus {
  configured: boolean;
  /** Dotted field names that are missing or invalid, e.g. 'clientId'. */
  missing: string[];
}

function validEndpoint(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !!url.hostname;
  } catch { return false; }
}

/** Inspect the config without throwing; the UI uses this to gate the login button. */
export function openAIAccountConfigStatus(config: OpenAIAccountOAuthConfig = OPENAI_ACCOUNT_OAUTH_CONFIG): OpenAIAccountConfigStatus {
  const missing: string[] = [];
  if (!validEndpoint(config.authorizeEndpoint)) missing.push('authorizeEndpoint');
  if (!validEndpoint(config.tokenEndpoint)) missing.push('tokenEndpoint');
  if (!validEndpoint(config.openidConfiguration)) missing.push('openidConfiguration');
  if (config.issuer !== 'https://auth.openai.com') missing.push('issuer');
  if (config.jwksUri !== 'https://auth.openai.com/.well-known/jwks.json') missing.push('jwksUri');
  if (typeof config.registrationClientId !== 'string' || !config.registrationClientId.trim() || /\s/.test(config.registrationClientId) || config.registrationClientId.length > 256) missing.push('registrationClientId');
  if (!Array.isArray(config.scopes) || config.scopes.length === 0 || config.scopes.length > 32 || config.scopes.some(s => typeof s !== 'string' || !s.trim() || /\s/.test(s) || s.length > 128)) missing.push('scopes');
  if (!validEndpoint(config.resource)) missing.push('resource');
  if (typeof config.agentNameHint !== 'string' || !config.agentNameHint.trim() || config.agentNameHint.length > 64) missing.push('agentNameHint');
  if (typeof config.callbackPath !== 'string' || !/^\/[A-Za-z0-9/_-]{0,128}$/.test(config.callbackPath)) missing.push('callbackPath');
  if (!validEndpoint(config.responsesEndpoint)) missing.push('responsesEndpoint');
  if (!validEndpoint(config.modelsEndpoint)) missing.push('modelsEndpoint');
  return { configured: missing.length === 0, missing };
}

/** Fail closed when the shared config was broken by an edit. Never logs config content. */
export function requireOpenAIAccountConfig(config: OpenAIAccountOAuthConfig = OPENAI_ACCOUNT_OAUTH_CONFIG): OpenAIAccountOAuthConfig {
  const status = openAIAccountConfigStatus(config);
  if (!status.configured) {
    throw new AgentError('provider-error', 'account-auth',
      `OpenAI account sign-in is not configured correctly (invalid: ${status.missing.join(', ')}). Use an API key instead.`);
  }
  return config;
}

// ---------------------------------------------------------------------------
// Provider-side seam: where the account token comes from
// ---------------------------------------------------------------------------

/**
 * Implemented by the OAuth client + token store branches
 * (feature/oauth-client, feature/oauth-store) and injected into the provider.
 * Requirements for implementations (from the SIWC research):
 *  - Access tokens live ~1h; refresh tokens ~30d and ROTATE on every refresh:
 *    persist the replacement before discarding the old one.
 *  - Refresh must be single-flight (serialize concurrent refresh attempts).
 *  - Never fall back to an API key on account errors; surface re-login instead.
 *  - Throw AgentError-compatible, redacted errors - raw store or server text
 *    never crosses this boundary.
 */
export interface OpenAIAccountAuth {
  /**
   * Current access token for the connected account.
   * Rejects (honest 'account-auth' error) when no account is connected or the
   * session expired beyond refresh; the provider never falls back to an API key.
   */
  getAccessToken(signal?: AbortSignal): Promise<string>;
  /**
   * Forced refresh after the provider answered HTTP 401. Resolves with the
   * new access token; rejects when the session must be reconnected.
   */
  refresh(signal?: AbortSignal): Promise<string>;
}

/** Access tokens get the same hygiene as API keys: bounded, no whitespace/control chars. */
export function assertUsableAccountToken(token: unknown): string {
  if (typeof token !== 'string') throw accountSessionError();
  const value = token.trim();
  if (!value || new TextEncoder().encode(value).length > 8192 || /[\x00-\x20\x7f]/.test(value)) throw accountSessionError();
  return value;
}

/** Fixed, honest message. Raw token-store or server text is never surfaced. */
export function accountSessionError(): AgentError {
  return new AgentError('provider-error', 'account-auth',
    'The OpenAI account session is missing or expired. Reconnect the account in Agent configuration, or switch back to an API key.');
}

/** Map anything crossing the seam to the redacted account error; AgentErrors pass through. */
export function toAccountAuthError(error: unknown): AgentError {
  return error instanceof AgentError ? error : accountSessionError();
}
