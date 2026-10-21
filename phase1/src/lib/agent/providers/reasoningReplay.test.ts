import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../openAI';
import { COMPAT_PROVIDERS } from '../compatProviders';
import { AgentSession } from '../session';
import { collect, fixtureKey, mockFetch, privacyGate, request, sseResponse } from './testSupport/httpFixtures';
import type { AgentMessage } from '../types';
import { replayFor, validateReplay } from '../providerReplay';

const done = [{data: {choices: [{index: 0, delta: {content: 'ok'}, finish_reason: 'stop'}]}}, {data: '[DONE]'}];
const provider = (id: keyof typeof COMPAT_PROVIDERS, fetch: typeof globalThis.fetch) => new OpenAIProvider({vendor: COMPAT_PROVIDERS[id], getApiKey: () => fixtureKey, fetch, privacyGate: privacyGate(), maxRetries: 0});

test('DeepSeek streams reasoning privately and replays it verbatim for tool-enabled requests', async () => {
  const first = sseResponse([{data: {choices: [{delta: {reasoning_content: 'think '}}]}}, {data: {choices: [{delta: {reasoning_content: '🌙'}}]}}, ...done]);
  const transport = mockFetch(first.response, sseResponse(done).response, sseResponse(done).response);
  const p = provider('deepseek', transport.fetch);
  const events = await collect(p);
  const replay = events.find(e => e.type === 'provider-replay');
  assert.equal(replay?.type, 'provider-replay');
  if (replay?.type !== 'provider-replay') throw Error('missing replay');
  assert.equal(replay.replay.reasoningContent, 'think 🌙');
  assert.equal(events.filter(e => e.type === 'text').map(e => e.text).join(''), 'ok');
  const messages: AgentMessage[] = [{role: 'user', content: 'first'}, {role: 'assistant', content: 'ok', providerReplay: replay.replay}, {role: 'user', content: 'next'}];
  const tools = [{name: 'read_file', description: 'read', parameters: {type: 'object'}}];
  await collect(p, request({messages, tools}));
  assert.equal(transport.calls[1].body.messages[1].reasoning_content, 'think 🌙');
  await collect(p, request({messages}));
  assert.equal('reasoning_content' in transport.calls[2].body.messages[1], false);
});

for (const id of ['xai', 'meta'] as const) {
  test(`${id}: Responses keeps complete encrypted output in session and replays it unchanged`, async () => {
    const output = [{type: 'reasoning', id: 'rs_fixture', encrypted_content: 'opaque-ciphertext', summary: []}, {type: 'message', id: 'msg_fixture', role: 'assistant', content: [{type: 'output_text', text: 'answer', annotations: []}]}];
    const frames = [{data: {type: 'response.output_text.delta', delta: 'answer'}}, {data: {type: 'response.completed', response: {output}}}];
    const transport = mockFetch(sseResponse(frames).response, sseResponse(frames).response);
    const session = new AgentSession({provider: provider(id, transport.fetch), model: 'synthetic-model'});
    await session.prompt('first');
    assert.deepEqual(session.snapshot().messages[1].providerReplay?.output, output);
    await session.prompt('next');
    assert.deepEqual(transport.calls[1].body.input.slice(1, 3), output);
    assert.equal(transport.calls[1].body.input.filter((x: any) => x.role === 'assistant').length, 1);
    assert.equal('previous_response_id' in transport.calls[1].body, false);
    assert.equal(transport.calls[1].body.store, false);
  });

  test(`${id}: function output items remain in replay before matching tool results`, async () => {
    const output = [{type: 'reasoning', encrypted_content: 'opaque', summary: []}, {type: 'function_call', id: 'fc_fixture', call_id: 'call_fixture', name: 'read_file', arguments: '{}', status: 'completed'}];
    const frames = [{data: {type: 'response.output_item.added', output_index: 1, item: output[1]}}, {data: {type: 'response.function_call_arguments.done', output_index: 1, arguments: '{}'}}, {data: {type: 'response.completed', response: {output}}}];
    const transport = mockFetch(sseResponse(frames).response, sseResponse([{data: {type: 'response.completed', response: {output: []}}}]).response);
    const p = provider(id, transport.fetch);
    const events = await collect(p);
    const replay = events.find(e => e.type === 'provider-replay');
    if (replay?.type !== 'provider-replay') throw Error('missing replay');
    await collect(p, request({messages: [{role: 'assistant', content: '', toolCalls: [{id: 'call_fixture', name: 'read_file', arguments: '{}'}], providerReplay: replay.replay}, {role: 'tool', toolCallId: 'call_fixture', content: 'result'}]}));
    assert.deepEqual(transport.calls[1].body.input.slice(0, 2), output);
    assert.deepEqual(transport.calls[1].body.input[2], {type: 'function_call_output', call_id: 'call_fixture', output: 'result'});
  });
}

test('replay cannot cross providers or model selections; malformed and oversized state fails closed', () => {
  const m: AgentMessage = {role: 'assistant', content: '', providerReplay: {provider: 'deepseek', model: 'one', reasoningContent: 'private'}};
  assert.equal(replayFor(m, 'xai', 'one'), undefined);
  assert.equal(replayFor(m, 'deepseek', 'two'), undefined);
  assert.throws(() => validateReplay({provider: 'xai', model: 'one', output: [{type: 4}]}));
  assert.throws(() => validateReplay({provider: 'deepseek', model: 'one', reasoningContent: 'x'.repeat(1024 * 1024)}));
});

test('Meta inserts an assistant separator after a reasoning-only turn; missing encrypted content fails closed', async () => {
  const output = [{type: 'reasoning', encrypted_content: 'opaque', summary: []}];
  const transport = mockFetch(sseResponse([{data: {type: 'response.completed', response: {output}}}]).response, sseResponse([{data: {type: 'response.completed', response: {output: []}}}]).response);
  const p = provider('meta', transport.fetch);
  const events = await collect(p);
  const replay = events.find(e => e.type === 'provider-replay');
  if (replay?.type !== 'provider-replay') throw Error('missing replay');
  await collect(p, request({messages: [{role: 'assistant', content: '', providerReplay: replay.replay}, {role: 'user', content: 'next'}]}));
  assert.deepEqual(transport.calls[1].body.input[0], output[0]);
  assert.equal(transport.calls[1].body.input[1].role, 'assistant');
  assert.equal(transport.calls[1].body.input[2].role, 'user');
  assert.throws(() => validateReplay({provider: 'meta', model: 'one', output: [{type: 'reasoning', id: 'rs_only', summary: []}]}));
});

test('restored sessions validate replay and never emit private reasoning to UI events', async () => {
  const transport = mockFetch(sseResponse([{data: {choices: [{delta: {reasoning_content: 'private-reasoning'}}]}}, ...done]).response);
  const seen: unknown[] = [];
  const session = new AgentSession({provider: provider('deepseek', transport.fetch), model: 'synthetic-model', onEvent: e => seen.push(e)});
  await session.prompt('first');
  assert.equal(JSON.stringify(seen).includes('private-reasoning'), false);
  const snapshot = session.snapshot();
  session.restore(snapshot);
  assert.equal(session.snapshot().messages[1].providerReplay?.reasoningContent, 'private-reasoning');
  snapshot.messages[0].providerReplay = snapshot.messages[1].providerReplay;
  assert.throws(() => session.restore(snapshot), /assistant/);
});
