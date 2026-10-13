import test from 'node:test';
import assert from 'node:assert/strict';
import { CheckpointStore } from './checkpoints';
import type { StudioSnapshot } from './types';

const snap = (studioId: string, bytes: number): StudioSnapshot => ({
  studioId, schemaVersion: 1, revision: 1, capturedAt: 0, bytesEstimate: bytes, checksum: 'x', payload: null,
});

test('put, get, replace and byte accounting', async () => {
  const store = new CheckpointStore(1000);
  assert.equal(await store.put(snap('a', 400)), true);
  assert.equal(store.bytes(), 400);
  assert.equal(await store.put(snap('a', 600)), true); // replace frees the old estimate
  assert.equal(store.bytes(), 600);
  assert.equal(store.get('a')?.bytesEstimate, 600);
  store.delete('a');
  assert.equal(store.bytes(), 0);
  assert.equal(store.get('a'), undefined);
});

test('checkpoints that exceed the budget are refused without evicting others', async () => {
  const store = new CheckpointStore(1000);
  assert.equal(await store.put(snap('a', 800)), true);
  assert.equal(await store.put(snap('b', 300)), false);
  assert.deepEqual(store.ids(), ['a']);
  assert.equal(await store.put(snap('b', 200)), true);
  assert.deepEqual(store.ids(), ['a', 'b']);
});

interface FakeSpill {
  map: Map<string, import('./types').StudioSnapshot>;
  failNext: boolean;
}

const fakeSpill = (): import('./spill').DurableCheckpointBackend & FakeSpill => {
  const state: FakeSpill = { map: new Map(), failNext: false };
  return {
    ...state,
    map: state.map,
    get failNext() { return state.failNext; },
    set failNext(v: boolean) { state.failNext = v; },
    async put(id, snapshot) { if (state.failNext) { state.failNext = false; throw new Error('quota'); } state.map.set(id, snapshot); },
    async get(id) { return state.map.get(id); },
    async delete(id) { state.map.delete(id); },
    async clear() { state.map.clear(); },
  };
};

test('memory overflow spills the least recently used checkpoint', async () => {
  const spill = fakeSpill();
  const store = new CheckpointStore(1000, { spill });
  assert.equal(await store.put(snap('a', 500)), true);
  assert.equal(await store.put(snap('b', 400)), true);
  assert.equal(await store.put(snap('c', 500)), true); // a spills
  assert.deepEqual([...store.ids()].sort(), ['a', 'b', 'c']);
  assert.ok(spill.map.has('a'));
  assert.equal(store.get('a'), undefined); // not in memory
  assert.equal(await store.hydrate('a'), true);
  assert.equal(store.get('a')?.studioId, 'a'); // back in memory
  assert.equal(spill.map.has('a'), false);
});

test('a checkpoint larger than the memory budget goes straight to the spill', async () => {
  const spill = fakeSpill();
  const store = new CheckpointStore(100, { spill });
  assert.equal(await store.put(snap('big', 5000)), true);
  assert.ok(spill.map.has('big'));
  assert.equal(await store.hydrate('big'), true);
});

test('spill failure keeps the new checkpoint out but never drops the old one', async () => {
  const errors: unknown[] = [];
  const spill = fakeSpill();
  const store = new CheckpointStore(1000, { spill, onSpillError: (e) => errors.push(e) });
  assert.equal(await store.put(snap('a', 800)), true);
  spill.failNext = true;
  assert.equal(await store.put(snap('b', 500)), false);
  assert.equal(store.get('a')?.studioId, 'a'); // retained
  assert.equal(errors.length, 1);
});

test('without a spill backend, over-budget puts are refused and data stays', async () => {
  const store = new CheckpointStore(1000);
  assert.equal(await store.put(snap('a', 800)), true);
  assert.equal(await store.put(snap('b', 500)), false);
  assert.equal(store.get('a')?.studioId, 'a');
});

test('delete and clear also clean the durable spill', async () => {
  const spill = fakeSpill();
  const store = new CheckpointStore(100, { spill });
  assert.equal(await store.put(snap('big', 5000)), true);
  store.delete('big');
  assert.equal(spill.map.has('big'), false);
  assert.equal(await store.put(snap('big', 5000)), true);
  store.clear();
  assert.equal(spill.map.size, 0);
});
