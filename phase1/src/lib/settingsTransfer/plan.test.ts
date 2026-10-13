import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSetup, type Setup } from './format';
import { planImport, targetRevision } from './plan';
import { TRANSFER_CATEGORIES } from './classify';
import { baseState } from './format.test';

const CMDS = ['a.one', 'b.two', 'c.three'];
const setupOf = (settings: object, shortcuts: object = {}): Setup => {
  const r = parseSetup(JSON.stringify({ app: 'somnia', kind: 'setup', schemaVersion: 1, scope: 'user', categories: {
    settings: { mode: 'overrides', values: settings }, keybindings: { common: shortcuts, platforms: {} } } }), CMDS);
  assert.ok(r.ok); return (r as any).setup;
};
const st = (fn?: (s: any) => void) => { const s: any = baseState(); fn?.(s); return s; };

test('merge: statuses add / change / same; absent values are untouched', () => {
  const target = { state: st((s) => { s.editorPrefs.lint = false; s.workflowPrefs.units = 'metric'; s.wrapLines = true; }), shortcuts: {} };
  const p = planImport(setupOf({ 'editor.lint': false, 'workflow.units': 'imperial', 'document.font': 'serif' }), target, { mode: 'merge', categories: TRANSFER_CATEGORIES });
  const by = Object.fromEntries(p.rows.map((r) => [r.id, r.status]));
  assert.deepEqual(by, { 'workflow.units': 'change', 'editor.lint': 'same', 'document.font': 'add' });
  assert.equal(p.resetCount, 0);
  assert.ok(!p.rows.some((r) => r.id === 'editor.wrapLines'), 'merge never touches values absent from the file');
});
test('unselected categories produce no rows', () => {
  const p = planImport(setupOf({ 'editor.lint': false, 'workflow.units': 'metric' }), { state: st(), shortcuts: {} }, { mode: 'merge', categories: ['editor'] });
  assert.deepEqual(p.rows.map((r) => r.id), ['editor.lint']);
});
test('replace: resets only omitted, modified values inside selected categories', () => {
  const target = { state: st((s) => { s.editorPrefs.lint = false; s.editorPrefs.emmet = !s.editorPrefs.emmet; s.workflowPrefs.units = 'metric'; s.previewScripts = !s.previewScripts; }), shortcuts: { 'a.one': 'Mod+1' } };
  const p = planImport(setupOf({ 'editor.lint': false }), target, { mode: 'replace', categories: ['editor', 'keybindings'] });
  const by = Object.fromEntries(p.rows.map((r) => [r.key, r.status]));
  assert.deepEqual(by, { 'setting:editor.emmet': 'reset', 'setting:editor.lint': 'same', 'shortcut:a.one': 'reset' });
  assert.equal(p.resetCount, 2);
  assert.ok(!p.rows.some((r) => r.id === 'workflow.units' || r.id === 'previewScripts'), 'deselected category and excluded setting stay untouched');
});
test('shortcuts: explicit unbind differs from omission; unbind of a missing key is an add', () => {
  const p = planImport(setupOf({}, { 'a.one': '', 'b.two': 'Mod+2' }), { state: st(), shortcuts: { 'a.one': 'Mod+1' } }, { mode: 'merge', categories: TRANSFER_CATEGORIES });
  assert.deepEqual(p.rows.map((r) => [r.id, r.status, r.proposed]), [['a.one', 'change', ''], ['b.two', 'add', 'Mod+2']]);
});
test('shortcut collisions with existing bindings and within the file are conflicts', () => {
  const target = { state: st(), shortcuts: { 'c.three': 'Mod+K' } };
  const p = planImport(setupOf({}, { 'a.one': 'Mod+k', 'b.two': 'Mod+9' }), target, { mode: 'merge', categories: TRANSFER_CATEGORIES });
  const a = p.rows.find((r) => r.id === 'a.one')!;
  assert.equal(a.status, 'conflict'); assert.deepEqual(a.conflictsWith, ['c.three']);
  assert.equal(p.rows.find((r) => r.id === 'b.two')!.status, 'add');
  const q = planImport(setupOf({}, { 'a.one': 'Mod+5', 'b.two': 'Mod+5' }), { state: st(), shortcuts: {} }, { mode: 'merge', categories: TRANSFER_CATEGORIES });
  assert.deepEqual(q.rows.map((r) => r.status), ['conflict', 'conflict']);
});
test('a key moving between commands inside the file is not a conflict with the old holder', () => {
  const p = planImport(setupOf({}, { 'a.one': 'Mod+K', 'c.three': 'Mod+L' }), { state: st(), shortcuts: { 'c.three': 'Mod+K' } }, { mode: 'merge', categories: TRANSFER_CATEGORIES });
  assert.deepEqual(p.rows.map((r) => r.status), ['add', 'change']);
});
test('plan carries a revision that changes with target state', () => {
  const t1 = { state: st(), shortcuts: {} }, t2 = { state: st((s) => { s.editorPrefs.lint = !s.editorPrefs.lint; }), shortcuts: {} };
  assert.notEqual(targetRevision(t1), targetRevision(t2));
  assert.equal(targetRevision(t1), targetRevision({ state: st(), shortcuts: {} }));
  assert.notEqual(targetRevision(t1), targetRevision({ state: st(), shortcuts: { 'a.one': 'Mod+1' } }));
});
