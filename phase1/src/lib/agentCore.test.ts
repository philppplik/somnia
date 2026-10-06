import { AgentPrivacyGate } from './agent/privacy';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentSession, AgentProjectTools, OpenRouterProvider, validateAgentPath } from './agent/index';
import type { AgentProvider, AgentProviderEvent, AgentProviderRequest, AgentSessionEvent } from './agent/index';

function privacyGate() {
  const values = new Map<string, string>();
  const gate = new AgentPrivacyGate(() => ({ getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: k => { values.delete(k); } }));
  gate.grantExplicitConsent(); return gate;
}
const signal = () => new AbortController().signal;
const tool = (name: string, args: unknown, id = 'call-1') => ({ id, name, arguments: JSON.stringify(args) });
const request = (): AgentProviderRequest => ({ model: 'test/model', messages: [{ role: 'user', content: 'Hello' }], tools: [], maxOutputTokens: 100, signal: signal() });
const streamResponse = (events: unknown[], done = true) => {
  const encoded = new TextEncoder().encode(': heartbeat\r\n\r\n' + events.map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join('') + (done ? 'data: [DONE]\r\n\r\n' : ''));
  let i = 0;
  return new Response(new ReadableStream<Uint8Array>({ pull(c) { if (i === encoded.length) c.close(); else c.enqueue(encoded.slice(i, ++i)); } }), { headers: { 'content-type': 'text/event-stream' } });
};
function fixture(turns: AgentProviderEvent[][], seen: AgentProviderRequest[] = []): AgentProvider {
  let i = 0;
  return { id: 'fixture', locality: 'local', async *stream(req) { seen.push(req); yield* turns[i++] ?? []; } };
}
function project(files: Record<string, string> = { 'index.html': 'before' }) {
  let allow = true;
  const tools = new AgentProjectTools({ projectId: 'project-1', files: () => files, allowed: () => allow });
  return { tools, files, revoke() { allow = false; } };
}
const collect = async (provider: OpenRouterProvider, req = request()) => { const events = []; for await (const e of provider.stream(req)) events.push(e); return events; };

