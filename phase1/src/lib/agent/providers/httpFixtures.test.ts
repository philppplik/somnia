import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeSse, mockFetch, privacyGate, sseResponse } from './testSupport/httpFixtures';

test('offline provider fixtures preserve byte-split UTF-8 and named SSE frames', async () => {
  const frames = [{ event: 'content_block_delta', data: { text: 'Grüße 🦞' } }, { data: '[DONE]' }];
  const fixture = sseResponse(frames);
  assert.equal(await fixture.response.text(), encodeSse(frames));
});

test('offline provider transport records headers and body and never reaches the network', async () => {
  const fixture = mockFetch(new Response('synthetic'));
  assert.equal(await (await fixture.fetch('https://example.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify({ model: 'fixture' }),
  })).text(), 'synthetic');
  assert.equal(fixture.calls[0].headers.get('authorization'), 'Bearer synthetic');
  assert.deepEqual(fixture.calls[0].body, { model: 'fixture' });
  await assert.rejects(fixture.fetch('https://example.invalid'), /fixture queue exhausted/);
});

test('offline provider fixture cancellation and consent are observable', async () => {
  const fixture = sseResponse([], { stayOpen: true });
  const reader = fixture.response.body!.getReader();
  await reader.read(); await reader.cancel(); reader.releaseLock();
  assert.equal(fixture.cancelled(), true);
  assert.equal(privacyGate().hasConsent(), true);
  assert.equal(privacyGate(false).hasConsent(), false);
});
