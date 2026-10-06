import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentPrivacyGate } from './privacy';
import { AgentSession, AgentProjectTools, OpenRouterProvider, AgentError, describeAgentError } from './index';
import type { AgentProvider, AgentProviderEvent, AgentSessionEvent } from './index';

function gate() {
  const v = new Map<string, string>();
  const g = new AgentPrivacyGate(() => ({ getItem: k => v.get(k) ?? null, setItem: (k, x) => { v.set(k, x); }, removeItem: k => { v.delete(k); } }));
  g.grantExplicitConsent(); return g;
}
const sse = (events: unknown[], tail = 'data: [DONE]\n\n') => new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + tail, { headers: { 'content-type': 'text/event-stream' } });
const req = () => ({ model: 'm', messages: [{ role: 'user' as const, content: 'hi' }], tools: [], maxOutputTokens: 100, signal: new AbortController().signal });
const collect = async (p: OpenRouterProvider) => { const out: AgentProviderEvent[] = []; for await (const e of p.stream(req())) out.push(e); return out; };
const mk = (fetch: typeof globalThis.fetch, extra = {}) => new OpenRouterProvider({ privacyGate: gate(), getApiKey: () => 'k', fetch, sleep: async () => {}, ...extra });
const err = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

test('429 is retried with backoff, then succeeds', async () => {
  let n = 0;
  const events = await collect(mk(async () => ++n < 3 ? err(429, { error: { code: 429 } }) : sse([{ choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] }])));
  assert.equal(n, 3); assert.deepEqual(events.map(e => e.type), ['text', 'finish']);
});
test('exhausted 429 is a retryable rate-limited provider error', async () => {
  let n = 0;
  await assert.rejects(collect(mk(async () => { n++; return err(429); }, { maxRetries: 2 })), (e: AgentError) => e.code === 'provider-error' && e.detail === 'rate-limited' && e.retryable && /HTTP 429/.test(e.message));
  assert.equal(n, 3);
});
test('401 is not retried; 404 with tool hint is tool-unsupported', async () => {
  let n = 0;
  await assert.rejects(collect(mk(async () => { n++; return err(401); })), (e: AgentError) => e.detail === 'auth' && !e.retryable);
  assert.equal(n, 1);
  await assert.rejects(collect(mk(async () => err(404, { error: { message: 'No endpoints found that support tool use' } }))), (e: AgentError) => e.code === 'tool-unsupported');
  await assert.rejects(collect(mk(async () => err(404, { error: { message: 'No endpoints found matching your data policy (ZDR)' } }))), (e: AgentError) => e.detail === 'model-not-found');
});
test('error text from the provider never reaches the thrown message', async () => {
  await assert.rejects(collect(mk(async () => err(500, { error: { message: 'SECRET-PROMPT' } }), { maxRetries: 0 })), (e: Error) => !/SECRET/.test(e.message));
});
test('200 JSON error body and in-stream error chunk are classified', async () => {
  await assert.rejects(collect(mk(async () => new Response(JSON.stringify({ error: { code: 429, message: 'x' } }), { headers: { 'content-type': 'application/json' } }), { maxRetries: 0 })), (e: AgentError) => e.detail === 'rate-limited');
  await assert.rejects(collect(mk(async () => sse([{ error: { code: 502, message: 'x' } }]))), (e: AgentError) => e.detail === 'server');
});
test('tool calls without index, repeated id/name, and a final event without blank line are accepted', async () => {
  const events = await collect(mk(async () => sse([
    { choices: [{ index: 0, delta: { tool_calls: [{ id: 'a', function: { name: 'read_file', arguments: '{"pa' } }] } }] },
    { choices: [{ index: 0, delta: { tool_calls: [{ id: 'a', function: { name: 'read_file', arguments: 'th":"x.html"}' } }] }, finish_reason: 'tool_calls' }] },
  ], `data: [DONE]`)));
  assert.deepEqual(events.filter(e => e.type === 'tool-call').map((e: any) => e.index), [0, 0]);
});

function fixture(turns: AgentProviderEvent[][], seen: any[] = []): AgentProvider {
  let i = 0; return { id: 'f', locality: 'local', async *stream(r) { seen.push(r); yield* turns[i++] ?? []; } };
}
const setup = (provider: AgentProvider, opts = {}) => {
  const notes: AgentSessionEvent[] = [];
  const tools = new AgentProjectTools({ projectId: 'p', files: () => ({ 'a.html': 'x' }), allowed: () => true });
  return { notes, session: new AgentSession({ provider, model: 'm', tools, onEvent: e => notes.push(e), ...opts }) };
};
const notice = (notes: AgentSessionEvent[]) => notes.find(n => n.type === 'notice') as Extract<AgentSessionEvent, { type: 'notice' }> | undefined;
const call = (id: string, name: string, args: string, index = 0): AgentProviderEvent => ({ type: 'tool-call', index, id, name, arguments: args });

