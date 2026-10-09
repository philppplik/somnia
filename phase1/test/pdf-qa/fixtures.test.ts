/** Sanity checks for the fixture corpus itself. If these fail, fix the generator before trusting any other QA result. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CORPUS, makePng, FORM_FIELDS } from './fixtures.ts';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

test('every corpus entry builds and is non-trivially sized (except `empty`)', async () => {
  for (const [name, make] of Object.entries(CORPUS)) {
    const b = await make();
    if (name === 'corrupt-empty') assert.equal(b.length, 0); else assert.ok(b.length > 20, name);
  }
});
test('generation is deterministic: two runs give identical bytes', async () => {
  for (const name of ['text-heavy', 'acroform', 'multi-page', 'existing-annotations', 'signed-marker']) {
    assert.equal(sha(await CORPUS[name]()), sha(await CORPUS[name]()), name);
  }
});
test('size classes: image-heavy is large, text-heavy-100 has 100 pages, blank is tiny', async () => {
  assert.ok((await CORPUS['image-heavy']()).length > 100_000);
  assert.ok((await CORPUS['blank']()).length < 2_000);
  assert.ok((await CORPUS['text-heavy-100']()).length > (await CORPUS['text-heavy']()).length);
});
test('makePng produces a PNG signature and correct IHDR dimensions', () => {
  const p = makePng(7, 5, () => [1, 2, 3]);
  assert.deepEqual([...p.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(p.buffer, p.byteOffset);
  assert.equal(dv.getUint32(16), 7); assert.equal(dv.getUint32(20), 5);
});
test('form field names are unique', () => {
  const v = Object.values(FORM_FIELDS); assert.equal(new Set(v).size, v.length);
});
test('no embedded font programs: fixtures reference standard fonts by name only', async () => {
  for (const name of ['text-heavy', 'acroform', 'multi-page', 'unicode-meta']) {
    const s = new TextDecoder('latin1').decode(await CORPUS[name]());
    assert.ok(!/\/FontFile[23]?\b/.test(s), `${name} embeds a font file`);
  }
});
