import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../openAI';
import { ClaudeProvider } from './claude';
import { AgentError } from '../errors';
import { AgentSession } from '../session';
import type { AgentSessionEvent } from '../session';
import { AgentProjectTools } from '../projectTools';
import type { AgentProvider, AgentProviderRequest } from '../types';
import type { AgentPrivacyGate } from '../privacy';
import { collect, fixtureKey, httpError, mockFetch, privateMarker, privacyGate, request, sseResponse } from './testSupport/httpFixtures';
import type { SseFrame } from './testSupport/httpFixtures';

type Options = {
  getApiKey: () => string | Promise<string>;
  fetch: typeof globalThis.fetch;
  privacyGate: AgentPrivacyGate;
  consentGuard?: (disclosure: { provider: string; endpoint: string; request: AgentProviderRequest }) => void | Promise<void>;
  maxRetries?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};
type CloudProvider = AgentProvider & { listModels(signal: AbortSignal): Promise<unknown[]> };
interface Contract {
  id: string; endpoint: string; modelsEndpoint: string;
  make(options: Options): CloudProvider;
  frames: SseFrame[];
  partial: SseFrame[];
  models: unknown;
  errorFrame: SseFrame;
  toolIndex: number;
  auth(headers: Headers): void;
}
const openAIFrames: SseFrame[] = [
  { data: { choices: [{ index: 0, delta: { content: 'Grüße 🦞' } }] } },
  { data: { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-fixture', type: 'function', function: { name: 'read_file', arguments: '{"path":' } }] } }] } },
  { data: { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"index.html"}' } }] }, finish_reason: 'tool_calls' }] } },
  { data: { choices: [], usage: { prompt_tokens: 4, completion_tokens: 7 } } },
  { data: '[DONE]' },
];
const claudeFrames: SseFrame[] = [
  { event: 'message_start', data: { type: 'message_start', message: { id: 'msg-fixture', type: 'message', role: 'assistant', content: [], model: 'synthetic-model', usage: { input_tokens: 4, output_tokens: 0 } } } },
  { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
  { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Grüße 🦞' } } },
  { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
  { event: 'content_block_start', data: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'call-fixture', name: 'read_file', input: {} } } },
  { event: 'content_block_delta', data: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"path":' } } },
  { event: 'content_block_delta', data: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"index.html"}' } } },
  { event: 'content_block_stop', data: { type: 'content_block_stop', index: 1 } },
  { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 7 } } },
  { event: 'message_stop', data: { type: 'message_stop' } },
];
const contracts: Contract[] = [
  {
    id: 'openai', endpoint: 'https://api.openai.com/v1/chat/completions', modelsEndpoint: 'https://api.openai.com/v1/models',
    make: options => new OpenAIProvider(options), frames: openAIFrames, partial: openAIFrames.slice(0, 1), toolIndex: 0,
    models: { object: 'list', data: [{ id: 'synthetic-model', object: 'model', owned_by: 'fixture', created: 1 }] },
    errorFrame: { data: { error: { code: 'invalid_api_key', message: privateMarker } } },
    auth: headers => { assert.equal(headers.get('authorization'), `Bearer ${fixtureKey}`); assert.equal(headers.has('x-api-key'), false); },
  },
  {
    id: 'claude', endpoint: 'https://api.anthropic.com/v1/messages', modelsEndpoint: 'https://api.anthropic.com/v1/models',
    make: options => new ClaudeProvider(options), frames: claudeFrames, partial: claudeFrames.slice(0, 3), toolIndex: 1,
    models: { data: [{ id: 'synthetic-model', display_name: 'Synthetic model', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'synthetic-model', last_id: 'synthetic-model' },
    errorFrame: { event: 'error', data: { type: 'error', error: { type: 'authentication_error', message: privateMarker } } },
    auth: headers => { assert.equal(headers.get('x-api-key'), fixtureKey); assert.equal(headers.get('anthropic-version'), '2023-06-01'); assert.equal(headers.has('authorization'), false); },
  },
];

for (const contract of contracts) {
  const opts = (fetch: typeof globalThis.fetch, overrides: Partial<Options> = {}): Options => ({
    fetch, getApiKey: async () => fixtureKey, privacyGate: privacyGate(), maxRetries: 0, ...overrides,
  });
  test(`${contract.id}: actual adapter normalizes byte-fragmented text, tool JSON and usage`, { timeout: 2000 }, async () => {
    const transport = mockFetch(sseResponse(contract.frames).response);
    const provider = contract.make(opts(transport.fetch));
    assert.equal(provider.id, contract.id); assert.equal(provider.locality, 'cloud');
    const events = await collect(provider, request({ tools: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }] }));
    assert.equal(events.filter(e => e.type === 'text').map(e => e.text).join(''), 'Grüße 🦞');
    const toolCalls = events.filter(e => e.type === 'tool-call');
    assert.ok(toolCalls.length > 0); assert.ok(toolCalls.every(e => e.index === contract.toolIndex));
    assert.equal(toolCalls.find(e => e.id)?.id, 'call-fixture');
    assert.equal(toolCalls.find(e => e.name)?.name, 'read_file');
    assert.deepEqual(JSON.parse(toolCalls.map(e => e.arguments ?? '').join('')), { path: 'index.html' });
    const usage = Object.assign({}, ...events.filter(e => e.type === 'usage').map(e =>
      Object.fromEntries(Object.entries(e.usage).filter(([, value]) => value !== undefined))));
    assert.equal(usage.inputTokens, 4); assert.equal(usage.outputTokens, 7);
    assert.equal(usage.costUsd, undefined, 'Unknown cost must not be fabricated as zero');
    assert.ok(events.some(e => e.type === 'finish' && e.reason === 'tool_calls'));
    assert.equal(JSON.stringify(events).includes(fixtureKey), false);
    assert.equal(transport.calls.length, 1);
    const call = transport.calls[0];
    assert.equal(call.url, contract.endpoint); assert.equal(call.method, 'POST'); contract.auth(call.headers);
    assert.equal(call.headers.get('content-type'), 'application/json');
    assert.equal(call.body.stream, true); assert.equal(call.body.model, 'synthetic-model');
    assert.equal(call.body[contract.id === 'openai' ? 'max_completion_tokens' : 'max_tokens'], 128);
    if (contract.id === 'openai') assert.equal(call.body.stream_options.include_usage, true);
    assert.equal(JSON.stringify(call.body).includes(fixtureKey), false);
  });

  test(`${contract.id}: real adapter completes the AgentSession tool loop with review-only writes`, { timeout: 2000 }, async () => {
    const firstTurn = JSON.parse(JSON.stringify(contract.frames).replaceAll('read_file', 'write_file')) as SseFrame[];
    // Preserve fragmented JSON at the transport layer, including the write payload.
    for (const frame of firstTurn) {
      const data = frame.data as any;
      const fn = data?.choices?.[0]?.delta?.tool_calls?.[0]?.function;
      if (fn?.arguments === '"index.html"}') fn.arguments = '"index.html","content":"after"}';
      if (data?.delta?.partial_json === '"index.html"}') data.delta.partial_json = '"index.html","content":"after"}';
    }
    const finalTurn: SseFrame[] = contract.id === 'openai' ? [
      { data: { choices: [{ index: 0, delta: { content: 'Proposal ready.' }, finish_reason: 'stop' }] } },
      { data: '[DONE]' },
    ] : [
      { event: 'message_start', data: { type: 'message_start', message: { usage: { input_tokens: 8, output_tokens: 0 } } } },
      { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
      { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Proposal ready.' } } },
      { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
      { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } } },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ];
    const transport = mockFetch(sseResponse(firstTurn).response, sseResponse(finalTurn).response);
    const files = { 'index.html': 'before' };
    const tools = new AgentProjectTools({ projectId: 'fixture-project', files: () => files, allowed: () => true });
    const events: AgentSessionEvent[] = [];
    const session = new AgentSession({ provider: contract.make(opts(transport.fetch)), model: 'synthetic-model', tools, onEvent: event => { events.push(event); } });
    await session.prompt('Propose a file change');
    assert.equal(session.status, 'review'); assert.equal(files['index.html'], 'before');
    assert.deepEqual(tools.proposals().map(({ path, before, after }) => ({ path, before, after })), [{ path: 'index.html', before: 'before', after: 'after' }]);
    assert.equal(tools.proposals()[0].provenance?.provider, contract.id);
    assert.equal(tools.proposals()[0].provenance?.humanReviewed, false);
    assert.equal(transport.calls.length, 2);
    assert.ok(JSON.stringify(transport.calls[1].body).includes('call-fixture'), 'Tool result must be linked to its original call');
    assert.equal(session.snapshot().messages.at(-1)?.content, 'Proposal ready.');
    assert.equal(session.snapshot().messages.at(-1)?.provenance?.provider, contract.id);
    assert.equal(JSON.stringify(session.snapshot()).includes(fixtureKey), false);
    assert.ok(events.some(event => event.type === 'proposals'));
  });

  test(`${contract.id}: missing consent denies streaming AND discovery before key access`, async () => {
    let keyReads = 0;
    const transport = mockFetch();
    const provider = contract.make(opts(transport.fetch, { privacyGate: privacyGate(false), getApiKey: () => { keyReads++; return fixtureKey; } }));
    await assert.rejects(collect(provider), { name: 'AgentConsentRequiredError' });
    await assert.rejects(provider.listModels(new AbortController().signal), { name: 'AgentConsentRequiredError' });
    assert.equal(keyReads, 0); assert.equal(transport.calls.length, 0);
  });

  test(`${contract.id}: disclosure guard is checked before credentials and transport`, async () => {
    let keyReads = 0; let guarded = 0;
    const transport = mockFetch();
    const provider = contract.make(opts(transport.fetch, {
      getApiKey: () => { keyReads++; return fixtureKey; },
      consentGuard: disclosure => {
        guarded++; assert.equal(disclosure.provider, contract.id); assert.equal(disclosure.endpoint, contract.endpoint);
        assert.equal(disclosure.request.messages[0].content, 'Hello'); throw new Error('fixture disclosure denied');
      },
    }));
    await assert.rejects(collect(provider), /fixture disclosure denied/);
    assert.equal(guarded, 1); assert.equal(keyReads, 0); assert.equal(transport.calls.length, 0);
  });

  for (const key of ['', 'key\r\ninjected-header']) {
    test(`${contract.id}: invalid credential fails before network (${key ? 'CRLF' : 'empty'})`, async () => {
      const transport = mockFetch();
      const provider = contract.make(opts(transport.fetch, { getApiKey: () => key }));
      await assert.rejects(collect(provider), error => error instanceof AgentError && error.detail === 'auth');
      assert.equal(transport.calls.length, 0);
    });
  }

  for (const [status, detail] of [[401, 'auth'], [403, 'auth'], [429, 'rate-limited'], [500, 'server']] as const) {
    test(`${contract.id}: HTTP ${status} classification hides provider body`, async () => {
      const transport = mockFetch(httpError(status));
      await assert.rejects(collect(contract.make(opts(transport.fetch))), error => {
        assert.ok(error instanceof AgentError); assert.equal(error.detail, detail); assert.equal(error.status, status);
        assert.equal(error.message.includes(privateMarker), false); assert.equal(error.message.includes(fixtureKey), false); return true;
      });
      assert.equal(transport.calls.length, 1);
    });
  }

  test(`${contract.id}: truncated stream is rejected, not silently accepted`, async () => {
    const transport = mockFetch(sseResponse(contract.partial).response);
    await assert.rejects(collect(contract.make(opts(transport.fetch))), error => error instanceof AgentError && error.detail === 'protocol');
    assert.equal(transport.calls.length, 1);
  });

  test(`${contract.id}: malformed SSE JSON is a safe protocol failure`, async () => {
    const transport = mockFetch(sseResponse([], { raw: 'data: {broken JSON\n\n' }).response);
    await assert.rejects(collect(contract.make(opts(transport.fetch))), error => error instanceof AgentError && error.detail === 'protocol');
  });

  test(`${contract.id}: stream error after text is redacted and never retried`, async () => {
    const transport = mockFetch(sseResponse([...contract.partial, contract.errorFrame]).response);
    const seen: string[] = [];
    const provider = contract.make(opts(transport.fetch, { maxRetries: 3, sleep: async () => { assert.fail('Stream failures must not retry'); } }));
    await assert.rejects(async () => {
      for await (const event of provider.stream(request())) if (event.type === 'text') seen.push(event.text);
    }, error => { assert.ok(error instanceof AgentError); assert.equal(error.message.includes(privateMarker), false); return true; });
    assert.deepEqual(seen, ['Grüße 🦞']); assert.equal(transport.calls.length, 1);
  });

  test(`${contract.id}: pre-aborted request never reads a credential or fetches`, async () => {
    let keyReads = 0; const transport = mockFetch(); const controller = new AbortController();
    controller.abort(new DOMException('Fixture stopped', 'AbortError'));
    await assert.rejects(collect(contract.make(opts(transport.fetch, { getApiKey: () => { keyReads++; return fixtureKey; } })), request({ signal: controller.signal })), { name: 'AbortError' });
    assert.equal(keyReads, 0); assert.equal(transport.calls.length, 0);
  });

  for (const reason of ['caller abort', 'consent withdrawal']) {
    test(`${contract.id}: ${reason} interrupts an open stream and cancels its reader`, { timeout: 2000 }, async () => {
      const controller = new AbortController(), gate = privacyGate();
      const stream = sseResponse(contract.partial, { stayOpen: true });
      const transport = mockFetch(stream.response);
      const provider = contract.make(opts(transport.fetch, { privacyGate: gate }));
      const iterator = provider.stream(request({ signal: controller.signal }))[Symbol.asyncIterator]();
      let firstText = false;
      while (!firstText) { const item = await iterator.next(); assert.equal(item.done, false); firstText = item.value?.type === 'text'; }
      const pending = iterator.next();
      if (reason === 'caller abort') controller.abort(new DOMException('Fixture stopped', 'AbortError')); else gate.revoke();
      await assert.rejects(pending);
      await iterator.return?.();
      assert.equal(transport.calls[0].signal?.aborted, true); assert.equal(stream.cancelled(), true);
      assert.equal(transport.calls.length, 1);
    });
  }

  test(`${contract.id}: consumer stops early, transport resources are released`, { timeout: 2000 }, async () => {
    const stream = sseResponse(contract.partial, { stayOpen: true }); const transport = mockFetch(stream.response);
    for await (const event of contract.make(opts(transport.fetch)).stream(request())) if (event.type === 'text') break;
    assert.equal(stream.cancelled(), true); assert.equal(transport.calls[0].signal?.aborted, true);
  });

  test(`${contract.id}: rate-limit retry happens only before streaming and preserves one output`, async () => {
    const limited = httpError(429); limited.headers.set('retry-after', '2');
    const transport = mockFetch(limited, sseResponse(contract.frames).response);
    const delays: number[] = [];
    const provider = contract.make(opts(transport.fetch, { maxRetries: 1, sleep: async ms => { delays.push(ms); } }));
    const events = await collect(provider);
    assert.equal(transport.calls.length, 2); assert.deepEqual(delays, [2000]);
    assert.equal(events.filter(e => e.type === 'text').map(e => e.text).join(''), 'Grüße 🦞');
    assert.deepEqual(transport.calls[0].body, transport.calls[1].body);
  });

  test(`${contract.id}: credential lookup stays request-scoped rather than constructor-cached`, async () => {
    const transport = mockFetch(sseResponse(contract.frames).response, sseResponse(contract.frames).response);
    let reads = 0;
    const provider = contract.make(opts(transport.fetch, { getApiKey: async () => `synthetic-key-${++reads}` }));
    await collect(provider); await collect(provider);
    assert.equal(reads, 2);
    const header = contract.id === 'openai' ? 'authorization' : 'x-api-key';
    assert.equal(transport.calls[0].headers.get(header), contract.id === 'openai' ? 'Bearer synthetic-key-1' : 'synthetic-key-1');
    assert.equal(transport.calls[1].headers.get(header), contract.id === 'openai' ? 'Bearer synthetic-key-2' : 'synthetic-key-2');
  });

  test(`${contract.id}: model discovery uses authenticated offline GET and normalizes IDs`, async () => {
    const transport = mockFetch(new Response(JSON.stringify(contract.models), { headers: { 'content-type': 'application/json' } }));
    const models = await contract.make(opts(transport.fetch)).listModels(new AbortController().signal);
    assert.ok(models.some(model => (model as { id: string }).id === 'synthetic-model'));
    assert.equal(JSON.stringify(models).includes(fixtureKey), false);
    assert.equal(transport.calls.length, 1);
    const url = new URL(transport.calls[0].url);
    assert.equal(url.origin + url.pathname, contract.modelsEndpoint);
    if (contract.id === 'claude') assert.equal(url.searchParams.get('limit'), '100');
    assert.equal(transport.calls[0].method, 'GET'); contract.auth(transport.calls[0].headers);
  });
}
