import { runWithProviderConsent } from './privacy';
import type { AgentPrivacyGate } from './privacy';
import type { AgentCloudConsentGuard, AgentProvider, AgentProviderEvent, AgentProviderRequest } from './types';

export interface OpenRouterOptions {
  /** Resolve from the credential service at request time. Never persist in session. */
  getApiKey: () => string | Promise<string>;
  consentGuard?: AgentCloudConsentGuard;
  /** Test/host injection of the shared gate, not a replacement permission function. */
  privacyGate?: AgentPrivacyGate;
  fetch?: typeof globalThis.fetch;
  /** ZDR is the default. Changing it requires a separate conscious privacy choice. */
  requireZdr?: boolean;
}
const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
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
      if (buffer.length > maxEventBytes) throw Error('Provider event exceeds size limit.');
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
          if (size > maxEventBytes) throw Error('Provider event exceeds size limit.');
          data.push(part);
        }
      }
      if (done) {
        if (buffer || data.length) throw Error('Provider stream ended inside an event.');
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
export class OpenRouterProvider implements AgentProvider {
  readonly id = 'openrouter';
  readonly locality = 'cloud' as const;
  constructor(private readonly options: OpenRouterOptions) {
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
    if (!request.model || !Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1) {
      throw Error('Model and positive output token limit are required.');
    }
    await this.options.consentGuard?.({ provider: this.id, endpoint, request });
    request.signal.throwIfAborted();
    const apiKey = await this.options.getApiKey();
    if (!apiKey || /[\r\n]/.test(apiKey)) throw Error('OpenRouter credential is missing or invalid.');
    request.signal.throwIfAborted();
    const response = await (this.options.fetch ?? globalThis.fetch)(endpoint, {
      method: 'POST', redirect: 'error', signal: request.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model, stream: true, max_tokens: request.maxOutputTokens,
        provider: { zdr: this.options.requireZdr !== false, allow_fallbacks: false, require_parameters: true },
        messages: request.messages.map(m => ({ role: m.role, content: m.content,
          ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
          ...(m.toolCalls ? { tool_calls: m.toolCalls.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.arguments } })) } : {}) })),
        ...(request.tools.length ? { tools: request.tools.map(t => ({ type: 'function', function: t })) } : {}),
      }),
    });
    // Never echo response bodies: they can contain keys, private prompts or vendor HTML.
    if (!response.ok) throw Error(`OpenRouter request failed (HTTP ${response.status}).`);
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw Error('OpenRouter did not return an event stream.');
    let ended = false;
    for await (const data of dataEvents(response.body, request.signal)) {
      if (data === '[DONE]') { ended = true; break; }
      let chunk;
      try { chunk = JSON.parse(data); } catch { throw Error('Invalid provider stream event.'); }
      if (!chunk || typeof chunk !== 'object' || chunk.error) throw Error('Provider reported a streaming error.');
      if (chunk.usage) yield { type: 'usage', usage: {
        inputTokens: finite(chunk.usage.prompt_tokens), outputTokens: finite(chunk.usage.completion_tokens), costUsd: finite(chunk.usage.cost),
      } };
      for (const choice of chunk.choices ?? []) {
        if (choice.index !== 0) continue;
        const delta = choice.delta ?? {};
        if (typeof delta.content === 'string') yield { type: 'text', text: delta.content };
        for (const tool of delta.tool_calls ?? []) {
          if (!Number.isSafeInteger(tool.index) || tool.index < 0) throw Error('Invalid provider tool index.');
          yield { type: 'tool-call', index: tool.index,
            id: typeof tool.id === 'string' ? tool.id : undefined,
            name: typeof tool.function?.name === 'string' ? tool.function.name : undefined,
            arguments: typeof tool.function?.arguments === 'string' ? tool.function.arguments : undefined };
        }
        if (typeof choice.finish_reason === 'string') yield { type: 'finish', reason: choice.finish_reason };
      }
    }
    if (!ended) throw Error('Provider stream ended without completion.');
  }
}
