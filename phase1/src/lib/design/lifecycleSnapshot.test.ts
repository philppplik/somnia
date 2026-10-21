import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESIGN_SNAPSHOT_SCHEMA,
  designSnapshotBytes,
  designSnapshotChecksum,
  verifyDesignSnapshot,
  type DesignSnapshotPayload,
} from './lifecycleSnapshot';
import type { StudioSnapshot } from '../lifecycle/types';

const payload = (): DesignSnapshotPayload => ({
  document: '{"artboards":[{"id":"a1","name":"Board"}]}',
  artboardId: 'a1',
  selection: null,
  selectedIds: [],
  tool: 'select',
  dirty: true,
  past: ['{"artboards":[]}'],
  future: [],
});

const snapshotOf = (p: DesignSnapshotPayload): StudioSnapshot => ({
  studioId: 'design',
  schemaVersion: DESIGN_SNAPSHOT_SCHEMA,
  revision: 1,
  capturedAt: 0,
  bytesEstimate: designSnapshotBytes(p),
  checksum: designSnapshotChecksum(p),
  payload: p,
});

test('a well-formed design checkpoint verifies', () => {
  assert.equal(verifyDesignSnapshot(snapshotOf(payload())), true);
});

test('tampered document or history fails verification', () => {
  const p = payload();
  const s = snapshotOf(p);
  p.document = '{"artboards":[{"id":"a1","name":"Hacked"}]}';
  assert.equal(verifyDesignSnapshot(s), false);
  const p2 = payload();
  const s2 = snapshotOf(p2);
  p2.past = [];
  assert.equal(verifyDesignSnapshot(s2), false);
});

test('wrong studio or schema fails verification', () => {
  const p = payload();
  assert.equal(verifyDesignSnapshot({ ...snapshotOf(p), studioId: 'vector' }), false);
  assert.equal(verifyDesignSnapshot({ ...snapshotOf(p), schemaVersion: 99 }), false);
});

test('byte estimate scales with serialized state', () => {
  const small = designSnapshotBytes(payload());
  const big = designSnapshotBytes({ ...payload(), past: ['{"artboards":[]}'.repeat(10)] });
  assert.ok(big > small);
});