test('fragmented arguments, repeated ids and empty list_files arguments work', async () => {
  const { session, notes } = setup(fixture([
    [call('c1', 'list_files', ''), { type: 'finish', reason: 'tool_calls' }],
    [call('c2', 'read_file', '{"path":'), call('c2', 'read_file', '"a.html"}'), { type: 'finish', reason: 'stop' }], // 'stop' with tool calls
    [{ type: 'text', text: 'done' }, { type: 'finish', reason: 'stop' }],
  ]));
  await session.prompt('go');
  assert.equal(session.status, 'idle'); assert.equal(notice(notes), undefined);
  assert.equal(notes.filter(n => n.type === 'tool' && n.status === 'completed').length, 2);
});
test('missing finish reason with text is accepted; missing tool-call id is synthesized', async () => {
  const a = setup(fixture([[{ type: 'text', text: 'hi' }]])); await a.session.prompt('x'); assert.equal(a.session.status, 'idle');
  const b = setup(fixture([[{ type: 'tool-call', index: 0, name: 'list_files', arguments: '{}' }], [{ type: 'text', text: 'ok' }, { type: 'finish', reason: 'stop' }]]));
  await b.session.prompt('x'); assert.equal(b.session.status, 'idle');
});
test('reasoning model that burns the whole budget gets one automatic retry with more tokens', async () => {
  const seen: any[] = [];
  const { session } = setup(fixture([[{ type: 'finish', reason: 'length' }], [{ type: 'text', text: 'ok' }, { type: 'finish', reason: 'stop' }]], seen), { maxOutputTokens: 1000 });
  await session.prompt('x');
  assert.equal(session.status, 'idle'); assert.deepEqual(seen.map(s => s.maxOutputTokens), [1000, 2000]);
});
test('length with partial text is a limit/output-tokens error, retryable, no history kept', async () => {
  const { session, notes } = setup(fixture([[{ type: 'text', text: 'partial' }, { type: 'finish', reason: 'length' }]]));
  await session.prompt('x');
  const n = notice(notes)!; assert.equal(n.code, 'limit'); assert.equal(n.detail, 'output-tokens'); assert.equal(n.retryable, true);
  assert.equal(session.snapshot().messages.length, 0); assert.match(n.message, /No changes were applied/);
});
test('last step offers no tools so the turn can still finish', async () => {
  const seen: any[] = [];
  const loop = (i: number): AgentProviderEvent[] => [call(`c${i}`, 'list_files', '{}'), { type: 'finish', reason: 'tool_calls' }];
  const { session, notes } = setup(fixture([loop(1), loop(2), [{ type: 'text', text: 'final' }, { type: 'finish', reason: 'stop' }]], seen), { maxSteps: 3 });
  await session.prompt('x');
  assert.equal(session.status, 'idle'); assert.equal(notice(notes), undefined); assert.equal(seen[2].tools.length, 0); assert.ok(seen[1].tools.length > 0);
});
test('a model that keeps calling tools on the last step is a limit/steps error', async () => {
  const loop = (i: number): AgentProviderEvent[] => [call(`c${i}`, 'list_files', '{}'), { type: 'finish', reason: 'tool_calls' }];
  const { session, notes } = setup(fixture([loop(1), loop(2)]), { maxSteps: 2 });
  await session.prompt('x'); assert.equal(notice(notes)?.detail, 'steps');
});
test('timeout is reported as a limit, not as a user stop; user cancel is aborted', async () => {
  const hang: AgentProvider = { id: 'h', locality: 'local', async *stream(r) { await new Promise((_, rej) => r.signal.addEventListener('abort', () => rej(r.signal.reason))); yield { type: 'finish', reason: 'stop' }; } };
  const a = setup(hang, { timeoutMs: 20 }); await a.session.prompt('x');
  assert.equal(notice(a.notes)?.code, 'limit'); assert.equal(notice(a.notes)?.detail, 'timeout'); assert.equal(a.session.status, 'error');
  const b = setup(hang); const p = b.session.prompt('x'); b.session.cancel(); await p;
  assert.equal(notice(b.notes)?.code, 'aborted'); assert.equal(b.session.status, 'cancelled');
});
test('provider failure surfaces fixed taxonomy text, never the raw exception', async () => {
  const bad: AgentProvider = { id: 'b', locality: 'local', async *stream() { throw Error('Bearer sk-SECRET'); } };
  const { session, notes } = setup(bad); await session.prompt('x');
  const n = notice(notes)!; assert.equal(n.code, 'internal'); assert.ok(!/SECRET/.test(n.message));
  assert.match(describeAgentError(new AgentError('tool-unsupported', 'no-tool-support', 'x')), /tool calls/);
});
