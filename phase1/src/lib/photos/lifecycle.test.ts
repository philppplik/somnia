import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closePhoto,
  commitPhotoSettings,
  createPhotosLifecycleAdapter,
  dirtyPhoto,
  getPhotoSession,
  openPhoto,
  setPhotoEngineFactory,
  type PhotoEngineLike,
} from './studioSession';
import { verifyPhotosSnapshot, type PhotosSnapshotPayload } from './lifecycleSnapshot';
import { neutralPhotoSettings, photoSignature, type PhotoSettings } from './studioSettings';
import type { PhotosResponse } from './engine';
import { addMediaFile, clearMedia, getMedia } from '../media';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r6IuAAAAEElEQVR4nGP8z8DwnwEKmBgA3yEBAemZYhMAAAAASUVORK5CYII=';
const pngBytes = () => Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0));

function fakeEngine(): PhotoEngineLike {
  const res = (settings?: PhotoSettings): PhotosResponse => ({
    id: 0, ok: true,
    bytes: new TextEncoder().encode(settings ? photoSignature(settings) : 'src').buffer as ArrayBuffer,
    width: 8, height: 4,
  });
  return { async load() { return res(); }, async renderPhoto(s) { return res(s); }, async exportPhoto(s) { return res(s); }, dispose() {} };
}

const addPhoto = async (name: string) => {
  const added = await addMediaFile(new Blob([pngBytes()], { type: 'image/png' }), name);
  assert.ok('name' in added);
  const item = getMedia().items.find((i) => i.name === added.name)!;
  return { name: item.name, url: item.url, mime: item.mime };
};

test.beforeEach(() => { clearMedia(); setPhotoEngineFactory(() => fakeEngine()); });
test.afterEach(() => { for (const s of [...getMedia().items]) closePhoto(s.name); clearMedia(); });

test('photos adapter: recipe-only round trip restores settings, history and the dirty marker', async () => {
  const item = await addPhoto('photo.png');
  await openPhoto(item);
  assert.equal(getPhotoSession('photo.png')?.status, 'ready');
  commitPhotoSettings('photo.png', (s) => ({ ...s, contrast: 10 }));

  const adapter = createPhotosLifecycleAdapter();
  assert.equal(await adapter.snapshot!(), null, 'debounced render pending: suspension refused');
  await wait(250);

  const snapshot = await adapter.snapshot!();
  assert.ok(snapshot && verifyPhotosSnapshot(snapshot));
  const payload = snapshot.payload as PhotosSnapshotPayload;
  assert.equal(payload.sessions[0].now.contrast, 10);
  assert.equal(payload.sessions[0].source, item.url);

  await adapter.suspend!();
  assert.equal(getPhotoSession('photo.png'), null);
  assert.equal(adapter.estimateBytes!(), 0);

  await adapter.resume!(snapshot);
  await openPhoto(item);
  const restored = getPhotoSession('photo.png')!;
  assert.equal(restored.status, 'ready', restored.error);
  assert.equal(restored.now.contrast, 10, 'develop settings survived without source bytes');
  assert.equal(restored.past.length, 1, 'undo history survived');
  assert.ok(dirtyPhoto(restored), 'unexported edit still marked dirty');
});

test('a different file under the same name does not inherit the recipe', async () => {
  const item = await addPhoto('photo.png');
  await openPhoto(item);
  commitPhotoSettings('photo.png', (s) => ({ ...s, contrast: 10 }));
  await wait(250);
  const adapter = createPhotosLifecycleAdapter();
  const snapshot = await adapter.snapshot!();
  await adapter.suspend!();
  await adapter.resume!(snapshot!);

  clearMedia();
  const other = await addPhoto('photo.png');
  assert.notEqual(other.url, item.url);
  await openPhoto(other);
  const s = getPhotoSession('photo.png')!;
  assert.equal(s.now.contrast, 0, 'stale recipe dropped');
  assert.equal(s.saved, photoSignature(neutralPhotoSettings));
});

test('pending recipes merge into the next snapshot when the file was not re-opened', async () => {
  const item = await addPhoto('photo.png');
  await openPhoto(item);
  commitPhotoSettings('photo.png', (s) => ({ ...s, exposure: 2 }));
  await wait(250);
  const adapter = createPhotosLifecycleAdapter();
  const first = await adapter.snapshot!();
  await adapter.suspend!();
  await adapter.resume!(first!);
  // Suspend again without re-opening: the recipe must survive in the new checkpoint.
  const second = await adapter.snapshot!();
  const payload = second!.payload as PhotosSnapshotPayload;
  assert.equal(payload.sessions.length, 1);
  assert.equal(payload.sessions[0].now.exposure, 2);
});

test('a resume with a tampered checkpoint is rejected', async () => {
  const adapter = createPhotosLifecycleAdapter();
  const snapshot = await adapter.snapshot!();
  assert.ok(snapshot);
  await assert.rejects(adapter.resume!({ ...snapshot, checksum: '00'.repeat(8) }), /verification/);
});
