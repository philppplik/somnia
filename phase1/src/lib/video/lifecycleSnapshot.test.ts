import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDEO_SNAPSHOT_SCHEMA,
  verifyVideoSnapshot,
  videoSnapshotBytes,
  videoSnapshotChecksum,
  type VideoSnapshotPayload,
} from './lifecycleSnapshot';
import type { StudioSnapshot } from '../lifecycle/types';

const payload = (): VideoSnapshotPayload => ({
  sessions: [{
    name: 'a.webm',
    source: 'blob:app/1',
    ext: 'webm',
    clips: [{ id: 'c1', source: 'a.webm', in_s: 0.5, out_s: 2, gain: 1.5, muted: true }],
    selectedClipId: 'c1',
    format: 'mp4',
  }],
});

const snapshotOf = (p: VideoSnapshotPayload): StudioSnapshot => ({
  studioId: 'video',
  schemaVersion: VIDEO_SNAPSHOT_SCHEMA,
  revision: 1,
  capturedAt: 0,
  bytesEstimate: videoSnapshotBytes(p),
  checksum: videoSnapshotChecksum(p),
  payload: p,
});

test('a well-formed video checkpoint verifies', () => {
  assert.equal(verifyVideoSnapshot(snapshotOf(payload())), true);
});

test('a tampered timeline fails verification', () => {
  const p = payload();
  const s = snapshotOf(p);
  p.sessions[0].clips[0].gain = 2;
  assert.equal(verifyVideoSnapshot(s), false);
});

test('wrong studio, schema or shape fails verification', () => {
  const p = payload();
  assert.equal(verifyVideoSnapshot({ ...snapshotOf(p), studioId: 'sound' }), false);
  assert.equal(verifyVideoSnapshot({ ...snapshotOf(p), schemaVersion: 99 }), false);
  assert.equal(verifyVideoSnapshot({ ...snapshotOf(p), payload: { sessions: [{ name: 1 }] } }), false);
});

test('byte estimate scales with the timeline', () => {
  const small = videoSnapshotBytes(payload());
  const big = videoSnapshotBytes({
    sessions: [...payload().sessions, ...payload().sessions.map((s) => ({ ...s, name: 'b.webm' }))],
  });
  assert.ok(big > small);
});
