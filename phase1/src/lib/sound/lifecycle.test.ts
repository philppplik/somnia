import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  closeSound,
  createSoundLifecycleAdapter,
  getSoundSession,
  openSound,
  setSoundEngineFactory,
  setSoundSelection,
  updateSoundSettings,
} from './session';
import { verifySoundSnapshot, type SoundSnapshotPayload } from './lifecycleSnapshot';
import { DEFAULT_SETTINGS, isNeutral } from './recipe';
import type { SoundEngineLike } from './engine';
import type { SoundRecipe, SoundReport, SoundStats } from './protocol';
import { addMediaFile, clearMedia, getMedia } from '../media';

const MP3 = new URL('../../../sound/tests/fixtures/arpeggio.mp3', import.meta.url);
const bytes = () => new Uint8Array(readFileSync(MP3));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STATS: SoundStats = { frames: 100, sample_rate: 44100, channels: 2, duration_s: 3.5, peak_db: -1, rms_db: -12 };
const REPORT: SoundReport = { format: 'wav', input: STATS, output: STATS, trimmed_range: null, steps: [], wav_bytes: 4 };

function fakeEngine(): SoundEngineLike & { calls: SoundRecipe[]; disposed: number } {
  const e = {
    calls: [] as SoundRecipe[],
    disposed: 0,
    async init() { return []; },
    async process(_buf: ArrayBuffer, _ext: string, recipe: SoundRecipe) {
      e.calls.push(recipe);
      return { wav: new Uint8Array([1, 2, 3, 4]).buffer as ArrayBuffer, peaks: new Float32Array(8), report: REPORT, ms: 1 };
    },
    dispose() { e.disposed++; },
  };
  return e as unknown as SoundEngineLike & { calls: SoundRecipe[]; disposed: number };
}

let engine: ReturnType<typeof fakeEngine>;
const addSong = async (name: string) => {
  const added = await addMediaFile(new Blob([bytes()], { type: 'audio/mpeg' }), name);
  assert.ok('name' in added);
  const item = getMedia().items.find((i) => i.name === added.name)!;
  return { name: item.name, url: item.url };
};

test.beforeEach(() => { clearMedia(); engine = fakeEngine(); setSoundEngineFactory(() => engine); });
test.afterEach(() => { for (const s of [...getMedia().items]) closeSound(s.name); clearMedia(); });

test('sound adapter: recipe-only round trip restores settings, selection and listen', async () => {
  const item = await addSong('song.mp3');
  await openSound(item);
  assert.equal(getSoundSession('song.mp3')?.status, 'ready');
  updateSoundSettings('song.mp3', (s) => ({ ...s, reverse: true }));

  const adapter = createSoundLifecycleAdapter();
  assert.equal(await adapter.snapshot!(), null, 'debounced render pending: suspension refused');
  await wait(300);
  assert.equal(getSoundSession('song.mp3')?.status, 'ready');
  setSoundSelection('song.mp3', { start: 1, end: 2 });

  const snapshot = await adapter.snapshot!();
  assert.ok(snapshot && verifySoundSnapshot(snapshot));
  const payload = snapshot.payload as SoundSnapshotPayload;
  assert.equal(payload.sessions[0].settings.reverse, true);
  assert.deepEqual(payload.sessions[0].selection, { start: 1, end: 2 });
  assert.equal(payload.sessions[0].source, item.url);

  const before = engine.disposed;
  await adapter.suspend!();
  assert.equal(getSoundSession('song.mp3'), null);
  assert.equal(engine.disposed, before + 1, 'suspend disposes the DSP engine');
  assert.equal(adapter.estimateBytes!(), 0);

  await adapter.resume!(snapshot);
  await openSound(item);
  const restored = getSoundSession('song.mp3')!;
  assert.equal(restored.status, 'ready', restored.error);
  assert.equal(restored.settings.reverse, true, 'recipe survived without source bytes');
  assert.deepEqual(restored.selection, { start: 1, end: 2 });
  assert.ok(!isNeutral(restored.settings));
  await wait(300); // the non-neutral recipe re-renders the processed version
  assert.ok(restored.processed, 'processed render rebuilt by the engine');
});

test('a different file under the same name does not inherit the recipe', async () => {
  const item = await addSong('song.mp3');
  await openSound(item);
  updateSoundSettings('song.mp3', (s) => ({ ...s, reverse: true }));
  await wait(300);
  const adapter = createSoundLifecycleAdapter();
  const snapshot = await adapter.snapshot!();
  await adapter.suspend!();
  await adapter.resume!(snapshot!);

  clearMedia();
  const other = await addSong('song.mp3');
  assert.notEqual(other.url, item.url);
  await openSound(other);
  const s = getSoundSession('song.mp3')!;
  assert.equal(s.settings.reverse, false, 'stale recipe dropped');
  assert.ok(isNeutral(s.settings));
  assert.deepEqual(s.settings, DEFAULT_SETTINGS);
});

test('a resume with a tampered checkpoint is rejected', async () => {
  const adapter = createSoundLifecycleAdapter();
  const snapshot = await adapter.snapshot!();
  assert.ok(snapshot);
  await assert.rejects(adapter.resume!({ ...snapshot, checksum: '00'.repeat(8) }), /verification/);
});
