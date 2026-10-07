import assert from 'node:assert/strict';
import { AgentPrivacyGate } from '../../privacy';
import type { AgentProvider, AgentProviderEvent, AgentProviderRequest } from '../../types';

/** Synthetic credentials only. No fixture transport ever falls back to real fetch. */
export const fixtureKey = 'synthetic-key-never-valid';
export const privateMarker = 'PRIVATE-PROMPT-AND-CREDENTIAL-MUST-NOT-LEAK';

export function privacyGate(granted = true): AgentPrivacyGate {
  const values = new Map<string, string>();
  const gate = new AgentPrivacyGate(() => ({
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  }));
  if (granted) assert.equal(gate.grantExplicitConsent(), true);
  return gate;
}

export function request(overrides: Partial<AgentProviderRequest> = {}): AgentProviderRequest {
  return {
    model: 'synthetic-model', messages: [{ role: 'user', content: 'Hello' }],
    tools: [], maxOutputTokens: 128, signal: new AbortController().signal,
    ...overrides,
  };
}

export async function collect(provider: AgentProvider, req = request()): Promise<AgentProviderEvent[]> {
  const events: AgentProviderEvent[] = [];
  for await (const event of provider.stream(req)) events.push(event);
  return events;
}

export interface ObservedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, any>;
  signal: AbortSignal | null | undefined;
  redirect: RequestRedirect | undefined;
}
type Reply = Response | Error | ((call: ObservedRequest) => Response | Promise<Response>);

/** A bounded reply queue: an unexpected retry fails rather than making a paid call. */
export function mockFetch(...replies: Reply[]): { fetch: typeof globalThis.fetch; calls: ObservedRequest[] } {
  const calls: ObservedRequest[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const call: ObservedRequest = {
      url: input instanceof Request ? input.url : String(input),
      method: init?.method ?? 'GET', headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? '{}')), signal: init?.signal, redirect: init?.redirect,
    };
    calls.push(call);
    const reply = replies.shift();
    assert.notEqual(reply, undefined, 'Unexpected HTTP request: fixture queue exhausted');
    if (reply instanceof Error) throw reply;
    return typeof reply === 'function' ? reply(call) : reply!;
  };
  return { fetch, calls };
}

export interface SseFrame { event?: string; data: unknown }
export function encodeSse(frames: readonly SseFrame[], crlf = true): string {
  const newline = crlf ? '\r\n' : '\n';
  return ': fixture heartbeat' + newline + newline + frames.map(frame =>
    (frame.event ? `event: ${frame.event}${newline}` : '') +
    `data: ${typeof frame.data === 'string' ? frame.data : JSON.stringify(frame.data)}${newline}${newline}`,
  ).join('');
}

/** Byte-sized chunks force the actual decoder to handle split emoji and CRLF. */
export function sseResponse(frames: readonly SseFrame[], options: {
  chunkSize?: number; raw?: string; stayOpen?: boolean;
} = {}): { response: Response; cancelled: () => boolean } {
  const bytes = new TextEncoder().encode(options.raw ?? encodeSse(frames));
  const chunkSize = options.chunkSize ?? 1;
  assert.ok(Number.isSafeInteger(chunkSize) && chunkSize > 0);
  let offset = 0, cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset < bytes.length) {
        const end = Math.min(offset + chunkSize, bytes.length);
        controller.enqueue(bytes.slice(offset, end)); offset = end;
      } else if (!options.stayOpen) controller.close();
    },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'text/event-stream' } });
  return { response, cancelled: () => cancelled };
}

export function httpError(status: number): Response {
  return new Response(JSON.stringify({ error: { message: privateMarker } }), {
    status, headers: { 'content-type': 'application/json' },
  });
}
