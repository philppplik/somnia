import { runWithProviderConsent } from './privacy';
import type { AgentPrivacyGate } from './privacy';
import { AgentError, classifyHttp } from './errors';
import type { AgentCloudConsentGuard, AgentProvider, AgentProviderEvent, AgentProviderRequest } from './types';

export interface OpenAIOptions {
  /** Resolve from the credential service at request time. Never persist in session. */
  getApiKey: () => string | Promise<string>;
  consentGuard?: AgentCloudConsentGuard;
  /** Test/host injection of the shared gate, not a replacement permission function. */
  privacyGate?: AgentPrivacyGate;
  fetch?: typeof globalThis.fetch;
  /** Retries for 408/429/5xx before any output was produced. Default 3 (4 attempts). */
  maxRetries?: number;
  /** Test injection. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}
export const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
export const OPENAI_MODELS_ENDPOINT = 'https://api.openai.com/v1/models';
const endpoint = OPENAI_CHAT_ENDPOINT;
export interface OpenAIModel { id: string; ownedBy: string; created: number }
const maxEventBytes = 1024 * 1024;

/** Incremental SSE parser: handles CRLF, comments, multi-line data and UTF-8 splits. */
async function* dataEvents(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', data: string[] = [], size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > maxEventBytes) throw new AgentError('limit', 'context', 'Provider event exceeds size limit.');
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line === '') {
          if (data.length) yield data.join('\n');
          data = []; size = 0;
        } else if (line.startsWith('data:')) {
          const part = line.slice(5).replace(/^ /, '');
          size += part.length;
          if (size > maxEventBytes) throw new AgentError('limit', 'context', 'Provider event exceeds size limit.');
          data.push(part);
        }
      }
      if (done) {
        // Tolerate a final event without the trailing blank line (some gateways omit it).
        if (buffer.startsWith('data:')) { data.push(buffer.slice(5).replace(/^ /, '').replace(/\r$/, '')); buffer = ''; }
        if (buffer.trim()) throw new AgentError('provider-error', 'protocol', 'Provider stream ended inside an event.');
        if (data.length) yield data.join('\n');
        break;
      }
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
/** Inspect only machine error codes. Never keep or echo provider messages. */
function apiError(status: number, value?: unknown): AgentError {
  const error = value && typeof value === 'object' ? (value as {error?: {code?: unknown; type?: unknown; param?: unknown}}).error : undefined;
  const codes = [error?.code, error?.type];
  const message = `OpenAI request failed (HTTP ${status}).`;
  if (codes.some(code => typeof code === 'string' && /^(insufficient_quota|billing_hard_limit_reached|billing_not_active|usage_limit_reached|monthly_spend_limit_reached|project_spend_limit_reached|credit_balance_exhausted|organization_spend_limit_exceeded|project_spend_limit_exceeded|organization_usage_limit_exceeded)$/.test(code)))
    return new AgentError('provider-error', 'credit', 'OpenAI API quota or billing limit reached. Check API billing and project limits.', false, status);
  if (codes.includes('context_length_exceeded')) return new AgentError('limit', 'context', message, false, status);
  if (codes.includes('model_not_found')) return new AgentError('provider-error', 'model-not-found', message, false, status);
  if (codes.includes('content_filter')) return new AgentError('provider-error', 'moderation', message, false, status);
  if (codes.includes('unsupported_parameter') && ['tools', 'tool_choice'].includes(String(error?.param)))
    return new AgentError('tool-unsupported', 'no-tool-support', message, false, status);
  return classifyHttp(status, {}, 'OpenAI request failed');
}
async function readJson(response: Response, signal: AbortSignal, limit: number): Promise<unknown> {
  if (!response.body) throw new AgentError('provider-error', 'protocol', 'Empty OpenAI response.');
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, {once: true});
  let text = '', bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const {value, done} = await reader.read(); signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new AgentError('provider-error', 'protocol', 'OpenAI response exceeds size limit.');
      text += decoder.decode(value, {stream: true});
    }
    text += decoder.decode();
    try { return JSON.parse(text); } catch { throw new AgentError('provider-error', 'protocol', 'Invalid OpenAI JSON response.'); }
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function retryDelay(header: string | null): number | undefined {
  if (header === null) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}
