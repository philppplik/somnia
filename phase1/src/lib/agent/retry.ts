import { AgentError, classifyHttp, readHttpError } from './errors';

export interface RetryOptions {
  maxRetries?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
}
/** Never retry a stream: only the initial response, before consuming model output. */
export async function fetchProviderResponse(fetchResponse: () => Promise<Response>, signal: AbortSignal, options: RetryOptions = {}): Promise<Response> {
  const retries = Number.isFinite(options.maxRetries) ? Math.min(5, Math.max(0, Math.floor(options.maxRetries!))) : 3;
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    let failure: AgentError;
    let retryAfter: number | undefined;
    try {
      const response = await fetchResponse();
      signal.throwIfAborted();
      if (response.ok) return response;
      const error = await readHttpError(response).catch(() => undefined);
      signal.throwIfAborted();
      failure = classifyHttp(response.status, error?.hint, 'Provider request failed');
      retryAfter = parseRetryAfter(response.headers.get('retry-after'));
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof AgentError) throw error;
      failure = new AgentError('provider-error', 'network', 'Network request to the provider failed.', true);
    }
    // Respect long cooldowns without holding the UI indefinitely or retrying too early.
    if (retryAfter !== undefined) failure = new AgentError(failure.code, failure.detail, failure.message, failure.retryable, failure.status, retryAfter);
    if (!failure.retryable || attempt >= retries || (retryAfter ?? 0) > 60_000) throw failure;
    const jitter = Math.min(1, Math.max(0, (options.random ?? Math.random)()));
    const backoff = Math.min(15_000, 1000 * 2 ** attempt * (failure.detail === 'rate-limited' ? 2 : 1)) * (1 + jitter * 0.25);
    await (options.sleep ?? abortableSleep)(Math.max(retryAfter ?? 0, backoff), signal);
  }
}
/** Retry-After accepts delta seconds or an HTTP date; invalid/past values are ignored. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value?.trim()) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) {
    const ms = Number(value) * 1000;
    return Number.isFinite(ms) ? ms : undefined;
  }
  // Do not interpret negative numbers as dates.
  if (!/[a-z]/i.test(value)) return undefined;
  const ms = Date.parse(value) - now;
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}