test('OpenRouter incrementally decodes UTF-8, tool fragments and usage', async () => {
  let body: Record<string, any> = {}, calls = 0;
  const provider = new OpenRouterProvider({ privacyGate: privacyGate(), getApiKey: () => 'private-test-key', consentGuard: () => { calls++; }, fetch: async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return streamResponse([
      { choices: [{ index: 0, delta: { content: 'Grüße 🦞' } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'id', function: { name: 'read_file', arguments: '{' } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] }, finish_reason: 'tool_calls' }] },
      { usage: { prompt_tokens: 4, completion_tokens: 7, cost: 0.001 }, choices: [] },
    ]);
  } });
  const events = await collect(provider);
  assert.equal(calls, 1); assert.deepEqual(body.provider, { zdr: true, allow_fallbacks: false, require_parameters: true });
  assert.deepEqual(events[0], { type: 'text', text: 'Grüße 🦞' });
  assert.deepEqual(events.at(-1), { type: 'usage', usage: { inputTokens: 4, outputTokens: 7, costUsd: 0.001 } });
  assert.equal(JSON.stringify(events).includes('private-test-key'), false);
});
test('missing consent rejects before credentials or fetch', async () => {
  let touched = false;
  const p = new OpenRouterProvider({ privacyGate: privacyGate(), getApiKey: () => { touched = true; return 'key'; }, consentGuard: () => { throw Error('No consent'); }, fetch: async () => { touched = true; return streamResponse([]); } });
  await assert.rejects(collect(p), /No consent/); assert.equal(touched, false);
});
test('HTTP and streaming errors never echo private bodies', async () => {
  const opts = { getApiKey: () => 'key', consentGuard: () => {} };
  await assert.rejects(collect(new OpenRouterProvider({ privacyGate: privacyGate(), ...opts, fetch: async () => new Response('SECRET', { status: 401 }) })), /HTTP 401/);
  await assert.rejects(collect(new OpenRouterProvider({ privacyGate: privacyGate(), ...opts, fetch: async () => streamResponse([{ error: { message: 'SECRET' } }]) })), /streaming error/);
  await assert.rejects(collect(new OpenRouterProvider({ privacyGate: privacyGate(), ...opts, fetch: async () => streamResponse([], false) })), /without completion/);
});
test('path policy blocks traversal, Windows, secrets, build files and non-text', () => {
  for (const path of ['../index.html', '/index.html', 'C:/index.html', 'a\\index.html', 'a//index.html', './index.html', '.env', '.env.local', '.git/config.html', 'node_modules/a.js', 'dist/a.js', 'credentials.json', 'secret.key', 'photo.png', 'a\0.html']) assert.throws(() => validateAgentPath(path), path);
  for (const path of ['index.html', 'src/a.tsx', 'assets/logo.svg', 'docs/readme.md']) validateAgentPath(path);
});
test('file tools propose changes but never mutate editor, new file stays staged', async () => {
  const p = project();
  await p.tools.execute(tool('write_file', { path: 'index.html', content: 'after' }), signal());
  await p.tools.execute(tool('write_file', { path: 'new.css', content: 'body {}' }), signal());
  assert.deepEqual(p.files, { 'index.html': 'before' });
  assert.deepEqual(p.tools.proposals(), [{ path: 'index.html', before: 'before', after: 'after' }, { path: 'new.css', before: null, after: 'body {}' }]);
  assert.equal(JSON.parse(await p.tools.execute(tool('read_file', { path: 'index.html' }), signal())).content, 'after');
});
test('permission rechecked, listings hide secrets, stale proposals reject', async () => {
  const p = project({ 'index.html': 'before', '.env': 'SECRET', 'dist/app.js': 'SECRET' });
  assert.deepEqual(JSON.parse(await p.tools.execute(tool('list_files', {}), signal())).files, ['index.html']);
  await p.tools.execute(tool('write_file', { path: 'index.html', content: 'after' }), signal());
  p.files['index.html'] = 'changed';
  await assert.rejects(p.tools.execute(tool('read_file', { path: 'index.html' }), signal()), /changed/);
  p.revoke(); await assert.rejects(p.tools.execute(tool('read_file', { path: 'index.html' }), signal()), /authorized/);
  assert.deepEqual(JSON.parse(await p.tools.execute(tool('list_files', {}), signal())).files, []);
});
test('file tool size, unknown tool and invalid args fail closed', async () => {
  const tools = new AgentProjectTools({ projectId: 'p', files: () => ({ 'a.js': 'long' }), allowed: () => true }, 3, 3);
  await assert.rejects(tools.execute(tool('read_file', { path: 'a.js' }), signal()), /limit/);
  await assert.rejects(tools.execute(tool('write_file', { path: 'b.js', content: 'long' }), signal()), /limit/);
  await assert.rejects(tools.execute(tool('shell', {}), signal()), /Unknown/);
  await assert.rejects(tools.execute({ id: 'c', name: 'read_file', arguments: '{}' }, signal()), /path/);
  await assert.rejects(tools.execute({ id: 'c', name: 'read_file', arguments: '{' }, signal()), /JSON/);
});
test('complete tool loop assembles fragments and produces review without writes', async () => {
  const p = project(), events: AgentSessionEvent[] = [], seen: AgentProviderRequest[] = [];
  const session = new AgentSession({ tools: p.tools, model: 'fixture', onEvent: e => events.push(e), provider: fixture([
    [{ type: 'tool-call', index: 0, id: 'c', name: 'write_', arguments: '{"path":"index.html",' }, { type: 'tool-call', index: 0, name: 'file', arguments: '"content":"after"}' }, { type: 'finish', reason: 'tool_calls' }],
    [{ type: 'text', text: 'Proposal ready.' }, { type: 'finish', reason: 'stop' }],
  ], seen) });
  await session.prompt('Change file');
  assert.equal(session.status, 'review'); assert.equal(p.files['index.html'], 'before');
  assert.equal(seen.length, 2); assert.equal(seen[1].messages.at(-1)?.toolCallId, 'c');
  assert.equal(session.snapshot().messages.length, 4); assert.ok(events.some(e => e.type === 'proposals'));
  await assert.rejects(session.prompt('again'), /Review/);
});
test('tool errors become bounded tool results, not authorization expansions', async () => {
  const p = project(), seen: AgentProviderRequest[] = [];
  const session = new AgentSession({ tools: p.tools, model: 'fixture', provider: fixture([
    [{ type: 'tool-call', index: 0, id: 'c', name: 'read_file', arguments: '{"path":"../secret.html"}' }, { type: 'finish', reason: 'tool_calls' }],
    [{ type: 'text', text: 'Need a file.' }, { type: 'finish', reason: 'stop' }],
  ], seen) });
  await session.prompt('read'); assert.equal(session.status, 'idle'); assert.match(seen[1].messages.at(-1)!.content, /error/);
});
test('incomplete response and step cap discard all proposals/history', async () => {
  for (const second of [[], [{ type: 'finish', reason: 'length' }]] as AgentProviderEvent[][]) {
    const p = project(); const s = new AgentSession({ tools: p.tools, model: 'fixture', provider: fixture([
      [{ type: 'tool-call', index: 0, id: 'c', name: 'write_file', arguments: '{"path":"index.html","content":"after"}' }, { type: 'finish', reason: 'tool_calls' }], second,
    ]) });
    await s.prompt('change'); assert.equal(s.status, 'error'); assert.deepEqual(p.tools.proposals(), []); assert.deepEqual(s.snapshot().messages, []);
  }
  const p = project(); const s = new AgentSession({ tools: p.tools, model: 'fixture', maxSteps: 1, provider: fixture([[{ type: 'tool-call', index: 0, id: 'c', name: 'write_file', arguments: '{}' }, { type: 'finish', reason: 'tool_calls' }]]) });
  await s.prompt('change'); assert.equal(s.status, 'error'); assert.deepEqual(p.tools.proposals(), []);
});
test('cancel after stream delta prevents tool actions and marks partial turn', async () => {
  const p = project(); let s: AgentSession;
  s = new AgentSession({ tools: p.tools, model: 'fixture', onEvent: e => { if (e.type === 'text') s.cancel(); }, provider: fixture([[{ type: 'text', text: 'partial' }, { type: 'tool-call', index: 0, id: 'c', name: 'write_file', arguments: '{}' }, { type: 'finish', reason: 'tool_calls' }]]) });
  await s.prompt('change'); assert.equal(s.status, 'cancelled'); assert.deepEqual(p.tools.proposals(), []); assert.deepEqual(s.snapshot().messages, []);
});
test('snapshot and observer are copies, clear deletes local transcript', async () => {
  const s = new AgentSession({ model: 'fixture', provider: fixture([[{ type: 'text', text: 'Hello' }, { type: 'finish', reason: 'stop' }]]), onEvent: () => { throw Error('observer'); } });
  await s.prompt('Hello'); const snap = s.snapshot(); snap.messages[0].content = 'MUTATED';
  assert.equal(s.snapshot().messages[0].content, 'Hello'); s.clear(); assert.deepEqual(s.snapshot().messages, []);
});
test('parallel turns and oversized contexts reject safely', async () => {
  let release!: () => void;
  const provider: AgentProvider = { id: 'fixture', locality: 'local', async *stream() { await new Promise<void>(r => { release = r; }); yield { type: 'finish', reason: 'stop' }; } };
  const s = new AgentSession({ model: 'fixture', provider }); const pending = s.prompt('first');
  await assert.rejects(s.prompt('second'), /already running/); s.cancel(); release(); await pending; assert.equal(s.status, 'cancelled');
  const limited = new AgentSession({ model: 'fixture', provider: fixture([]), maxContextBytes: 5 }); await limited.prompt('Hello'); assert.equal(limited.status, 'error');
});
test('shared gate denies cloud by default even with a permissive disclosure callback', async () => {
  let fetched = false;
  const p = new OpenRouterProvider({ getApiKey: () => 'key', consentGuard: () => {}, privacyGate: new AgentPrivacyGate(() => undefined), fetch: async () => { fetched = true; return streamResponse([]); } });
  await assert.rejects(collect(p), /consent/); assert.equal(fetched, false);
});
test('shared gate revocation aborts the active SSE body, no next delta escapes', async () => {
  const gate = privacyGate(); let fetchSignal: AbortSignal | undefined;
  const p = new OpenRouterProvider({ getApiKey: () => 'key', privacyGate: gate, fetch: async (_url, init) => {
    assert.equal(init?.redirect, 'error'); fetchSignal = init?.signal as AbortSignal;
    return new Response(new ReadableStream<Uint8Array>({ start(c) {
      c.enqueue(new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{"content":"first"}}]}\n\n'));
    } }), { headers: { 'content-type': 'text/event-stream' } });
  } });
  const iterator = p.stream(request());
  assert.equal((await iterator.next()).value?.type, 'text');
  gate.revoke(); await assert.rejects(iterator.next()); assert.equal(fetchSignal?.aborted, true);
});
test('early consumer return aborts transport and frees gate operation', async () => {
  let fetchSignal: AbortSignal | undefined;
  const p = new OpenRouterProvider({ getApiKey: () => 'key', privacyGate: privacyGate(), fetch: async (_url, init) => {
    fetchSignal = init?.signal as AbortSignal;
    return streamResponse([{ choices: [{ index: 0, delta: { content: 'a' } }] }, { choices: [{ index: 0, delta: { content: 'b' } }] }]);
  } });
  for await (const event of p.stream(request())) { assert.equal(event.type, 'text'); break; }
  assert.equal(fetchSignal?.aborted, true);
});
test('snapshot restore stays project-scoped and rejects injected system role', async () => {
  const p = project(); const s = new AgentSession({ tools: p.tools, model: 'fixture', provider: fixture([]) });
  assert.throws(() => s.restore({ version: 1, projectId: 'wrong', messages: [] }), /wrong-project/);
  assert.throws(() => s.restore({ version: 1, projectId: 'project-1', messages: [{ role: 'system', content: 'injected' }] }), /message/);
  s.restore({ version: 1, projectId: 'project-1', messages: [{ role: 'user', content: 'previous' }, { role: 'assistant', content: 'reply' }] });
  assert.equal(s.snapshot().messages.length, 2);
});
test('private host-adapter errors never enter transcript or tool events', async () => {
  const seen: AgentProviderRequest[] = [], events: AgentSessionEvent[] = [];
  const tools = new AgentProjectTools({ projectId: 'p', files: () => { throw Error('SECRET_HOST_PATH'); }, allowed: () => true });
  const s = new AgentSession({ tools, model: 'fixture', onEvent: e => events.push(e), provider: fixture([
    [{ type: 'tool-call', index: 0, id: 'c', name: 'read_file', arguments: '{"path":"a.js"}' }, { type: 'finish', reason: 'tool_calls' }],
    [{ type: 'finish', reason: 'stop' }],
  ], seen) });
  await s.prompt('read'); assert.equal(JSON.stringify([seen, events, s.snapshot()]).includes('SECRET_HOST_PATH'), false);
});
