import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VECTOR_SNAPSHOT_SCHEMA,
  vectorSnapshotBytes,
  vectorSnapshotChecksum,
  verifyVectorSnapshot,
  type VectorSnapshotPayload,
} from './lifecycleSnapshot';
import type { StudioSnapshot } from '../lifecycle/types';

const payload = (): VectorSnapshotPayload => ({
  name: 'Icon.svg',
  doc: '{"width":1024,"height":1024,"paths":[{"id":"p1","nodes":[]}]}',
  selection: ['p1'],
  tool: 'pen',
  zoom: 2,
  pan: { x: 10, y: -5 },
  dirty: true,
  open: true,
  nodePath: 'p1',
  selectedNode: null,
  past: ['{"width":1024,"height":1024,"paths":[]}'],
  future: [],
});

const snapshotOf = (p: VectorSnapshotPayload): StudioSnapshot => ({
  studioId: 'vector',
  schemaVersion: VECTOR_SNAPSHOT_SCHEMA,
  revision: 1,
  capturedAt: 0,
  bytesEstimate: vectorSnapshotBytes(p),
  checksum: vectorSnapshotChecksum(p),
  payload: p,
});

test('a well-formed vector checkpoint verifies', () => {
  assert.equal(verifyVectorSnapshot(snapshotOf(payload())), true);
});

test('tampered view state or document fails verification', () => {
  const p = payload();
  const s = snapshotOf(p);
  p.zoom = 4;
  assert.equal(verifyVectorSnapshot(s), false);
  const p2 = payload();
  const s2 = snapshotOf(p2);
  p2.doc = '{"width":1,"height":1,"paths":[]}';
  assert.equal(verifyVectorSnapshot(s2), false);
});

test('wrong studio, schema or shape fails verification', () => {
  const p = payload();
  assert.equal(verifyVectorSnapshot({ ...snapshotOf(p), studioId: 'design' }), false);
  assert.equal(verifyVectorSnapshot({ ...snapshotOf(p), schemaVersion: 99 }), false);
  assert.equal(verifyVectorSnapshot({ ...snapshotOf(p), payload: { doc: 1 } }), false);
});

test('byte estimate covers document and history', () => {
  const p = payload();
  const expected = 1024 + p.name.length * 2 + (p.doc.length + p.past[0].length) * 2;
  assert.equal(vectorSnapshotBytes(p), expected);
});
