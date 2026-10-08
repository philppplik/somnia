import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeVariantsBackend, conflict, fakeStatus, variant } from './fakeVariantsBackend';
import {
  abortCombine, allDecided, buildResolutions, deleteVariant, editResult, errorKey, finishCombine, hasConflictMarkers, initDrafts,
  openVariant, pickSide, previewCombine, startCombine, undecidedCount, useBoth, type VariantGuards, type VariantsDeps,
} from './variantsFlow';
import type { GitCombineSession } from './types';

const calm: VariantGuards = { unsavedBuffers: () => [], activeReviews: () => [] };
const mk = (fake: FakeVariantsBackend, guards = calm, changes = 0): VariantsDeps => ({ git: fakeStatus(changes), variants: fake, guards });
const session = (conflicts = [conflict('index.html')]): GitCombineSession => ({ name: 'other', yoursTip: 'a', theirsTip: 'b', fastForwarded: false, merging: true, conflicts, safetyCopy: null, version: null, proposedMessage: 'Combined variant other into main' });

test('open is blocked by unsaved buffers and by running reviews, and never reaches the backend', async () => {
  const fake = new FakeVariantsBackend([variant('main', { current: true }), variant('b')]);
  const r = await openVariant(mk(fake, { unsavedBuffers: () => ['index.html'], activeReviews: () => ['AI review'] }), 'b');
  assert.equal(r.kind, 'guard');
  if (r.kind === 'guard') { assert.deepEqual(r.unsaved, ['index.html']); assert.deepEqual(r.reviews, ['AI review']); }
  assert.deepEqual(fake.calls, []);
});
test('open with unsaved files on disk asks to save a version first', async () => {
  const fake = new FakeVariantsBackend();
  const r = await openVariant(mk(fake, calm, 3), 'b');
  assert.deepEqual(r, { kind: 'dirty', changes: 3 });
  assert.deepEqual(fake.calls, []);
});
test('open passes the reviewed state token', async () => {
  const fake = new FakeVariantsBackend([variant('main', { current: true }), variant('b')]);
  const r = await openVariant(mk(fake), 'b');
  assert.equal(r.kind, 'opened');
  assert.equal(fake.variants.find(v => v.name === 'b')!.current, true);
});
test('deleting an unmerged variant needs an explicit second step', async () => {
  const v = variant('work', { merged: false, ahead: 2 });
  const fake = new FakeVariantsBackend([variant('main', { current: true }), v]);
  const first = await deleteVariant(mk(fake), v, false);
  assert.deepEqual(first, { kind: 'needs-confirm', ahead: 2 });
  assert.deepEqual(fake.calls, []);
  const second = await deleteVariant(mk(fake), v, true);
  assert.equal(second.kind, 'deleted');
  if (second.kind === 'deleted') assert.ok(second.result.backupRef);
});
test('the open variant cannot be deleted', async () => {
  const cur = variant('main', { current: true });
  const r = await deleteVariant(mk(new FakeVariantsBackend([cur])), cur, true);
  assert.equal(r.kind, 'error');
});
test('backend errors come back as tagged errors with a translation key', async () => {
  const fake = new FakeVariantsBackend();
  const r = await (await import('./variantsFlow')).startVariant(mk(fake), 'main', false);
  assert.equal(r.kind, 'error');
  if (r.kind === 'error') assert.equal(errorKey(r.error), 'variants.err.exists');
  assert.equal(errorKey({ code: 'state-changed', message: '' }), 'variants.err.stateChanged');
});
test('start combine is guarded and uses the previewed tip', async () => {
  const fake = new FakeVariantsBackend();
  fake.startResult = session();
  const p = await previewCombine(mk(fake), 'other');
  assert.equal(p.kind, 'preview');
  if (p.kind !== 'preview') return;
  const blocked = await startCombine(mk(fake, { unsavedBuffers: () => ['a.css'], activeReviews: () => [] }), p.preview);
  assert.equal(blocked.kind, 'guard');
  assert.ok(!fake.calls.includes('start'));
  const ok = await startCombine(mk(fake), p.preview);
  assert.equal(ok.kind, 'conflicts');
});
test('a text conflict starts undecided and with markers; nothing is resolved silently', () => {
  const ds = initDrafts([conflict('a.html'), conflict('b.html')]);
  assert.equal(undecidedCount(ds), 2);
  assert.ok(hasConflictMarkers(ds[0].result));
  assert.equal(allDecided(ds), false);
  assert.deepEqual(buildResolutions(ds), []);
});
test('choosing a side, editing the result and using both decide a file explicitly', () => {
  const [d] = initDrafts([conflict('a.html')]);
  const y = pickSide(d, 'yours');
  assert.equal(y.choice, 'yours'); assert.equal(y.result, 'a\nYOURS\n');
  const t = pickSide(d, 'theirs');
  assert.deepEqual(buildResolutions([t]), [{ path: 'a.html', choice: 'theirs' }]);
  const edited = editResult(d, 'merged text\n');
  assert.deepEqual(buildResolutions([edited]), [{ path: 'a.html', choice: 'content', content: 'merged text\n' }]);
  const stillMarked = editResult(d, '<<<<<<< x\n');
  assert.equal(stillMarked.choice, null);
  const both = useBoth(d);
  assert.equal(both.choice, 'content'); assert.equal(both.result, 'a\nYOURS\na\nTHEIRS\n');
});
test('binary and too-large files only take a whole side', () => {
  const bin = conflict('logo.png', { binary: true, yours: null, theirs: null, working: null });
  const [d] = initDrafts([bin]);
  assert.equal(editResult(d, 'x'), d);
  assert.equal(useBoth(d), d);
  assert.equal(d.choice, null);
  assert.equal(pickSide(d, 'theirs').choice, 'theirs');
  const [big] = initDrafts([conflict('big.txt', { tooLarge: true })]);
  assert.equal(editResult(big, 'x'), big);
});
test('finish refuses while any file is undecided, then resolves and commits', async () => {
  const fake = new FakeVariantsBackend();
  const s = session([conflict('a.html'), conflict('b.html')]);
  fake.session = s;
  let ds = initDrafts(s.conflicts);
  ds[0] = pickSide(ds[0], 'yours');
  const early = await finishCombine(mk(fake), s, ds);
  assert.deepEqual(early, { kind: 'incomplete', undecided: ['b.html'] });
  assert.ok(!fake.calls.includes('resolve') && !fake.calls.includes('finish'));
  ds[1] = editResult(ds[1], 'b merged\n');
  const done = await finishCombine(mk(fake), s, ds, '  Take both  ');
  assert.equal(done.kind, 'finished');
  assert.equal(fake.finished?.subject, 'Take both');
  assert.deepEqual(fake.resolved.map(r => r.choice), ['yours', 'content']);
});
test('abort is guarded like every action that touches files', async () => {
  const fake = new FakeVariantsBackend();
  assert.equal((await abortCombine(mk(fake, { unsavedBuffers: () => ['x'], activeReviews: () => [] }))).kind, 'guard');
  assert.equal((await abortCombine(mk(fake))).kind, 'aborted');
});
