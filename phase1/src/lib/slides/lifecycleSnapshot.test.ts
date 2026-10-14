import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SLIDES_SNAPSHOT_SCHEMA,
  slidesSnapshotBytes,
  slidesSnapshotChecksum,
  verifySlidesSnapshot,
  type SlidesSnapshotPayload,
} from './lifecycleSnapshot';
import type { StudioSnapshot } from '../lifecycle/types';

const payload = (): SlidesSnapshotPayload => ({
  sessions: [
    {
      name: 'deck.pptx',
      source: 'blob:source-1',
      revision: 3,
      index: 1,
      dirty: true,
      original: new Uint8Array([1, 2, 3]),
      working: new Uint8Array([4, 5, 6, 7]),
      undo: [new Uint8Array([1, 2, 3])],
      redo: [],
      summary: null,
      runs: [],
    },
  ],
});

const snapshotOf = (p: SlidesSnapshotPayload): StudioSnapshot => ({
  studioId: 'slides',
  schemaVersion: SLIDES_SNAPSHOT_SCHEMA,
  revision: 3,
  capturedAt: 0,
  bytesEstimate: slidesSnapshotBytes(p),
  checksum: slidesSnapshotChecksum(p),
  payload: p,
});

test('a well-formed checkpoint verifies', () => {
  assert.equal(verifySlidesSnapshot(snapshotOf(payload())), true);
});

test('tampered working bytes fail verification: edits are never silently replaced', () => {
  const p = payload();
  const snapshot = snapshotOf(p);
  p.sessions[0].working = new Uint8Array([9, 9, 9, 9]);
  assert.equal(verifySlidesSnapshot(snapshot), false);
});

test('wrong studio or schema fails verification', () => {
  const p = payload();
  assert.equal(verifySlidesSnapshot({ ...snapshotOf(p), studioId: 'photos' }), false);
  assert.equal(verifySlidesSnapshot({ ...snapshotOf(p), schemaVersion: 999 }), false);
  assert.equal(verifySlidesSnapshot({ ...snapshotOf(p), payload: null }), false);
});

test('undo history changes the checksum', () => {
  const p = payload();
  const before = slidesSnapshotChecksum(p);
  p.sessions[0].undo = [...p.sessions[0].undo, new Uint8Array([7])];
  assert.notEqual(slidesSnapshotChecksum(p), before);
});

test('the byte estimate covers packages and history', () => {
  const p = payload();
  // original 3 + working 4 + undo 3 + metadata allowance 1024
  assert.equal(slidesSnapshotBytes(p), 3 + 4 + 3 + 1024);
});
