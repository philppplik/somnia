import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHOTOS_SNAPSHOT_SCHEMA,
  photosSnapshotBytes,
  photosSnapshotChecksum,
  verifyPhotosSnapshot,
  type PhotosSnapshotPayload,
} from './lifecycleSnapshot';
import { neutralPhotoSettings, photoSignature } from './studioSettings';
import type { StudioSnapshot } from '../lifecycle/types';

const payload = (): PhotosSnapshotPayload => ({
  sessions: [{
    name: 'photo.png',
    source: 'blob:app/1',
    now: { ...neutralPhotoSettings, contrast: 10 },
    past: [{ ...neutralPhotoSettings }],
    future: [],
    saved: photoSignature(neutralPhotoSettings),
    cropping: false,
    cropDraft: null,
  }],
});

const snapshotOf = (p: PhotosSnapshotPayload): StudioSnapshot => ({
  studioId: 'photos',
  schemaVersion: PHOTOS_SNAPSHOT_SCHEMA,
  revision: 1,
  capturedAt: 0,
  bytesEstimate: photosSnapshotBytes(p),
  checksum: photosSnapshotChecksum(p),
  payload: p,
});

test('a well-formed photos checkpoint verifies', () => {
  assert.equal(verifyPhotosSnapshot(snapshotOf(payload())), true);
});

test('tampered settings or history fail verification', () => {
  const p = payload();
  const s = snapshotOf(p);
  p.sessions[0].now.exposure = 5;
  assert.equal(verifyPhotosSnapshot(s), false);
  const p2 = payload();
  const s2 = snapshotOf(p2);
  p2.sessions[0].past = [];
  assert.equal(verifyPhotosSnapshot(s2), false);
});

test('wrong studio, schema or shape fails verification', () => {
  const p = payload();
  assert.equal(verifyPhotosSnapshot({ ...snapshotOf(p), studioId: 'video' }), false);
  assert.equal(verifyPhotosSnapshot({ ...snapshotOf(p), schemaVersion: 99 }), false);
  assert.equal(verifyPhotosSnapshot({ ...snapshotOf(p), payload: { sessions: [{ name: 'x' }] } }), false);
});

test('byte estimate scales with history depth', () => {
  const small = photosSnapshotBytes(payload());
  const deep = payload();
  deep.sessions[0].past = Array.from({ length: 20 }, () => ({ ...neutralPhotoSettings }));
  assert.ok(photosSnapshotBytes(deep) > small);
});
