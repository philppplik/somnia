import { runWithProviderConsent } from './privacy';
import { OPENAI_ACCOUNT_OAUTH_CONFIG, assertUsableAccountToken, toAccountAuthError } from './openAIAccount';
import type { OpenAIAccountAuth } from './openAIAccount';
import type { AgentPrivacyGate } from './privacy';
import { AgentError, classifyHttp } from './errors';
import type { AgentCloudConsentGuard, AgentProvider, AgentProviderEvent, AgentProviderRequest } from './types';

export interface OpenAIEndpoints { chat?: string; models?: string }
export interface OpenAIOptions {
  /**
   * API-key auth method: resolve from the credential service at request time.
   * Never persist in session. Mutually exclusive with `account` - the auth
   * method is an explicit user choice, never a silent fallback.
   */
  getApiKey?: () => string | Promise<string>;
  /**
   * Account auth method (ChatGPT-account OAuth): token source injected by the
   * OAuth client/token-store layer. On HTTP 401 the provider refreshes once
   * and retries once; a rejected refresh is an honest reconnect error.
   */
  account?: OpenAIAccountAuth;
  /**
   * Endpoint override for account mode, from the reviewed account config
   * (openAIAccount.ts). Defaults to the public API constants. HTTPS only.
   */
  endpoints?: OpenAIEndpoints;
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
/** Account-auth (Sign in with ChatGPT) inference endpoint: the Responses API. */
export const OPENAI_RESPONSES_ENDPOINT = OPENAI_ACCOUNT_OAUTH_CONFIG.responsesEndpoint;
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
function apiError(status: number, value?: unknown, prefix = 'OpenAI request failed'): AgentError {
  const error = value && typeof value === 'object' ? (value as {error?: {code?: unknown; type?: unknown; param?: unknown}}).error : undefined;
  const codes = [error?.code, error?.type];
  const message = `${prefix} (HTTP ${status}).`;
  if (codes.some(code => typeof code === 'string' && /^(insufficient_quota|billing_hard_limit_reached|billing_not_active|usage_limit_reached|monthly_spend_limit_reached|project_spend_limit_reached|credit_balance_exhausted|organization_spend_limit_exceeded|project_spend_limit_exceeded|organization_usage_limit_exceeded)$/.test(code)))
    return new AgentError('provider-error', 'credit', 'OpenAI API quota or billing limit reached. Check API billing and project limits.', false, status);
  if (codes.includes('context_length_exceeded')) return new AgentError('limit', 'context', message, false, status);
  if (codes.includes('model_not_found')) return new AgentError('provider-error', 'model-not-found', message, false, status);
  if (codes.includes('content_filter')) return new AgentError('provider-error', 'moderation', message, false, status);
  if (codes.includes('unsupported_parameter') && ['tools', 'tool_choice'].includes(String(error?.param)))
    return new AgentError('tool-unsupported', 'no-tool-support', message, false, status);
  return classifyHttp(status, {}, prefix);
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
/**
 * Account-mode errors. SIWC returns machine codes for subscription failures;
 * map them honestly and never retry billing/eligibility rejections. A 401 after
 * the single refresh retry means re-login, not "bad API key". The 503 codes
 * (subscription_sharing_usage_unavailable / _user_unavailable) fall through to
 * the retryable server classification, matching the documented bounded backoff.
 * Source: developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery
 * (verified live, 2026-10-07).
 */
function accountApiError(status: number, value?: unknown): AgentError {
  const error = value && typeof value === 'object' ? (value as {error?: {code?: unknown; type?: unknown}}).error : undefined;
  const codes = [error?.code, error?.type];
  const message = `OpenAI account request failed (HTTP ${status}).`;
  if (codes.includes('subscription_sharing_invalid_user')) return new AgentError('provider-error', 'account-auth', message, false, status);
  if (codes.includes('subscription_sharing_user_not_eligible')) return new AgentError('provider-error', 'not-eligible', message, false, status);
  if (codes.includes('subscription_sharing_usage_limit_exceeded')) return new AgentError('provider-error', 'usage-limit', message, false, status);
  if (codes.includes('subscription_sharing_unsupported_capability')) return new AgentError('tool-unsupported', 'no-tool-support', message, false, status);
  if (codes.includes('subscription_sharing_route_not_supported')) return new AgentError('provider-error', 'model-not-found', message, false, status);
  if (status === 401 || status === 403) return new AgentError('provider-error', 'account-auth', message, false, status);
  return apiError(status, value, 'OpenAI account request failed');
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
  private readonly chatEndpoint: string;
  private readonly modelsEndpoint: string;
  constructor(private readonly options: OpenAIOptions) {
    if (options.consentGuard !== undefined && typeof options.consentGuard !== 'function') throw Error('Invalid disclosure guard.');
    if (!!options.getApiKey === !!options.account) throw Error('Configure exactly one OpenAI auth method: API key or account.');
    const endpoint = (value: string | undefined, fallback: string): string => {
      if (value === undefined) return fallback;
      try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) throw 0; }
      catch { throw Error('OpenAI endpoints must be HTTPS URLs.'); }
      return value;
    };
    this.chatEndpoint = endpoint(options.endpoints?.chat, options.account ? OPENAI_ACCOUNT_OAUTH_CONFIG.responsesEndpoint : OPENAI_CHAT_ENDPOINT);
    this.modelsEndpoint = endpoint(options.endpoints?.models, options.account ? OPENAI_ACCOUNT_OAUTH_CONFIG.modelsEndpoint : OPENAI_MODELS_ENDPOINT);
  }
  private inFlightRefresh?: Promise<string>;
  /** One forced refresh at a time across concurrent requests; redacted errors only. */
  private refreshAccount(signal: AbortSignal): Promise<string> {
    if (!this.inFlightRefresh) {
      const account = this.options.account;
      if (!account) throw Error('Account auth is not configured.');
      this.inFlightRefresh = Promise.resolve()
        .then(() => { signal.throwIfAborted(); return account.refresh(signal); })
        .then(token => assertUsableAccountToken(token))
        .catch(error => { throw toAccountAuthError(error); })
        .finally(() => { this.inFlightRefresh = undefined; });
    }
    return this.inFlightRefresh;
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
    const producer = run({ provider: this.id, endpoint: this.chatEndpoint }, async guardedSignal => {
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
    await this.options.consentGuard?.({ provider: this.id, endpoint: this.chatEndpoint, request });
    request.signal.throwIfAborted();
    const credential = await this.credential();
    request.signal.throwIfAborted();
    if (this.options.account) {
      yield* this.streamResponses(request, credential);
      return;
    }
    const body = JSON.stringify({
      model: request.model, stream: true, store: false, max_completion_tokens: request.maxOutputTokens,
      stream_options: { include_usage: true },
      messages: request.messages.map(m => ({ role: m.role === 'system' && !/^gpt-(3\.5|4)(?:[.-]|$)/.test(request.model) ? 'developer' : m.role, content: m.content,
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        ...(m.toolCalls ? { tool_calls: m.toolCalls.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.arguments } })) } : {}) })),
      ...(request.tools.length ? { tools: request.tools.map(t => ({ type: 'function', function: t })) } : {}),
    });
    const response = await this.fetchWithRetry(this.chatEndpoint, credential, 'POST', body, request.signal);
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


  /**
   * Account-auth streaming against the Responses API (Sign in with ChatGPT).
   * Documented restrictions (SIWC, wave-3 research): send only model, store=false,
   * stream=true, instructions, input, function tools. Never send temperature,
   * top_p, max_output_tokens, previous_response_id or metadata - the account
   * route rejects them, so the server-side output-token budget does not exist
   * in this mode; the session's client-side limits still apply.
   * Event model cross-checked against MIT references (anomalyco/opencode
   * codex.ts, badlogic/pi-mono openai-codex-responses.ts; read, not copied).
   */
  private async *streamResponses(request: AgentProviderRequest, credential: string): AsyncGenerator<AgentProviderEvent> {
    const instructions = request.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n').slice(0, 256 * 1024);
    const input: Record<string, unknown>[] = [];
    for (const message of request.messages) {
      if (message.role === 'system') continue;
      if (message.role === 'user') {
        input.push({ role: 'user', content: [{ type: 'input_text', text: message.content }] });
      } else if (message.role === 'assistant') {
        if (message.content) input.push({ role: 'assistant', content: [{ type: 'output_text', text: message.content }] });
        for (const call of message.toolCalls ?? []) input.push({ type: 'function_call', call_id: call.id, name: call.name, arguments: call.arguments });
      } else {
        if (!message.toolCallId) throw new AgentError('provider-error', 'protocol', 'Tool result is missing its call reference.');
        input.push({ type: 'function_call_output', call_id: message.toolCallId, output: message.content });
      }
    }
    for (const item of input) {
      const id = item.call_id;
      if (id !== undefined && (typeof id !== 'string' || !id || id.length > 512 || /[\r\n\0]/.test(id)))
        throw new AgentError('provider-error', 'protocol', 'Invalid tool call reference.');
    }
    const body = JSON.stringify({
      model: request.model, store: false, stream: true,
      ...(instructions ? { instructions } : {}),
      input,
      ...(request.tools.length ? { tools: request.tools.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters })) } : {}),
    });
    const response = await this.fetchWithRetry(this.chatEndpoint, credential, 'POST', body, request.signal);
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      if (response.body && response.headers.get('content-type')?.includes('json')) {
        const err = await readJson(response, request.signal, 4096).catch(() => undefined);
        if (err) throw accountApiError(502, err);
      }
      throw new AgentError('provider-error', 'protocol', 'OpenAI did not return an event stream.');
    }
    let terminal = false, refused = false, sawFunctionCall = false;
    const argumentDeltas = new Set<number>();
    for await (const data of dataEvents(response.body, request.signal)) {
      if (data === '[DONE]') break;
      let event: any;
      try { event = JSON.parse(data); } catch { throw new AgentError('provider-error', 'protocol', 'Invalid provider stream event.'); }
      const type = event?.type;
      if (typeof type !== 'string') throw new AgentError('provider-error', 'protocol', 'Invalid provider stream event.');
      if (type === 'response.output_text.delta') {
        if (typeof event.delta !== 'string') throw new AgentError('provider-error', 'protocol', 'Invalid provider text event.');
        if (event.delta) yield { type: 'text', text: event.delta };
      } else if (type === 'response.refusal.delta') {
        refused = true;
      } else if (type === 'response.output_item.added') {
        const item = event.item;
        if (item?.type === 'function_call') {
          if (!Number.isSafeInteger(event.output_index) || event.output_index < 0 || typeof item.call_id !== 'string' || !item.call_id || item.call_id.length > 512 || typeof item.name !== 'string')
            throw new AgentError('provider-error', 'protocol', 'Invalid provider tool call.');
          sawFunctionCall = true;
          yield { type: 'tool-call', index: event.output_index, id: item.call_id, name: item.name };
        }
      } else if (type === 'response.function_call_arguments.delta') {
        if (!Number.isSafeInteger(event.output_index) || event.output_index < 0 || typeof event.delta !== 'string')
          throw new AgentError('provider-error', 'protocol', 'Invalid provider tool arguments.');
        argumentDeltas.add(event.output_index);
        if (event.delta) yield { type: 'tool-call', index: event.output_index, arguments: event.delta };
      } else if (type === 'response.function_call_arguments.done') {
        // Tolerate gateways that skip delta events and only deliver the final arguments.
        if (!Number.isSafeInteger(event.output_index) || event.output_index < 0) throw new AgentError('provider-error', 'protocol', 'Invalid provider tool arguments.');
        if (!argumentDeltas.has(event.output_index) && typeof event.arguments === 'string' && event.arguments)
          yield { type: 'tool-call', index: event.output_index, arguments: event.arguments };
      } else if (type === 'response.completed' || type === 'response.incomplete') {
        if (terminal) throw new AgentError('provider-error', 'protocol', 'Duplicate terminal provider event.');
        terminal = true;
        const finished = event.response ?? {};
        const usage = finished.usage;
        if (usage && typeof usage === 'object') yield { type: 'usage', usage: { inputTokens: finite(usage.input_tokens), outputTokens: finite(usage.output_tokens) } };
        if (type === 'response.incomplete') {
          const reason = finished.incomplete_details?.reason;
          if (reason === 'content_filter') throw new AgentError('provider-error', 'moderation', 'OpenAI account response was stopped by a content filter.');
          if (reason === 'max_output_tokens') throw new AgentError('limit', 'output-tokens', 'OpenAI account response exceeded its output budget.', true);
          throw new AgentError('provider-error', 'protocol', 'OpenAI account response did not complete.', true);
        }
        if (refused) throw new AgentError('provider-error', 'moderation', 'OpenAI account response was a refusal.');
        yield { type: 'finish', reason: sawFunctionCall ? 'tool_calls' : 'stop' };
      } else if (type === 'response.failed') {
        throw accountApiError(502, { error: event.response?.error });
      } else if (type === 'error') {
        throw accountApiError(502, { error: event.error ?? event });
      }
      // All other Responses event types (created, reasoning, content parts,
      // item.done, rate limits, ...) carry no adapter output and are ignored.
    }
    if (!terminal) throw new AgentError('provider-error', 'protocol', 'Provider stream ended without completion.', true);
  }

  private async credential(): Promise<string> {
    if (this.options.account) {
      try { return assertUsableAccountToken(await this.options.account.getAccessToken()); }
      catch (error) { throw toAccountAuthError(error); }
    }
    let key: string;
    try { key = await this.options.getApiKey!(); }
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
      const credential = await this.credential(); guardedSignal.throwIfAborted();
      const response = await this.fetchWithRetry(this.modelsEndpoint, credential, 'GET', undefined, guardedSignal);
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

  /** Retry HTTP rejection statuses only, never transport failures or partial SSE output.
   * Account auth adds one orthogonal retry: a single 401 triggers one forced token
   * refresh and one immediate retry. A second 401 is a plain auth failure. */
  private async fetchWithRetry(url: string, credential: string, method: 'GET' | 'POST', body: string | undefined, signal: AbortSignal): Promise<Response> {
    const accountMode = !!this.options.account;
    const prefix = accountMode ? 'OpenAI account request failed' : 'OpenAI request failed';
    let bearer = credential;
    let refreshed = false;
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
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body,
        });
        if (response.ok) return response;
        if (response.status === 401 && accountMode && !refreshed) {
          // Expired account token: refresh once, retry once. The request has not
          // streamed anything yet, so this retry is safe for POST as well.
          refreshed = true;
          await response.body?.cancel().catch(() => {});
          bearer = await this.refreshAccount(signal);
          signal.throwIfAborted();
          continue;
        }
        // Never echo response bodies: they can contain keys, private prompts or vendor HTML.
        const err = await readJson(response, signal, 4096).catch(() => undefined);
        failure = accountMode ? accountApiError(response.status, err) : apiError(response.status, err, prefix);
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
