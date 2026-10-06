import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorProject } from './index.js';
import { SaveCoordinator } from './persistence.js';

function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const project = () => new EditorProject({ 'plain.txt': 'before' });
const edit = (p: EditorProject, text: string) => p.transact({ origin: 'code', operations: [{ type: 'replaceSource', file: 'plain.txt', text }] });

test('overlapping flushes serialize writes and drain the latest revision', async t => {
  const p = project(), first = deferred(), second = deferred(), secondStarted = deferred();
  const writes: { files: Readonly<Record<string, string>>; revision: number }[] = [];
  let active = 0, maxActive = 0;
  const save = new SaveCoordinator(p, { async write(files, revision) {
    writes.push({ files, revision }); active++; maxActive = Math.max(maxActive, active);
    if (writes.length === 1) await first.promise;
    else { secondStarted.resolve(); await second.promise; }
    active--;
  } }, 10000);
  t.after(() => save.dispose());
  const a = save.flush(); edit(p, 'after'); const b = save.flush(), c = save.flush();
  assert.deepEqual(writes, [{ files: { 'plain.txt': 'before' }, revision: 0 }]);
  first.resolve(); await secondStarted.promise;
  assert.equal(save.status.state, 'saving');
  assert.deepEqual(writes[1], { files: { 'plain.txt': 'after' }, revision: 1 });
  second.resolve(); await Promise.all([a, b, c]);
  assert.equal(maxActive, 1); assert.equal(writes.length, 2);
  assert.deepEqual(save.status, { state: 'saved', revision: 1, message: 'Saved to disk' });
  await save.flush(); assert.equal(writes.length, 2, 'clean flush must not rewrite files');
});

test('concurrent failed flushes reject together and a later retry writes current files', async t => {
  const p = project(), blocked = deferred(); let calls = 0;
  const save = new SaveCoordinator(p, { async write(files, revision) {
    calls++; if (calls === 1) await blocked.promise;
    else { assert.deepEqual(files, { 'plain.txt': 'edited' }); assert.equal(revision, 1); }
  } }, 10000);
  t.after(() => save.dispose());
  const a = save.flush(), b = save.flush();
  const failed = Promise.all([assert.rejects(a, /disk full/), assert.rejects(b, /disk full/)]);
  edit(p, 'edited'); blocked.reject(Error('disk full')); await failed;
  assert.equal(calls, 1); assert.equal(save.status.state, 'error');
  await save.flush(); assert.equal(calls, 2); assert.equal(save.status.state, 'saved');
});

test('save subscriptions publish defensive status copies and unsubscribe cleanly', async t => {
  const save = new SaveCoordinator(project(), { write: async () => {} }, 10000);
  t.after(() => save.dispose());
  const states: string[] = [];
  const off = save.subscribe(status => { states.push(status.state); status.state = 'error'; status.revision = 999; });
  assert.equal(save.status.state, 'dirty'); await save.flush();
  assert.deepEqual(states, ['dirty', 'saving', 'saved']); assert.equal(save.status.revision, 0);
  const copy = save.status; copy.message = 'mutated'; assert.equal(save.status.message, 'Saved to disk');
  off(); await save.cacheRecovery(); assert.equal(states.length, 3);
});

test('debounced edits schedule one write of the latest snapshot', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = project(); const writes: Readonly<Record<string, string>>[] = [];
  const save = new SaveCoordinator(p, { write: async files => { writes.push(files); } }, 700);
  t.after(() => save.dispose());
  edit(p, 'a'); t.mock.timers.tick(600); edit(p, 'ab');
  t.mock.timers.tick(699); assert.equal(writes.length, 0);
  t.mock.timers.tick(1); await save.flush();
  assert.deepEqual(writes, [{ 'plain.txt': 'ab' }]); assert.equal(save.status.state, 'saved');
});

test('dispose cancels scheduled saves and detaches editor observation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = project(); let writes = 0;
  const save = new SaveCoordinator(p, { write: async () => { writes++; } }, 700);
  edit(p, 'a'); const before = save.status; save.dispose();
  t.mock.timers.tick(700); edit(p, 'b'); t.mock.timers.tick(700);
  assert.equal(writes, 0); assert.deepEqual(save.status, before);
  await assert.rejects(save.flush(), /closed/);
});

test('recovery receives a detached current snapshot and does not count as a disk save', async t => {
  const p = project(); edit(p, 'current'); let writes = 0;
  const save = new SaveCoordinator(p, {
    write: async () => { writes++; },
    recover: async state => { assert.equal(state.revision, 1); assert.deepEqual(state.snapshot.files, { 'plain.txt': 'current' }); state.snapshot.files['plain.txt'] = 'mutated'; },
  }, 10000);
  t.after(() => save.dispose());
  await save.cacheRecovery(); assert.equal(writes, 0);
  assert.equal(save.status.state, 'dirty'); assert.equal(p.files['plain.txt'], 'current');
});
