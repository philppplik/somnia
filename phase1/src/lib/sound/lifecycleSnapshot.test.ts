import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOUND_SNAPSHOT_SCHEMA,
  soundSnapshotBytes,
  soundSnapshotChecksum,
  verifySoundSnapshot,
  type SoundSnapshotPayload,
} from './lifecycleSnapshot';
import { DEFAULT_SETTINGS } from './recipe';
import type { StudioSnapshot } from '../lifecycle/types';

const payload = (): SoundSnapshotPayload => ({
  sessions: [{
    name: 'song.mp3',
    source: 'blob:app/1',
    settings: { ...DEFAULT_SETTINGS, reverse: true },
    selection: { start: 1, end: 2 },
    listen: 'original',
  }],
});

const snapshotOf = (p: SoundSnapshotPayload): StudioSnapshot => ({
  studioId: 'sound',
  schemaVersion: SOUND_SNAPSHOT_SCHEMA,
  revision: 1,
  capturedAt: 0,
  bytesEstimate: soundSnapshotBytes(p),
  checksum: soundSnapshotChecksum(p),
  payload: p,
});

test('a well-formed sound checkpoint verifies', () => {
  assert.equal(verifySoundSnapshot(snapshotOf(payload())), true);
});

test('tampered recipe or selection fails verification', () => {
  const p = payload();
  const s = snapshotOf(p);
  p.sessions[0].settings.pitch = 12;
  assert.equal(verifySoundSnapshot(s), false);
  const p2 = payload();
  const s2 = snapshotOf(p2);
  p2.sessions[0].selection = null;
  assert.equal(verifySoundSnapshot(s2), false);
});

test('wrong studio, schema or shape fails verification', () => {
  const p = payload();
  assert.equal(verifySoundSnapshot({ ...snapshotOf(p), studioId: 'photos' }), false);
  assert.equal(verifySoundSnapshot({ ...snapshotOf(p), schemaVersion: 99 }), false);
  assert.equal(verifySoundSnapshot({ ...snapshotOf(p), payload: { sessions: [{ name: 'x' }] } }), false);
});

test('byte estimate scales with sessions', () => {
  const small = soundSnapshotBytes(payload());
  const big = soundSnapshotBytes({ sessions: [...payload().sessions, ...payload().sessions] });
  assert.ok(big > small);
});
