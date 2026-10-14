import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../openAI';
import { AgentError } from '../errors';
import { COMPAT_PROVIDERS, isCompatProvider } from '../compatProviders';
import { AUTH_ENDPOINTS } from '../providerAuth';
import { collect, fixtureKey, mockFetch, privacyGate, request, sseResponse } from './testSupport/httpFixtures';

const responseDone = [{data: {type: 'response.output_text.delta', delta: 'ok'}}, {data: {type: 'response.completed', response: {output: [{type: 'message', role: 'assistant', content: [{type: 'output_text', text: 'ok'}]}]}}}];
const done = [{ data: { choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] } }, { data: '[DONE]' }];
const make = (id: keyof typeof COMPAT_PROVIDERS, fetch: typeof globalThis.fetch) =>
  new OpenAIProvider({ vendor: COMPAT_PROVIDERS[id], fetch, getApiKey: () => fixtureKey, privacyGate: privacyGate(), maxRetries: 0 });

test('official endpoints are fixed HTTPS URLs and match the auth-test endpoints', () => {
  assert.deepEqual(Object.values(COMPAT_PROVIDERS).map(p => [p.id, p.chat, p.models]), [
    ['xai', 'https://api.x.ai/v1/chat/completions', 'https://api.x.ai/v1/models'],
    ['meta', 'https://api.meta.ai/v1/chat/completions', 'https://api.meta.ai/v1/models'],
    ['deepseek', 'https://api.deepseek.com/chat/completions', 'https://api.deepseek.com/models'],
  ]);
  for (const p of Object.values(COMPAT_PROVIDERS)) assert.equal(AUTH_ENDPOINTS[p.id], p.models);
  assert.equal(isCompatProvider('openai'), false); assert.equal(isCompatProvider('xai'), true);
});

for (const id of ['xai', 'meta', 'deepseek'] as const) {
  test(`${id}: request body has no OpenAI-only fields and keeps the plain system role`, async () => {
    const transport = mockFetch(sseResponse(id === 'deepseek' ? done : responseDone).response);
    await collect(make(id, transport.fetch), request({ messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }] }));
    const body = transport.calls[0].body;
    if (id === 'deepseek') {
      assert.equal(body.messages[0].role, 'system');
      assert.equal('store' in body, false);
      assert.equal(body.max_tokens, 128);
      assert.equal('max_completion_tokens' in body, false);
    } else {
      assert.equal(body.instructions, 'sys');
      assert.equal(body.store, false);
      assert.equal(body.max_output_tokens, 128);
      assert.deepEqual(body.include, ['reasoning.encrypted_content']);
      assert.equal('messages' in body, false);
    }
    assert.equal(transport.calls[0].url, COMPAT_PROVIDERS[id].responses ?? COMPAT_PROVIDERS[id].chat);
  });

  test(`${id}: model list tolerates entries without created/owned_by and sorts, bad shapes are protocol errors`, async () => {
    const ok = mockFetch(new Response(JSON.stringify({ data: [{ id: 'b-model' }, { id: 'a-model', object: 'model', owned_by: 'x' }, { id: 'a-model' }] }), { headers: { 'content-type': 'application/json' } }));
    const models = await make(id, ok.fetch).listModels(new AbortController().signal);
    assert.deepEqual(models.map(m => m.id), ['a-model', 'b-model']);
    assert.equal(ok.calls[0].url, COMPAT_PROVIDERS[id].models); assert.equal(ok.calls[0].method, 'GET');
    assert.equal(ok.calls[0].headers.get('authorization'), `Bearer ${fixtureKey}`);
    for (const bad of [{ models: [] }, { data: [{ id: '' }] }, { data: [{ id: 'x\ny' }] }, 'nope']) {
      const t = mockFetch(new Response(JSON.stringify(bad), { headers: { 'content-type': 'application/json' } }));
      await assert.rejects(make(id, t.fetch).listModels(new AbortController().signal), e => e instanceof AgentError && e.detail === 'protocol');
    }
  });

  test(`${id}: errors name the vendor, not OpenAI, and never echo the key`, async () => {
    const t = mockFetch(new Response('{}', { status: 401 }));
    await assert.rejects(collect(make(id, t.fetch)), (e: any) => { assert.ok(e instanceof AgentError); assert.match(e.message, new RegExp(COMPAT_PROVIDERS[id].label.split(' ')[0])); assert.doesNotMatch(e.message, /OpenAI|synthetic-key/); return true; });
  });

  test(`${id}: no consent means no network call`, async () => {
    const t = mockFetch();
    const p = new OpenAIProvider({ vendor: COMPAT_PROVIDERS[id], fetch: t.fetch, getApiKey: () => fixtureKey, privacyGate: privacyGate(false), maxRetries: 0 });
    await assert.rejects(collect(p));
    assert.equal(t.calls.length, 0);
  });
}

test('vendor and OpenAI account auth are mutually exclusive', () => {
  assert.throws(() => new OpenAIProvider({ vendor: COMPAT_PROVIDERS.xai, account: { getAccessToken: async () => 'x', refresh: async () => 'x' } }));
});
