import test from 'node:test';
import assert from 'node:assert/strict';
import { OllamaProvider, normalizeBaseUrl } from './ollama';
import { toOllamaMessages } from './ollama';
import type { AgentProviderEvent, AgentProviderRequest } from '../provider';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const nd = (lines: string[], chunk = 7) => {
  const bytes = new TextEncoder().encode(lines.join('\n') + '\n');
  return new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += chunk) c.enqueue(bytes.slice(i, i + chunk)); c.close(); } }));
};
const collect = async (it: AsyncIterable<AgentProviderEvent>) => { const o: AgentProviderEvent[] = []; for await (const e of it) o.push(e); return o; };
const mk = (f: (u: string, i?: RequestInit) => Promise<Response>) => new OllamaProvider({ fetch: f as never });
const req = (o: Partial<AgentProviderRequest> = {}): AgentProviderRequest => ({ model: 'llama3.2', messages: [{ role: 'user', content: 'hi' }], tools: [], maxOutputTokens: 50, signal: new AbortController().signal, ...o });
const code = (c: string) => (e: { code?: string }) => e.code === c;

test('normalizeBaseUrl: default, bare host, trailing slash, bad protocol', () => {
  assert.equal(normalizeBaseUrl(undefined), 'http://127.0.0.1:11434');
  assert.equal(normalizeBaseUrl('localhost:11434/'), 'http://localhost:11434');
  assert.throws(() => normalizeBaseUrl('file:///etc/passwd'), /Unsupported/);
});

test('health reports version, and unreachable without throwing', async () => {
  assert.deepEqual(await mk(async () => json({ version: '0.5.1' })).health(), { ok: true, version: '0.5.1' });
  const bad = await mk(async () => { throw new TypeError('fetch failed'); }).health();
  assert.equal(bad.ok, false); assert.equal(bad.error?.code, 'unreachable');
});

test('listModels maps and sorts /api/tags', async () => {
  const p = mk(async (u) => { assert.ok(u.endsWith('/api/tags')); return json({ models: [{ name: 'qwen2.5-coder:7b', model: 'qwen2.5-coder:7b', size: 5, details: { family: 'qwen2', parameter_size: '7B', x: 3 } }, { name: 'llama3.2:latest', model: 'llama3.2:latest' }] }); });
  const m = await p.listModels();
  assert.deepEqual(m.map((x) => x.id), ['llama3.2:latest', 'qwen2.5-coder:7b']);
  assert.deepEqual(m[1].details, { family: 'qwen2', parameter_size: '7B' });
  assert.equal(m[1].sizeBytes, 5);
});

test('listModels errors: http, unreachable, protocol', async () => {
  await assert.rejects(mk(async () => json({}, 500)).listModels(), code('http'));
  await assert.rejects(mk(async () => { throw new TypeError('x'); }).listModels(), code('unreachable'));
  await assert.rejects(mk(async () => json({ nope: 1 })).listModels(), code('protocol'));
});

test('contract: id and locality', () => { const p = mk(async () => json({})); assert.equal(p.id, 'ollama'); assert.equal(p.locality, 'local'); });

test('stream: text across chunk boundaries, usage, finish; request body', async () => {
  let sent: any;
  const p = mk(async (_u, i) => { sent = JSON.parse(String(i?.body)); return nd([
    JSON.stringify({ message: { content: 'Hel' }, done: false }),
    JSON.stringify({ message: { content: 'lo ✓' }, done: false }),
    JSON.stringify({ message: { content: '' }, done: true, done_reason: 'stop', prompt_eval_count: 3, eval_count: 2 }),
  ]); });
  const ev = await collect(p.stream(req()));
  assert.equal(ev.filter((e) => e.type === 'text').map((e: any) => e.text).join(''), 'Hello ✓');
  assert.deepEqual(ev.slice(-2), [{ type: 'usage', usage: { inputTokens: 3, outputTokens: 2 } }, { type: 'finish', reason: 'stop' }]);
  assert.equal(sent.stream, true); assert.equal(sent.options.num_predict, 50); assert.equal(sent.tools, undefined);
});

test('stream: tool calls become indexed tool-call events with JSON-string arguments', async () => {
  let sent: any;
  const p = mk(async (_u, i) => { sent = JSON.parse(String(i?.body)); return nd([
    JSON.stringify({ message: { content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'a.html' } } }, { function: { name: 'list', arguments: {} } }] } }),
    JSON.stringify({ done: true, done_reason: 'stop' }),
  ]); });
  const ev = await collect(p.stream(req({ tools: [{ name: 'read_file', description: 'd', parameters: { type: 'object' } }] })));
  const calls = ev.filter((e) => e.type === 'tool-call') as any[];
  assert.deepEqual(calls.map((c) => [c.index, c.name, c.arguments]), [[0, 'read_file', '{"path":"a.html"}'], [1, 'list', '{}']]);
  assert.ok(calls[0].id);
  assert.deepEqual(ev.at(-1), { type: 'finish', reason: 'tool_calls' });
  assert.equal(sent.tools[0].function.name, 'read_file');
});

test('toOllamaMessages: assistant tool calls and tool results', () => {
  const m = toOllamaMessages([
    { role: 'user', content: 'x' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'read_file', arguments: '{"path":"a"}' }] },
    { role: 'tool', content: 'file body', toolCallId: 'c1' },
  ]) as any[];
  assert.deepEqual(m[1].tool_calls, [{ function: { name: 'read_file', arguments: { path: 'a' } } }]);
  assert.deepEqual(m[2], { role: 'tool', content: 'file body', tool_name: 'read_file' });
});

test('stream: length finish, 404, mid-stream error, truncated stream, unreachable all throw/finish correctly', async () => {
  const len = await collect(mk(async () => nd([JSON.stringify({ done: true, done_reason: 'length' })])).stream(req()));
  assert.deepEqual(len, [{ type: 'finish', reason: 'length' }]);
  await assert.rejects(collect(mk(async () => json({ error: "model 'x' not found" }, 404)).stream(req())), code('model-not-found'));
  await assert.rejects(collect(mk(async () => nd([JSON.stringify({ error: 'boom' })])).stream(req())), code('http'));
  await assert.rejects(collect(mk(async () => nd([JSON.stringify({ message: { content: 'a' } })])).stream(req())), code('protocol'));
  await assert.rejects(collect(mk(async () => { throw new TypeError('fetch failed'); }).stream(req())), code('unreachable'));
});

test('stream: abort ends with finish(aborted), no throw', async () => {
  const ac = new AbortController();
  const p = mk(async (_u, i) => new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify({ message: { content: 'a' } }) + '\n')); i?.signal?.addEventListener('abort', () => c.error(new DOMException('a', 'AbortError'))); },
  })));
  const ev: AgentProviderEvent[] = [];
  for await (const e of p.stream(req({ signal: ac.signal }))) { ev.push(e); if (e.type === 'text') ac.abort(); }
  assert.deepEqual(ev.map((e) => e.type), ['text', 'finish']);
  assert.deepEqual(ev[1], { type: 'finish', reason: 'aborted' });
  assert.deepEqual(await collect(mk(async () => json({})).stream(req({ signal: AbortSignal.abort() }))), [{ type: 'finish', reason: 'aborted' }]);
});
