import test from 'node:test';
import assert from 'node:assert/strict';
import { CheckpointStore } from './checkpoints';
import type { StudioSnapshot } from './types';

const snap = (studioId: string, bytes: number): StudioSnapshot => ({
  studioId, schemaVersion: 1, revision: 1, capturedAt: 0, bytesEstimate: bytes, checksum: 'x', payload: null,
});

test('put, get, replace and byte accounting', () => {
  const store = new CheckpointStore(1000);
  assert.equal(store.put(snap('a', 400)), true);
  assert.equal(store.bytes(), 400);
  assert.equal(store.put(snap('a', 600)), true); // replace frees the old estimate
  assert.equal(store.bytes(), 600);
  assert.equal(store.get('a')?.bytesEstimate, 600);
  store.delete('a');
  assert.equal(store.bytes(), 0);
  assert.equal(store.get('a'), undefined);
});

test('checkpoints that exceed the budget are refused without evicting others', () => {
  const store = new CheckpointStore(1000);
  assert.equal(store.put(snap('a', 800)), true);
  assert.equal(store.put(snap('b', 300)), false);
  assert.deepEqual(store.ids(), ['a']);
  assert.equal(store.put(snap('b', 200)), true);
  assert.deepEqual(store.ids(), ['a', 'b']);
});
