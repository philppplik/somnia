import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipeAdapter, estimateValueBytes, fingerprintOf, payloadChecksum, RecipeStash, sealSnapshot, verifySnapshot } from './recipeKit';

const seal = (payload: unknown, revision = 1) => sealSnapshot({ studioId: 'x', schemaVersion: 1, revision, payload, bytesEstimate: 10, now: () => 5 });

test('checksum is stable across key order and covers typed arrays', () => {
  assert.equal(payloadChecksum('x', 1, 1, { a: 1, b: [1, 2] }), payloadChecksum('x', 1, 1, { b: [1, 2], a: 1 }));
  assert.notEqual(payloadChecksum('x', 1, 1, { b: new Uint8Array([1, 2]) }), payloadChecksum('x', 1, 1, { b: new Uint8Array([1, 3]) }));
  assert.notEqual(payloadChecksum('x', 1, 1, { a: 1 }), payloadChecksum('x', 1, 2, { a: 1 }));
  assert.notEqual(payloadChecksum('x', 1, 1, { a: 1 }), payloadChecksum('y', 1, 1, { a: 1 }));
});

test('verifySnapshot accepts a sealed snapshot and rejects tampering, wrong studio and wrong schema', () => {
  const snap = seal({ entries: [1] });
  verifySnapshot(snap, 'x', 1);
  assert.throws(() => verifySnapshot({ ...snap, payload: { entries: [2] } }, 'x', 1), /verification/);
  assert.throws(() => verifySnapshot(snap, 'y', 1), /belongs to/);
  assert.throws(() => verifySnapshot(snap, 'x', 2), /version/);
  assert.throws(() => verifySnapshot({ ...snap, payload: null }, 'x', 1), /payload/);
});

test('fingerprint hides the url and differs per source', () => {
  const a = fingerprintOf('blob:http://localhost/abc');
  assert.ok(!a.includes('blob'));
  assert.notEqual(a, fingerprintOf('blob:http://localhost/def'));
  assert.equal(a, fingerprintOf('blob:http://localhost/abc'));
});

test('estimateValueBytes counts typed arrays by byte length', () => {
  assert.ok(estimateValueBytes({ b: new Uint8Array(1000) }) >= 1000);
});

test('stash hands a recipe back once, only for the same fingerprint', () => {
  const s = new RecipeStash<number>();
  s.put({ name: 'a', fingerprint: 'f1', recipe: 1 });
  assert.equal(s.take('a', 'f1'), 1);
  assert.equal(s.take('a', 'f1'), undefined);
  s.put({ name: 'a', fingerprint: 'f1', recipe: 2 });
  assert.equal(s.take('a', 'other'), undefined, 'a different file under the same name does not inherit the edit');
  assert.equal(s.size, 0, 'the stale entry is dropped');
});

function harness() {
  const stash = new RecipeStash<{ v: number }>();
  const live = new Map<string, { fingerprint: string; recipe: { v: number } }>();
  let released = 0;
  let rev = 0;
  const adapter = createRecipeAdapter<{ v: number }>({
    studioId: 'x', schemaVersion: 1, stash,
    capture: () => [...live].map(([name, e]) => ({ name, ...e })),
    release: () => { released++; live.clear(); },
    sanitize: (r) => (r && typeof (r as { v: unknown }).v === 'number' ? { v: (r as { v: number }).v } : null),
    pinReasons: () => (live.has('busy') ? ['busy'] : []),
    estimateBytes: () => 7,
    revision: () => rev,
  });
  return { adapter, stash, live, released: () => released, bump: () => { rev++; } };
}

test('recipe adapter: snapshot, suspend, resume round trip keeps edits and never keeps live sessions', async () => {
  const h = harness();
  h.live.set('a', { fingerprint: 'f', recipe: { v: 3 } });
  const snap = (await h.adapter.snapshot!())!;
  assert.equal(snap.studioId, 'x');
  await h.adapter.suspend!();
  assert.equal(h.released(), 1);
  assert.equal(h.live.size, 0);
  assert.equal(h.stash.size, 1, 'edits stay available until the document re-opens');
  h.stash.clear();
  await h.adapter.resume!(snap);
  assert.equal(h.stash.take('a', 'f')?.v, 3);
});

test('recipe adapter: stashed recipes survive repeated suspends (merge into the next checkpoint)', async () => {
  const h = harness();
  h.stash.put({ name: 'old', fingerprint: 'f0', recipe: { v: 1 } });
  h.live.set('new', { fingerprint: 'f1', recipe: { v: 2 } });
  const snap = (await h.adapter.snapshot!())!;
  const names = (snap.payload as { entries: { name: string }[] }).entries.map((e) => e.name).sort();
  assert.deepEqual(names, ['new', 'old']);
});

test('recipe adapter: unsaved state refuses eviction, a clean studio can be disposed', async () => {
  const h = harness();
  assert.equal(h.adapter.hasUnsavedChanges!(), false);
  await h.adapter.dispose!();
  h.stash.put({ name: 'a', fingerprint: 'f', recipe: { v: 1 } });
  assert.equal(h.adapter.hasUnsavedChanges!(), true);
  await assert.rejects(() => h.adapter.dispose!(), /Refusing/);
});

test('recipe adapter: corrupt checkpoints are rejected and invalid recipes dropped', async () => {
  const h = harness();
  const snap = (await h.adapter.snapshot!())!;
  await assert.rejects(() => h.adapter.resume!({ ...snap, checksum: 'bad' }), /verification/);
  const bad = seal({ entries: [{ name: 'a', fingerprint: 'f', recipe: { v: 'no' } }, { name: 'b', fingerprint: 'f', recipe: { v: 4 } }] });
  const sealed = { ...bad, studioId: 'x' };
  await h.adapter.resume!(sealed);
  assert.equal(h.stash.take('a', 'f'), undefined);
  assert.equal(h.stash.take('b', 'f')?.v, 4);
});

test('recipe adapter: pins and revision are reported from the studio', async () => {
  const h = harness();
  h.live.set('busy', { fingerprint: 'f', recipe: { v: 1 } });
  assert.deepEqual(h.adapter.pinReasons!(), ['busy']);
  const a = (await h.adapter.snapshot!())!;
  h.bump();
  const b = (await h.adapter.snapshot!())!;
  assert.ok(b.revision > a.revision);
  assert.equal(h.adapter.estimateBytes!(), 7);
});
