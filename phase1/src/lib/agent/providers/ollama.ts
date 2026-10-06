import { ProviderError } from '../errors';
import type { AgentMessage, AgentProvider, AgentProviderEvent, AgentProviderRequest } from '../provider';

export interface HealthStatus { ok: boolean; version?: string; error?: { code: string; message: string } }
export interface ModelInfo { id: string; label: string; sizeBytes?: number; details?: Record<string, string> }

export const OLLAMA_DEFAULT_URL = 'http://127.0.0.1:11434';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export interface OllamaOptions {
  /** Daemon base URL. Default http://127.0.0.1:11434. */
  baseUrl?: string;
  /** Injectable for tests. */
  fetch?: FetchLike;
  /** Timeout for non-streaming calls (health, models) in ms. Default 5000. */
  requestTimeoutMs?: number;
}

const isAbort = (e: unknown) => (e as { name?: string })?.name === 'AbortError';

/** Normalises a user-entered URL; rejects non-http(s). */
export function normalizeBaseUrl(raw: string | undefined): string {
  const v = (raw ?? '').trim() || OLLAMA_DEFAULT_URL;
  let u: URL;
  try { u = new URL(/^[a-z]+:\/\//i.test(v) ? v : 'http://' + v); } catch { throw new ProviderError('protocol', `Invalid Ollama URL: ${v}`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ProviderError('protocol', `Unsupported protocol: ${u.protocol}`);
  return u.origin + u.pathname.replace(/\/+$/, '');
}

/** Combines caller abort with a timeout. */
function withTimeout(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; done: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(new DOMException('timeout', 'TimeoutError')), ms);
  const onAbort = () => c.abort();
  if (signal?.aborted) c.abort(); else signal?.addEventListener('abort', onAbort, { once: true });
  return { signal: c.signal, done: () => { clearTimeout(t); signal?.removeEventListener('abort', onAbort); } };
}

export class OllamaProvider implements AgentProvider {
  readonly id = 'ollama';
  readonly locality = 'local' as const;
  readonly baseUrl: string;
  private f: FetchLike;
  private timeout: number;

  constructor(opts: OllamaOptions = {}) {
    this.baseUrl = normalizeBaseUrl(opts.baseUrl);
    this.f = opts.fetch ?? ((u, i) => fetch(u, i));
    this.timeout = opts.requestTimeoutMs ?? 5000;
  }

  private async get(path: string, signal?: AbortSignal): Promise<Response> {
    const t = withTimeout(signal, this.timeout);
    try {
      const r = await this.f(this.baseUrl + path, { signal: t.signal });
      if (!r.ok) throw new ProviderError('http', `Ollama answered ${r.status} for ${path}`);
      return r;
    } catch (e) {
      throw this.toError(e, t.signal, signal);
    } finally { t.done(); }
  }

  private toError(e: unknown, own: AbortSignal, outer?: AbortSignal): ProviderError {
    if (e instanceof ProviderError) return e;
    if (isAbort(e) && outer?.aborted) return new ProviderError('timeout', 'Request aborted');
    if (own.aborted) return new ProviderError('timeout', 'Ollama did not answer in time');
    return new ProviderError('unreachable', `Cannot reach Ollama at ${this.baseUrl}. Is it running? (${(e as Error)?.message ?? e})`);
  }

  async health(signal?: AbortSignal): Promise<HealthStatus> {
    try {
      const r = await this.get('/api/version', signal);
      const j = (await r.json().catch(() => ({}))) as { version?: string };
      return { ok: true, version: typeof j.version === 'string' ? j.version : undefined };
    } catch (e) {
      const pe = e as ProviderError;
      return { ok: false, error: { code: pe.code ?? 'unreachable', message: pe.message } };
    }
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const r = await this.get('/api/tags', signal);
    let j: { models?: Array<{ name?: string; model?: string; size?: number; details?: Record<string, unknown> }> };
    try { j = await r.json(); } catch { throw new ProviderError('protocol', 'Ollama returned invalid JSON for /api/tags'); }
    if (!Array.isArray(j.models)) throw new ProviderError('protocol', 'Unexpected /api/tags response');
    return j.models
      .map((m) => {
        const id = m.model || m.name || '';
        const details: Record<string, string> = {};
        for (const [k, v] of Object.entries(m.details ?? {})) if (typeof v === 'string' && v) details[k] = v;
        return { id, label: m.name || id, sizeBytes: typeof m.size === 'number' ? m.size : undefined, details } as ModelInfo;
      })
      .filter((m) => m.id)
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  async *stream(req: AgentProviderRequest): AsyncGenerator<AgentProviderEvent> {
    const { signal } = req;
    if (signal.aborted) { yield { type: 'finish', reason: 'aborted' }; return; }
    const body = {
      model: req.model,
      messages: toOllamaMessages(req.messages),
      ...(req.tools.length && { tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) }),
      stream: true,
      options: { num_predict: req.maxOutputTokens },
    };
    let res: Response;
    try {
      res = await this.f(this.baseUrl + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
    } catch (e) {
      if (isAbort(e) || signal.aborted) { yield { type: 'finish', reason: 'aborted' }; return; }
      throw new ProviderError('unreachable', `Cannot reach Ollama at ${this.baseUrl}. Is it running? (${(e as Error)?.message ?? e})`);
    }
    if (!res.ok) {
      let detail = '';
      try { detail = ((await res.json()) as { error?: string }).error ?? ''; } catch { /* ignore */ }
      if (res.status === 404) throw new ProviderError('model-not-found', detail || `Model "${req.model}" is not installed. Run: ollama pull ${req.model}`);
      throw new ProviderError('http', `Ollama answered ${res.status}${detail ? ': ' + detail : ''}`);
    }
    if (!res.body) throw new ProviderError('protocol', 'Ollama response has no body');

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let toolIndex = 0;
    let finished = false;
    const handle = (line: string): AgentProviderEvent[] => {
      if (!line.trim()) return [];
      let j: OllamaChunk;
      try { j = JSON.parse(line); } catch { throw new ProviderError('protocol', 'Invalid line in Ollama stream'); }
      if (j.error) throw new ProviderError(/not found/i.test(j.error) ? 'model-not-found' : 'http', j.error);
      const out: AgentProviderEvent[] = [];
      if (j.message?.content) out.push({ type: 'text', text: j.message.content });
      for (const tc of j.message?.tool_calls ?? []) {
        const name = tc.function?.name;
        if (!name) continue;
        const args = tc.function?.arguments;
        // Ollama sends each call complete, arguments as an object. Contract wants a JSON string.
        out.push({ type: 'tool-call', index: toolIndex, id: tc.id || `ollama-call-${toolIndex}`, name, arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}) });
        toolIndex++;
      }
      if (j.done) {
        // Local usage is real token counts; costUsd stays absent (contract: absent = unknown).
        if (j.prompt_eval_count !== undefined || j.eval_count !== undefined) out.push({ type: 'usage', usage: { inputTokens: j.prompt_eval_count, outputTokens: j.eval_count } });
        out.push({ type: 'finish', reason: toolIndex > 0 ? 'tool_calls' : j.done_reason === 'length' ? 'length' : 'stop' });
      }
      return out;
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          for (const ev of handle(line)) { yield ev; if (ev.type === 'finish') finished = true; }
          if (finished) { await reader.cancel().catch(() => {}); return; }
        }
      }
      buf += dec.decode();
      for (const ev of handle(buf)) { yield ev; if (ev.type === 'finish') finished = true; }
      if (!finished) throw new ProviderError('protocol', 'Ollama stream ended before completion');
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (isAbort(e) || signal.aborted) { yield { type: 'finish', reason: 'aborted' }; return; }
      throw new ProviderError('unreachable', `Connection to Ollama lost (${(e as Error)?.message ?? e})`);
    }
  }
}

interface OllamaChunk {
  message?: { content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }> };
  done?: boolean; done_reason?: string; error?: string; prompt_eval_count?: number; eval_count?: number;
}

/** Maps contract messages to Ollama's /api/chat shape. Tool results are keyed by tool name, so resolve it from the earlier assistant call. */
export function toOllamaMessages(messages: readonly AgentMessage[]): unknown[] {
  const names = new Map<string, string>();
  for (const m of messages) for (const c of m.toolCalls ?? []) names.set(c.id, c.name);
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'tool', content: m.content, ...(m.toolCallId && names.get(m.toolCallId) && { tool_name: names.get(m.toolCallId) }) };
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return { role: 'assistant', content: m.content, tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: safeParse(c.arguments) } })) };
    }
    return { role: m.role, content: m.content };
  });
}
function safeParse(s: string): unknown { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