export class OpenAIProvider implements AgentProvider {
  readonly id = 'openai';
  readonly locality = 'cloud' as const;
  constructor(private readonly options: OpenAIOptions) {
    if (options.consentGuard !== undefined && typeof options.consentGuard !== 'function') throw Error('Invalid disclosure guard.');
  }
  async *stream(request: AgentProviderRequest): AsyncGenerator<AgentProviderEvent> {
    request = { ...request, messages: structuredClone(request.messages), tools: structuredClone(request.tools) };
    // Single-slot backpressure bridge keeps the shared gate alive until all SSE
    // consumption ends. Returning a Response from the gate would lose revocation.
    const controller = new AbortController();
    const abort = () => controller.abort(request.signal.reason);
    if (request.signal.aborted) abort(); else request.signal.addEventListener('abort', abort, { once: true });
    type Item = { event: AgentProviderEvent; ack: () => void } | { done: true } | { error: unknown };
    let resolveNext: ((item: Item) => void) | undefined;
    let slot: Item | undefined;
    let waitingAck: (() => void) | undefined;
    let activeSignal: AbortSignal | undefined;
    const push = (item: Item) => { if (resolveNext) { const resolve = resolveNext; resolveNext = undefined; resolve(item); } else slot = item; };
    const run = this.options.privacyGate ? this.options.privacyGate.run.bind(this.options.privacyGate) : runWithProviderConsent;
    const producer = run({ provider: this.id, endpoint }, async guardedSignal => {
      activeSignal = guardedSignal;
      for await (const event of this.streamAuthorized({ ...request, signal: guardedSignal })) {
        guardedSignal.throwIfAborted();
        await new Promise<void>(resolve => {
          const ack = () => {
            guardedSignal.removeEventListener('abort', ack);
            waitingAck = undefined; resolve();
          };
          waitingAck = ack;
          guardedSignal.addEventListener('abort', ack, { once: true });
          push({ event, ack });
          if (guardedSignal.aborted) ack();
        });
        guardedSignal.throwIfAborted();
      }
    }, controller.signal).then(() => push({ done: true }), error => push({ error }));
    try {
      while (true) {
        const item = slot ?? await new Promise<Item>(resolve => { resolveNext = resolve; });
        slot = undefined;
        if ('error' in item) throw item.error;
        if ('done' in item) break;
        request.signal.throwIfAborted();
        activeSignal?.throwIfAborted();
        yield item.event;
        waitingAck?.();
      }
    } finally {
      controller.abort(); waitingAck?.();
      request.signal.removeEventListener('abort', abort);
      await producer;
    }
  }
  private async *streamAuthorized(request: AgentProviderRequest): AsyncGenerator<AgentProviderEvent> {
    request.signal.throwIfAborted();
    if (!request.model.trim() || request.model.length > 512 || /[\r\n\0]/.test(request.model) || !Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1) {
      throw new AgentError('provider-error', 'protocol', 'Model and positive output token limit are required.');
    }
    await this.options.consentGuard?.({ provider: this.id, endpoint, request });
    request.signal.throwIfAborted();
    const apiKey = await this.credential();
    request.signal.throwIfAborted();
    const body = JSON.stringify({
      model: request.model, stream: true, store: false, max_completion_tokens: request.maxOutputTokens,
      stream_options: { include_usage: true },
      messages: request.messages.map(m => ({ role: m.role === 'system' && !/^gpt-(3\.5|4)(?:[.-]|$)/.test(request.model) ? 'developer' : m.role, content: m.content,
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        ...(m.toolCalls ? { tool_calls: m.toolCalls.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.arguments } })) } : {}) })),
      ...(request.tools.length ? { tools: request.tools.map(t => ({ type: 'function', function: t })) } : {}),
    });
    const response = await this.fetchWithRetry(endpoint, apiKey, 'POST', body, request.signal);
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      // Some upstream failures arrive as HTTP 200 with a JSON error body instead of a stream.
      if (response.body && response.headers.get('content-type')?.includes('json')) {
        const err = await readJson(response, request.signal, 4096).catch(() => undefined);
        if (err) throw apiError(502, err);
      }
      throw new AgentError('provider-error', 'protocol', 'OpenAI did not return an event stream.');
    }
    let ended = false;
    for await (const data of dataEvents(response.body, request.signal)) {
      if (data === '[DONE]') { ended = true; break; }
      let chunk;
      try { chunk = JSON.parse(data); } catch { throw new AgentError('provider-error', 'protocol', 'Invalid provider stream event.'); }
      if (!chunk || typeof chunk !== 'object') throw new AgentError('provider-error', 'protocol', 'Invalid provider stream event.');
      if (chunk.error) {
        const code = Number(chunk.error.status ?? chunk.error.code);
        throw apiError(Number.isInteger(code) && code >= 400 && code < 600 ? code : 502, chunk);
      }
      if (chunk.usage) yield { type: 'usage', usage: {
        inputTokens: finite(chunk.usage.prompt_tokens), outputTokens: finite(chunk.usage.completion_tokens),
      } };
      if (!Array.isArray(chunk.choices)) throw new AgentError('provider-error', 'protocol', 'Invalid OpenAI stream choices.');
      for (const choice of chunk.choices) {
        if (!choice || typeof choice !== 'object') throw new AgentError('provider-error', 'protocol', 'Invalid OpenAI stream choice.');
        if ((choice.index ?? 0) !== 0) continue;
        const delta = choice.delta ?? {};
        if (typeof delta.content === 'string' && delta.content) yield { type: 'text', text: delta.content };
        if (delta.tool_calls !== undefined && !Array.isArray(delta.tool_calls)) throw new AgentError('provider-error', 'protocol', 'Invalid OpenAI tool calls.');
        for (const tool of delta.tool_calls ?? []) {
          if (!tool || typeof tool !== 'object') throw new AgentError('provider-error', 'protocol', 'Invalid OpenAI tool call.');
          const index = tool.index;
          if (!Number.isSafeInteger(index) || index < 0) throw new AgentError('provider-error', 'protocol', 'Invalid provider tool index.');
          yield { type: 'tool-call', index,
            id: typeof tool.id === 'string' ? tool.id : undefined,
            name: typeof tool.function?.name === 'string' ? tool.function.name : undefined,
            arguments: typeof tool.function?.arguments === 'string' ? tool.function.arguments : undefined };
        }
        if (typeof choice.finish_reason === 'string') yield { type: 'finish', reason: choice.finish_reason };
      }
    }
    if (!ended) throw new AgentError('provider-error', 'protocol', 'Provider stream ended without completion.', true);
  }

  private async credential(): Promise<string> {
    let key: string;
    try { key = await this.options.getApiKey(); }
    catch { throw new AgentError('provider-error', 'auth', 'Could not read OpenAI credential from the credential store.'); }
    if (typeof key !== 'string' || !key.trim() || key.length > 8192 || /[\r\n\0]/.test(key))
      throw new AgentError('provider-error', 'auth', 'OpenAI credential is missing or invalid.');
    return key;
  }

  /** Non-inference discovery. Catalog membership does not prove chat/tool compatibility. */
  async listModels(signal: AbortSignal): Promise<OpenAIModel[]> {
    const run = this.options.privacyGate ? this.options.privacyGate.run.bind(this.options.privacyGate) : runWithProviderConsent;
    return run({provider: this.id, endpoint: OPENAI_MODELS_ENDPOINT}, async guardedSignal => {
      guardedSignal.throwIfAborted();
      const key = await this.credential(); guardedSignal.throwIfAborted();
      const response = await this.fetchWithRetry(OPENAI_MODELS_ENDPOINT, key, 'GET', undefined, guardedSignal);
      let value: any;
      try { value = await readJson(response, guardedSignal, 4 * 1024 * 1024); } catch {
        guardedSignal.throwIfAborted();
        throw new AgentError('provider-error', 'protocol', 'Invalid OpenAI model catalog.');
      }
      guardedSignal.throwIfAborted();
      if (value?.object !== 'list' || !Array.isArray(value.data) || value.data.length > 10000)
        throw new AgentError('provider-error', 'protocol', 'Invalid OpenAI model catalog.');
      const models: OpenAIModel[] = []; const ids = new Set<string>();
      for (const model of value.data) {
        if (!model || typeof model.id !== 'string' || !model.id || model.id.length > 512 || /[\r\n\0]/.test(model.id) || typeof model.owned_by !== 'string' || !Number.isSafeInteger(model.created) || model.created < 0)
          throw new AgentError('provider-error', 'protocol', 'Invalid OpenAI model catalog.');
        if (!ids.has(model.id)) { ids.add(model.id); models.push({id: model.id, ownedBy: model.owned_by, created: model.created}); }
      }
      return models.sort((a, b) => a.id.localeCompare(b.id));
    }, signal);
  }

  /** Retry HTTP rejection statuses only, never transport failures or partial SSE output. */
  private async fetchWithRetry(url: string, apiKey: string, method: 'GET' | 'POST', body: string | undefined, signal: AbortSignal): Promise<Response> {
    const configured = this.options.maxRetries ?? 3;
    const retries = Number.isSafeInteger(configured) ? Math.min(3, Math.max(0, configured)) : 0;
    const sleep = this.options.sleep ?? ((ms: number, s: AbortSignal) => new Promise<void>((resolve, reject) => {
      s.throwIfAborted();
      const t = setTimeout(() => { s.removeEventListener('abort', onAbort); resolve(); }, ms);
      const onAbort = () => { clearTimeout(t); reject(s.reason); };
      s.addEventListener('abort', onAbort, { once: true });
    }));
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      let failure: AgentError;
      let retryAfter: number | undefined;
      try {
        const response = await (this.options.fetch ?? globalThis.fetch)(url, {
          method, redirect: 'error', signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body,
        });
        if (response.ok) return response;
        // Never echo response bodies: they can contain keys, private prompts or vendor HTML.
        const err = await readJson(response, signal, 4096).catch(() => undefined);
        failure = apiError(response.status, err);
        retryAfter = retryDelay(response.headers.get('retry-after'));
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof AgentError) throw error;
        // A failed POST may already have run and incurred cost. Never retry an ambiguous transport failure.
        throw new AgentError('provider-error', 'network', 'Network request to OpenAI failed.', true);
      }
      if (!failure.retryable || attempt >= retries || (retryAfter !== undefined && retryAfter > 15000)) throw failure;
      await sleep(retryAfter ?? Math.min(1000 * 2 ** attempt + Math.random() * 250, 15000), signal);
    }
  }
}
