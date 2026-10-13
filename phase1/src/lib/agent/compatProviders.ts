/**
 * Registry of OpenAI-compatible cloud providers that have their own API, key slot and model list.
 * One entry per provider: add an entry here (and the matching Rust allow-list rows) to add a provider.
 * Endpoints are fixed HTTPS URLs from each vendor's official API documentation (see docs/agent/additional-providers.md).
 */
export interface CompatProvider {
  id: 'xai' | 'meta' | 'deepseek';
  label: string;
  chat: string;
  models: string;
  /** Preferred inference protocol. DeepSeek uses Chat Completions. */
  responses?: string;
  /** Vendor privacy/terms page shown in the cloud-consent dialog. */
  privacy: {name: string; url: string};
  /** Chat Completions field that bounds the output. */
  maxTokensField: 'max_completion_tokens' | 'max_tokens';
}
export const COMPAT_PROVIDERS: Readonly<Record<CompatProvider['id'], CompatProvider>> = {
  xai: {id: 'xai', label: 'Grok (xAI)', chat: 'https://api.x.ai/v1/chat/completions', models: 'https://api.x.ai/v1/models', responses: 'https://api.x.ai/v1/responses', privacy: {name: 'xAI', url: 'https://x.ai/legal/privacy-policy'}, maxTokensField: 'max_completion_tokens'},
  meta: {id: 'meta', label: 'Meta Model API (Muse)', chat: 'https://api.meta.ai/v1/chat/completions', models: 'https://api.meta.ai/v1/models', responses: 'https://api.meta.ai/v1/responses', privacy: {name: 'Meta Model API', url: 'https://dev.meta.ai/legal/terms-of-service'}, maxTokensField: 'max_completion_tokens'},
  deepseek: {id: 'deepseek', label: 'DeepSeek', chat: 'https://api.deepseek.com/chat/completions', models: 'https://api.deepseek.com/models', privacy: {name: 'DeepSeek', url: 'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html'}, maxTokensField: 'max_tokens'},
};
export type CompatProviderId = CompatProvider['id'];
export function isCompatProvider(id: string): id is CompatProviderId { return Object.hasOwn(COMPAT_PROVIDERS, id); }
