import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  closeVideo,
  createVideoLifecycleAdapter,
  getVideoSession,
  openVideo,
  setVideoFormat,
  setVideoEngineFactory,
  trimTimelineClip,
} from './session';
import { verifyVideoSnapshot, type VideoSnapshotPayload } from './lifecycleSnapshot';
import { isNeutralTimeline } from './timeline';
import type { VideoEngineLike } from './engine';
import type { VideoProbe, VideoReport } from './protocol';
import { addMediaFile, clearMedia, getMedia } from '../media';

const WEBM = new URL('../../../tests/assets/clip.webm', import.meta.url);
const bytes = () => new Uint8Array(readFileSync(WEBM));
const PROBE: VideoProbe = { duration: 2, video: { codec: 'vp9', width: 320, height: 180, fps: 25 }, audio: { codec: 'opus', channels: 2, rate: 48000 } };
const REPORT: VideoReport = { format: 'webm', duration_s: 2, bytes: 1, videoCodec: 'vp9', audioCodec: 'opus', steps: [] };
let probes = 0;
const fakeEngine = (): VideoEngineLike => ({
  async capabilities() { return { formats: ['webm', 'mp4'] } as never; },
  async probe() { probes++; return PROBE; },
  async export() { return { bytes: new ArrayBuffer(4), mime: 'video/webm', report: REPORT }; },
  cancelExport() {},
  dispose() {},
});

const addClip = async (name: string) => {
  const added = await addMediaFile(new Blob([bytes()], { type: 'video/webm' }), name);
  assert.ok('name' in added);
  const item = getMedia().items.find((i) => i.name === added.name)!;
  return { name: item.name, url: item.url };
};

test.beforeEach(() => { clearMedia(); probes = 0; setVideoEngineFactory(() => fakeEngine()); });
test.afterEach(() => { for (const s of [...getMedia().items]) closeVideo(s.name); clearMedia(); });

test('video adapter: recipe-only round trip restores the timeline on re-open', async () => {
  const item = await addClip('a.webm');
  await openVideo(item);
  const clipId = getVideoSession('a.webm')!.clips[0].id;
  trimTimelineClip('a.webm', clipId, 'in', 0.5);
  setVideoFormat('a.webm', 'mp4');
  const adapter = createVideoLifecycleAdapter();
  assert.ok(adapter.estimateBytes!() > 0, 'source bytes count toward the estimate');

  const snapshot = await adapter.snapshot!();
  assert.ok(snapshot && verifyVideoSnapshot(snapshot));
  const payload = snapshot.payload as VideoSnapshotPayload;
  assert.equal(payload.sessions[0].source, item.url, 'fingerprint is the media URL');
  assert.equal(payload.sessions[0].format, 'mp4');

  await adapter.suspend!();
  assert.equal(getVideoSession('a.webm'), null);
  assert.equal(adapter.estimateBytes!(), 0, 'suspend releases source bytes');

  await adapter.resume!(snapshot);
  await openVideo(item); // same file re-opens: the recipe applies
  const restored = getVideoSession('a.webm')!;
  assert.equal(restored.status, 'ready', restored.error);
  assert.equal(restored.clips[0].in_s, 0.5, 'timeline edit survived without source bytes');
  assert.equal(restored.format, 'mp4');
  assert.ok(probes >= 2, 'probe re-ran against the fresh session');
});

test('a different file under the same name does not inherit the recipe', async () => {
  const item = await addClip('a.webm');
  await openVideo(item);
  trimTimelineClip('a.webm', getVideoSession('a.webm')!.clips[0].id, 'in', 0.5);
  const adapter = createVideoLifecycleAdapter();
  const snapshot = await adapter.snapshot!();
  await adapter.suspend!();
  await adapter.resume!(snapshot!);

  clearMedia(); // new media registration: same name, new source URL
  const other = await addClip('a.webm');
  assert.notEqual(other.url, item.url);
  await openVideo(other);
  const s = getVideoSession('a.webm')!;
  assert.ok(isNeutralTimeline(s.clips, 'a.webm', 2), 'stale recipe dropped');
});

test('a re-open between snapshot and resume (shell preview race) still gets the recipe', async () => {
  const item = await addClip('a.webm');
  await openVideo(item);
  trimTimelineClip('a.webm', getVideoSession('a.webm')!.clips[0].id, 'in', 0.5);
  setVideoFormat('a.webm', 'mp4');
  const adapter = createVideoLifecycleAdapter();
  const snapshot = await adapter.snapshot!();
  await adapter.suspend!();
  // The code studio's media preview re-opens the file before resume() runs.
  await openVideo(item);
  const early = getVideoSession('a.webm')!;
  assert.equal(early.clips[0].in_s, 0.5, 'recipe was already waiting for the early re-open');
  assert.equal(early.format, 'mp4');
  await adapter.resume!(snapshot!); // late resume must not clobber the live session
  const after = getVideoSession('a.webm')!;
  assert.equal(after.clips[0].in_s, 0.5);
});

test('a resume with a tampered checkpoint is rejected', async () => {
  const adapter = createVideoLifecycleAdapter();
  const snapshot = await adapter.snapshot!();
  assert.ok(snapshot); // empty studio: still a valid empty payload
  await assert.rejects(adapter.resume!({ ...snapshot, checksum: '00'.repeat(8) }), /verification/);
});
