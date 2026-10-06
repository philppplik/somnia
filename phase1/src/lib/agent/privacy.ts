/** Fail-closed network boundary. Call immediately before EVERY provider request/retry. */
export const AGENT_CONSENT_VERSION = 1;
export const AGENT_CONSENT_KEY = 'somnia.agent.cloud-consent.v1';
export const PROVIDER_PRIVACY_POLICIES = [
  {name: 'OpenAI', url: 'https://openai.com/policies/eu-privacy-policy/'},
  {name: 'Anthropic', url: 'https://privacy.claude.com/en/'},
  {name: 'OpenRouter', url: 'https://openrouter.ai/privacy'},
  {name: 'OpenRouter model providers', url: 'https://openrouter.ai/docs/guides/privacy/data-collection'},
] as const;
export type ProviderTarget = {provider: string; endpoint?: string; processing?: 'local' | 'cloud'};
export type ConsentRecord = {version: number; grantedAt: string};
export type ConsentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class AgentConsentRequiredError extends Error {
  readonly code = 'AGENT_CLOUD_CONSENT_REQUIRED';
  constructor() { super('Cloud AI consent is required.'); this.name = 'AgentConsentRequiredError'; }
}
/** processing:'local' must come from verified adapter metadata, never endpoint inference. */
export function isLocalOllama(target: ProviderTarget): boolean {
  if (target.provider !== 'ollama' || target.processing !== 'local' || !target.endpoint) return false;
  try {
    const url = new URL(target.endpoint);
    return url.protocol === 'http:' && !url.username && !url.password &&
      (url.hostname === 'localhost' || url.hostname === '[::1]' ||
        /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(url.hostname));
  } catch { return false; }
}
export class AgentPrivacyGate {
  private listeners = new Set<() => void>();
  private cloudRequests = new Set<AbortController>();
  constructor(private readonly storage: () => ConsentStorage | undefined = () =>
    typeof localStorage === 'undefined' ? undefined : localStorage) {}
  getConsent(): ConsentRecord | null {
    try {
      const raw = this.storage()?.getItem(AGENT_CONSENT_KEY);
      if (!raw) return null;
      const record = JSON.parse(raw);
      return record?.version === AGENT_CONSENT_VERSION && typeof record.grantedAt === 'string' &&
        Number.isFinite(Date.parse(record.grantedAt)) ? record : null;
    } catch { return null; }
  }
  /** Only invoke from an explicit unchecked-by-default consent control. */
  private grant(): boolean {
    try {
      const storage = this.storage();
      if (!storage) return false;
      storage.setItem(AGENT_CONSENT_KEY, JSON.stringify({version: AGENT_CONSENT_VERSION, grantedAt: new Date().toISOString()}));
      const saved = this.getConsent() !== null;
      this.notify();
      return saved;
    } catch { return false; }
  }
  revoke(): void {
    // Even if removal fails, overwrite with an invalid record before denying requests.
    this.revoked = true;
    this.abortCloudRequests();
    try { this.storage()?.setItem(AGENT_CONSENT_KEY, 'revoked'); } catch { /* session remains denied */ }
    try { this.storage()?.removeItem(AGENT_CONSENT_KEY); } catch { /* invalid record remains if write succeeded */ }
    this.notify();
  }
  private revoked = false;
  private notify(): void { this.listeners.forEach(listener => listener()); }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  hasConsent = (): boolean => !this.revoked && this.getConsent() !== null;
  /** Synchronize cross-window revocation; never revive a failed local revocation. */
  syncFromStorage(): void {
    if (!this.hasConsent()) this.abortCloudRequests();
    this.notify();
  }
  private abortCloudRequests(): void {
    this.cloudRequests.forEach(controller => controller.abort(new AgentConsentRequiredError()));
    this.cloudRequests.clear();
  }
  assert(target: ProviderTarget): void {
    if (!isLocalOllama(target) && !this.hasConsent()) throw new AgentConsentRequiredError();
  }
  async run<T>(target: ProviderTarget, operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    this.assert(target);
    const cloud = !isLocalOllama(target);
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
    if (cloud) this.cloudRequests.add(controller);
    try {
      controller.signal.throwIfAborted();
      this.assert(target);
      const result = await operation(controller.signal);
      controller.signal.throwIfAborted();
      this.assert(target); // No accepting output after consent was withdrawn.
      return result;
    } finally {
      signal?.removeEventListener('abort', abort);
      this.cloudRequests.delete(controller);
    }
  }
  /** A fresh explicit grant can undo a prior revocation, never a storage event. */
  grantExplicitConsent(): boolean {
    const saved = this.grant();
    if (saved) { this.revoked = false; this.notify(); }
    return saved;
  }
}
export const agentPrivacy = new AgentPrivacyGate();
export const assertProviderConsent = (target: ProviderTarget): void => agentPrivacy.assert(target);
export const runWithProviderConsent = <T>(target: ProviderTarget, operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> =>
  agentPrivacy.run(target, operation, signal);
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === AGENT_CONSENT_KEY || event.key === null) agentPrivacy.syncFromStorage();
});
/** Keep this metadata on assistant messages and proposed/applied changes, not just UI text. */
export type AIProvenance = {generatedBy: 'ai'; provider: string; model: string; generatedAt: string; humanReviewed: boolean};
export function createAIProvenance(provider: string, model: string): AIProvenance {
  return {generatedBy: 'ai', provider, model, generatedAt: new Date().toISOString(), humanReviewed: false};
}
