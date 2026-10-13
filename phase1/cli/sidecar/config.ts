import { AgentPrivacyGate, AGENT_CONSENT_KEY, AGENT_CONSENT_VERSION } from '../../src/lib/agent/privacy';
import type { ConsentStorage } from '../../src/lib/agent/privacy';
import { OpenRouterProvider } from '../../src/lib/agent/openRouter';
import { ClaudeProvider } from '../../src/lib/agent/providers/claude';
import { OllamaProvider, isLoopbackHttp, normalizeBaseUrl } from '../../src/lib/agent/providers/ollama';
import { OpenAIProvider } from '../../src/lib/agent/openAI';
import { COMPAT_PROVIDERS, isCompatProvider } from '../../src/lib/agent/compatProviders';
import type { CompatProviderId } from '../../src/lib/agent/compatProviders';
import type { AgentProvider } from '../../src/lib/agent/types';
import type { FailureCode } from './contract';

export class ConfigError extends Error {
  constructor(message: string, readonly code: FailureCode = 'config') { super(message); this.name = 'ConfigError'; }
}
/** Environment variable that holds the API key of each OpenAI-compatible vendor. Keys are never read from files or flags. */
export const COMPAT_KEY_ENV: Readonly<Record<CompatProviderId, string>> = { xai: 'XAI_API_KEY', meta: 'META_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
const PROVIDER_LIST = 'openrouter, claude, openai, xai, meta, deepseek or ollama';
export interface ResolvedEngine { provider: AgentProvider; providerId: string; model: string }
type Env = Readonly<Record<string, string | undefined>>;

/**
 * Cloud consent in a headless run is an explicit operator opt-in (SOMNIA_ENGINE_CLOUD_CONSENT=1), the same gate the
 * desktop panel uses. Without it every cloud request fails closed.
 */
export function headlessPrivacyGate(env: Env): AgentPrivacyGate {
  const data = new Map<string, string>();
  if (env.SOMNIA_ENGINE_CLOUD_CONSENT === '1') data.set(AGENT_CONSENT_KEY, JSON.stringify({ version: AGENT_CONSENT_VERSION, grantedAt: new Date().toISOString() }));
  const storage: ConsentStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } };
  return new AgentPrivacyGate(() => storage);
}

/** Provider, model and keys come from the environment only. Missing or invalid values are typed `config` failures. */
export function resolveEngine(env: Env): ResolvedEngine {
  const providerId = (env.SOMNIA_ENGINE_PROVIDER ?? '').trim().toLowerCase();
  const model = (env.SOMNIA_ENGINE_MODEL ?? '').trim();
  if (!providerId) throw new ConfigError('No provider configured. Set SOMNIA_ENGINE_PROVIDER to ' + PROVIDER_LIST + '.');
  if (!model) throw new ConfigError('No model configured. Set SOMNIA_ENGINE_MODEL.');
  const gate = headlessPrivacyGate(env);
  const key = (name: string) => {
    const v = env[name];
    if (!v) throw new ConfigError(`${name} is not set.`, 'auth');
    return () => v;
  };
  const needConsent = () => {
    if (!gate.hasConsent()) throw new ConfigError('Cloud AI consent is required. Set SOMNIA_ENGINE_CLOUD_CONSENT=1 to allow sending this task to a cloud provider.', 'consent');
  };
  switch (providerId) {
    case 'openrouter': needConsent(); return { providerId, model, provider: new OpenRouterProvider({ getApiKey: key('OPENROUTER_API_KEY'), privacyGate: gate }) };
    case 'claude': needConsent(); return { providerId, model, provider: new ClaudeProvider({ getApiKey: key('ANTHROPIC_API_KEY'), privacyGate: gate }) };
    case 'openai': needConsent(); return { providerId, model, provider: new OpenAIProvider({ getApiKey: key('OPENAI_API_KEY'), privacyGate: gate }) };
    case 'xai': case 'meta': case 'deepseek': {
      if (!isCompatProvider(providerId)) break;
      needConsent();
      return { providerId, model, provider: new OpenAIProvider({ vendor: COMPAT_PROVIDERS[providerId], getApiKey: key(COMPAT_KEY_ENV[providerId]), privacyGate: gate }) };
    }
    case 'ollama': {
      let baseUrl: string;
      try { baseUrl = normalizeBaseUrl(env.SOMNIA_ENGINE_OLLAMA_URL); } catch { throw new ConfigError('SOMNIA_ENGINE_OLLAMA_URL is not a valid http(s) URL.'); }
      if (!isLoopbackHttp(baseUrl)) needConsent(); // a remote Ollama endpoint is cloud processing
      return { providerId, model, provider: new OllamaProvider({ baseUrl, requestTimeoutMs: 5000 }) };
    }
    default: throw new ConfigError(`Unsupported provider "${providerId.slice(0, 40)}". Use ${PROVIDER_LIST}.`);
  }
}
