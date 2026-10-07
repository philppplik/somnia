import { runWithProviderConsent, type AgentPrivacyGate } from '../privacy';
import { AgentError, classifyHttp } from '../errors';
import type { AgentCloudConsentGuard, AgentMessage, AgentProvider, AgentProviderEvent, AgentProviderRequest } from '../types';

export interface ClaudeOptions {
  /** Resolve the provider-specific OS credential at request time. Never persist in chat. */
  getApiKey: () => string | Promise<string>;
  fetch?: typeof globalThis.fetch;
  /** Explicit prototype opt-in only; prefer a native host fetch bridge. Default false. */
  allowBrowserAccess?: boolean;
  privacyGate?: AgentPrivacyGate;
  consentGuard?: AgentCloudConsentGuard;
  /** Only retries HTTP/network failures before any stream has been consumed. */
  maxRetries?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}
export interface ClaudeModel { id: string; name: string; createdAt?: string }
const endpoint = 'https://api.anthropic.com/v1/messages';
const modelsEndpoint = 'https://api.anthropic.com/v1/models';
const eventLimit = 1024 * 1024;
const protocol = () => new AgentError('provider-error', 'protocol', 'Invalid Claude response.');
const finite = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;

/** Named SSE events carry matching JSON type fields. Ignore comments/unknown types. */
async function* dataEvents(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '', data: string[] = [], size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const {value, done} = await reader.read();
      signal.throwIfAborted();
      try { buffer += decoder.decode(value, {stream: !done}); } catch { throw protocol(); }
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line.length > eventLimit) throw new AgentError('limit', 'context', 'Claude event exceeds size limit.');
        if (!line) {
          if (data.length) yield data.join('\n');
          data = []; size = 0;
        } else if (line.startsWith('data:')) {
          const part = line.slice(5).replace(/^ /, '');
          size += part.length;
          if (size > eventLimit) throw new AgentError('limit', 'context', 'Claude event exceeds size limit.');
          data.push(part);
        }
      }
      if (buffer.length > eventLimit) throw new AgentError('limit', 'context', 'Claude event exceeds size limit.');
      if (done) {
        if (buffer.startsWith('data:')) {
          const part = buffer.slice(5).replace(/^ /, '').replace(/\r$/, '');
          if (size + part.length > eventLimit) throw new AgentError('limit', 'context', 'Claude event exceeds size limit.');
          data.push(part); buffer = '';
        }
        if (buffer.trim()) throw protocol();
        if (data.length) yield data.join('\n');
        return;
      }
    }
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof AgentError) throw error;
    throw new AgentError('provider-error', 'network', 'Claude stream connection failed.', true);
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {}); reader.releaseLock();
  }
}
type Block = Record<string, unknown>;
/** Anthropic has a top-level system prompt and user tool_result blocks, not tool roles. */
function convertMessages(messages: readonly AgentMessage[]) {
  const system: Block[] = [], result: {role: 'user' | 'assistant'; content: Block[]}[] = [];
  for (const message of messages) {
    if (message.role === 'system') {
      if (result.length) throw new AgentError('provider-error', 'protocol', 'Claude system prompts must precede conversation messages.');
      if (message.content) system.push({type:'text', text:message.content});
      continue;
    }
    const role = message.role === 'tool' ? 'user' : message.role;
    const content: Block[] = [];
    if (message.role === 'tool') {
      if (!message.toolCallId) throw protocol();
      content.push({type:'tool_result', tool_use_id:message.toolCallId, content:message.content});
    } else {
      if (message.content) content.push({type:'text', text:message.content});
      for (const call of message.toolCalls ?? []) {
        if (role !== 'assistant' || !call.id || !call.name) throw protocol();
        let input: unknown;
        try { input = JSON.parse(call.arguments); } catch { throw protocol(); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw protocol();
        content.push({type:'tool_use', id:call.id, name:call.name, input});
      }
    }
    if (!content.length) throw protocol();
    const last = result.at(-1);
    if (last?.role === role) last.content.push(...content);
    else result.push({role, content});
  }
  if (!result.length || result[0].role !== 'user') throw protocol();
  return {messages:result, ...(system.length ? {system} : {})};
}
function streamError(type: unknown): AgentError {
  const statuses: Record<string, number> = {authentication_error:401, permission_error:403, not_found_error:404,
    request_too_large:413, rate_limit_error:429, api_error:500, overloaded_error:529, invalid_request_error:400};
  return classifyHttp(typeof type === 'string' ? statuses[type] ?? 502 : 502, {}, 'Claude request failed');
}
export class ClaudeProvider implements AgentProvider {
  readonly id = 'claude';
  readonly locality = 'cloud' as const;
  constructor(private readonly options: ClaudeOptions) {}
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
  private async key(signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    if (typeof window !== 'undefined' && !this.options.fetch && !this.options.allowBrowserAccess) {
      throw new AgentError('provider-error', 'protocol', 'Claude requires a native transport or explicit browser prototype access.');
    }
    let key: string;
    try { key = await this.options.getApiKey(); } catch {
      signal.throwIfAborted();
      throw new AgentError('provider-error', 'auth', 'Claude credential store is unavailable.');
    }
    signal.throwIfAborted();
    if (!key || /[\r\n\0]/.test(key)) throw new AgentError('provider-error', 'auth', 'Claude API key is missing or invalid.');
    return key;
  }
  private async *streamAuthorized(request: AgentProviderRequest): AsyncGenerator<AgentProviderEvent> {
    if (!request.model?.trim() || /[\r\n\0]/.test(request.model) || !Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1) throw protocol();
    const body = JSON.stringify({model:request.model, max_tokens:request.maxOutputTokens, stream:true,
      ...convertMessages(request.messages),
      ...(request.tools.length ? {tools:request.tools.map(t => ({name:t.name, description:t.description, input_schema:t.parameters}))} : {}),
    });
    await this.options.consentGuard?.({provider:this.id, endpoint, request});
    const key = await this.key(request.signal);
    const response = await this.fetchWithRetry(endpoint, key, request.signal, body);
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      await response.body?.cancel().catch(() => {}); throw protocol();
    }
    const blocks = new Map<number, {type:string; initial?:string; fragmented:boolean}>();
    let started = false, finished = false;
    for await (const data of dataEvents(response.body, request.signal)) {
      let chunk: any;
      try { chunk = JSON.parse(data); } catch { throw protocol(); }
      if (!chunk || typeof chunk !== 'object' || typeof chunk.type !== 'string') throw protocol();
      if (chunk.type === 'error') throw streamError(chunk.error?.type);
      if (chunk.type === 'ping') continue;
      if (chunk.type === 'message_start') {
        if (started) throw protocol();
        started = true;
        if (chunk.message?.usage) yield {type:'usage', usage:{inputTokens:finite(chunk.message.usage.input_tokens), outputTokens:finite(chunk.message.usage.output_tokens)}};
      } else if (chunk.type === 'content_block_start') {
        if (!started || !Number.isSafeInteger(chunk.index) || chunk.index < 0 || blocks.has(chunk.index)) throw protocol();
        const block = chunk.content_block;
        if (!block || typeof block.type !== 'string') throw protocol();
        const state = {type:block.type, fragmented:false, initial:undefined as string | undefined};
        blocks.set(chunk.index, state);
        if (block.type === 'text') {
          if (typeof block.text !== 'string') throw protocol();
          if (block.text) yield {type:'text', text:block.text};
        } else if (block.type === 'tool_use') {
          if (typeof block.id !== 'string' || !block.id || typeof block.name !== 'string' || !block.name || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) throw protocol();
          state.initial = JSON.stringify(block.input);
          yield {type:'tool-call', index:chunk.index, id:block.id, name:block.name};
        } else throw protocol(); // Do not silently drop unsupported server tools or thinking state.
      } else if (chunk.type === 'content_block_delta') {
        const block = blocks.get(chunk.index), delta = chunk.delta;
        if (!block || !delta) throw protocol();
        if (delta.type === 'text_delta' && block.type === 'text' && typeof delta.text === 'string') {
          if (delta.text) yield {type:'text', text:delta.text};
        } else if (delta.type === 'input_json_delta' && block.type === 'tool_use' && typeof delta.partial_json === 'string') {
          if (block.initial !== '{}') throw protocol();
          block.fragmented ||= !!delta.partial_json;
          yield {type:'tool-call', index:chunk.index, arguments:delta.partial_json};
        } else if (delta.type !== 'citations_delta') throw protocol();
      } else if (chunk.type === 'content_block_stop') {
        const block = blocks.get(chunk.index);
        if (!block) throw protocol();
        if (block.type === 'tool_use' && !block.fragmented) yield {type:'tool-call', index:chunk.index, arguments:block.initial ?? '{}'};
        blocks.delete(chunk.index);
      } else if (chunk.type === 'message_delta') {
        if (!started || blocks.size) throw protocol();
        if (chunk.usage) yield {type:'usage', usage:{inputTokens:finite(chunk.usage.input_tokens), outputTokens:finite(chunk.usage.output_tokens)}};
        const reason = chunk.delta?.stop_reason;
        if (reason != null) {
          const reasons: Record<string,string> = {end_turn:'stop', stop_sequence:'stop', tool_use:'tool_calls', max_tokens:'length', refusal:'content_filter', model_context_window_exceeded:'length'};
          if (typeof reason !== 'string' || !reasons[reason] || finished) throw protocol();
          finished = true;
          yield {type:'finish', reason:reasons[reason]};
        }
      } else if (chunk.type === 'message_stop') {
        if (!started || !finished || blocks.size) throw protocol();
        return;
      }
      // Unknown event types are ignored for Anthropic's forward-compatible SSE contract.
    }
    throw new AgentError('provider-error', 'protocol', 'Claude stream ended without completion.', true);
  }
  /** Non-inference discovery. Explicit consent is required even for catalog requests. */
  async listModels(signal: AbortSignal): Promise<ClaudeModel[]> {
    const run = this.options.privacyGate ? this.options.privacyGate.run.bind(this.options.privacyGate) : runWithProviderConsent;
    return run({provider:this.id, endpoint:modelsEndpoint}, async guardedSignal => {
      const key = await this.key(guardedSignal), result: ClaudeModel[] = [], ids = new Set<string>(), cursors = new Set<string>();
      let cursor: string | undefined;
      for (let page = 0; page < 100; page++) {
        const url = new URL(modelsEndpoint); url.searchParams.set('limit','100');
        if (cursor) url.searchParams.set('after_id',cursor);
        const response = await this.fetchWithRetry(url.href, key, guardedSignal);
        let json: any;
        try { json = await response.json(); } catch { guardedSignal.throwIfAborted(); throw protocol(); }
        guardedSignal.throwIfAborted();
        if (!json || !Array.isArray(json.data) || typeof json.has_more !== 'boolean') throw protocol();
        for (const item of json.data) {
          if (!item || typeof item.id !== 'string' || !item.id || typeof item.display_name !== 'string') throw protocol();
          if (!ids.has(item.id)) { ids.add(item.id); result.push({id:item.id, name:item.display_name, ...(typeof item.created_at === 'string' ? {createdAt:item.created_at} : {})}); }
        }
        if (!json.has_more) return result;
        if (typeof json.last_id !== 'string' || !json.last_id || !json.data.length || cursors.has(json.last_id)) throw protocol();
        cursor = json.last_id; cursors.add(json.last_id);
      }
      throw new AgentError('limit','context','Claude model catalog exceeds page limit.');
    }, signal);
  }
  private async fetchWithRetry(url: string, key: string, signal: AbortSignal, body?: string): Promise<Response> {
    const retries = Math.max(0, Math.min(3, this.options.maxRetries ?? 3));
    const sleep = this.options.sleep ?? ((ms: number, s: AbortSignal) => new Promise<void>((resolve, reject) => {
      const onAbort = () => { clearTimeout(timer); reject(s.reason); };
      const timer = setTimeout(() => { s.removeEventListener('abort',onAbort); resolve(); },ms);
      s.addEventListener('abort',onAbort,{once:true}); if (s.aborted) onAbort();
    }));
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      let failure: AgentError, retryAfter: number | undefined;
      try {
        const response = await (this.options.fetch ?? globalThis.fetch)(url, {method:body === undefined ? 'GET' : 'POST', redirect:'error', signal,
          headers:{'x-api-key':key, 'anthropic-version':'2023-06-01', 'Content-Type':'application/json', ...(this.options.allowBrowserAccess ? {'anthropic-dangerous-direct-browser-access':'true'} : {})},
          ...(body === undefined ? {} : {body})});
        signal.throwIfAborted();
        if (response.ok) return response;
        failure = classifyHttp(response.status, {}, 'Claude request failed');
        const header = response.headers.get('retry-after');
        if (header) { const seconds = Number(header); retryAfter = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now(); }
        await response.body?.cancel().catch(() => {}); // Never parse or expose private vendor error text.
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof AgentError) throw error;
        failure = new AgentError('provider-error','network','Network request to Claude failed.',true);
      }
      if (!failure.retryable || attempt >= retries) throw failure;
      await sleep(Math.max(0, Math.min(Number.isFinite(retryAfter) ? retryAfter! : 1000 * 2 ** attempt,15000)),signal);
    }
  }
}
