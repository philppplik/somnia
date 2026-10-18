import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSnapshots, latestSnapshot, readSnapshots, removeSnapshot, saveSnapshot, settingsPatch, SNAPSHOT_KEY, type KV } from './host';
import { takeSnapshot } from './apply';
import { baseState } from './format.test';

const store = (opts: { failWrite?: boolean; dropWrite?: boolean } = {}): KV & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { if (opts.failWrite) throw new Error('quota'); if (!opts.dropWrite) m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
};
const snap = (n: number) => takeSnapshot({ state: baseState(), shortcuts: { 'a.one': 'Mod+1' } }, n);

test('settingsPatch changes only the given fields and keeps siblings', () => {
  const s: any = baseState(); s.editorPrefs.lint = true;
  const p: any = settingsPatch(s, { 'editor.lint': false, 'editor.emmet': false, 'editor.wrapLines': true, 'workflow.units': 'metric', 'bogus.id': 1 });
  assert.equal(p.editorPrefs.lint, false); assert.equal(p.editorPrefs.emmet, false);
  assert.equal(p.editorPrefs.closeTags, s.editorPrefs.closeTags);
  assert.equal(p.wrapLines, true); assert.equal(p.workflowPrefs.units, 'metric');
  assert.equal(p.documentPrefs, undefined); assert.ok(!('bogus' in p));
});
test('restore points are stored newest first, pruned to 10, removable and clearable', () => {
  const kv = store();
  for (let i = 1; i <= 12; i++) saveSnapshot(kv, snap(i));
  assert.equal(readSnapshots(kv).length, 10); assert.equal(latestSnapshot(kv)!.createdAt, 12);
  removeSnapshot(kv, 12); assert.equal(latestSnapshot(kv)!.createdAt, 11);
  clearSnapshots(kv); assert.equal(kv.getItem(SNAPSHOT_KEY), null);
});
test('a restore point that cannot be stored throws (apply must stop)', () => {
  assert.throws(() => saveSnapshot(store({ failWrite: true }), snap(1)));
  assert.throws(() => saveSnapshot(store({ dropWrite: true }), snap(1)), /not stored/);
});
test('corrupt storage reads as empty', () => {
  const kv = store(); kv.setItem(SNAPSHOT_KEY, '{bad'); assert.deepEqual(readSnapshots(kv), []);
  kv.setItem(SNAPSHOT_KEY, JSON.stringify([{ nope: 1 }])); assert.deepEqual(readSnapshots(kv), []);
});
