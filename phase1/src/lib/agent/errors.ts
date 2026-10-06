/** Assumption: the core contract defines no error event, so providers reject/throw. */
export type ProviderErrorCode = 'unreachable' | 'model-not-found' | 'http' | 'protocol' | 'timeout' | 'not-local';
export class ProviderError extends Error {
  constructor(public code: ProviderErrorCode, message: string) { super(message); this.name = 'ProviderError'; }
}
