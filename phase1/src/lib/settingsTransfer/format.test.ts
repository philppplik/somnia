import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSetup, parseSetup } from './format';
import { SETTINGS_REGISTRY } from '../settingsRegistry';
import { exportSettings } from '../settingsExport';
import { DEFAULT_WORKFLOW_PREFS } from '../workflowPrefs';
import { DEFAULT_EDITOR_PREFS } from '../editorPrefs';
import { DEFAULT_DOCUMENT_PREFS } from '../documentPrefs';
import { TRANSFER_CATEGORIES } from './classify';

export const baseState = () => ({
  workflowPrefs: { ...DEFAULT_WORKFLOW_PREFS }, editorPrefs: { ...DEFAULT_EDITOR_PREFS }, documentPrefs: { ...DEFAULT_DOCUMENT_PREFS },
  wrapLines: false, previewScripts: SETTINGS_REGISTRY.find((e) => e.id === 'previewScripts')!.default,
});
const CMDS = ['edit.save', 'edit.off', 'view.zoom'];

test('export holds only overrides of selected categories, sorted, with trailing newline', () => {
  const s: any = baseState(); s.workflowPrefs.units = 'metric'; s.editorPrefs.lint = !s.editorPrefs.lint; s.wrapLines = true;
  const all = buildSetup({ state: s, shortcuts: { 'edit.save': 'Mod+S' }, categories: TRANSFER_CATEGORIES, label: 'Writing' });
  assert.ok(all.endsWith('}\n'));
  const j = JSON.parse(all);
  assert.deepEqual(Object.keys(j.categories.settings.values), ['editor.lint', 'editor.wrapLines', 'workflow.units']);
  assert.equal(j.label, 'Writing'); assert.equal(j.schemaVersion, 1); assert.equal(j.scope, 'user');
  const only = JSON.parse(buildSetup({ state: s, shortcuts: { 'edit.save': 'Mod+S' }, categories: ['editor'] }));
  assert.deepEqual(Object.keys(only.categories.settings.values), ['editor.lint', 'editor.wrapLines']);
  assert.equal(only.categories.keybindings, undefined);
});
test('export is deterministic and round trips through the parser', () => {
  const s: any = baseState(); s.workflowPrefs.units = 'imperial'; s.documentPrefs.font = 'serif';
  const a = buildSetup({ state: s, shortcuts: { 'edit.save': 'Mod+S', 'edit.off': '' }, categories: TRANSFER_CATEGORIES });
  assert.equal(a, buildSetup({ state: s, shortcuts: { 'edit.off': '', 'edit.save': 'Mod+S' }, categories: TRANSFER_CATEGORIES }));
  const r = parseSetup(a, CMDS); assert.ok(r.ok && r.skipped.length === 0);
  if (r.ok) { assert.equal(r.setup.settings['workflow.units'], 'imperial'); assert.equal(r.setup.shortcuts['edit.off'], ''); assert.deepEqual(r.setup.categories, ['general', 'typography', 'keybindings']); }
});
test('preview-script switch is never exported, even when modified', () => {
  const s: any = baseState(); s.previewScripts = !s.previewScripts;
  assert.ok(!buildSetup({ state: s, shortcuts: {}, categories: TRANSFER_CATEGORIES }).includes('previewScripts'));
});
test('a file that names the preview-script switch skips it without applying', () => {
  const r = parseSetup(JSON.stringify({ app: 'somnia', kind: 'setup', schemaVersion: 1, scope: 'user', categories: { settings: { mode: 'overrides', values: { previewScripts: true, 'editor.lint': false } } } }), CMDS);
  assert.ok(r.ok); if (r.ok) { assert.deepEqual(Object.keys(r.setup.settings), ['editor.lint']); assert.deepEqual(r.skipped, [{ kind: 'setting', reason: 'not-transferable' }]); }
});
test('unknown settings, bad values and unknown commands are skipped visibly, without echoing values', () => {
  const r = parseSetup(JSON.stringify({ app: 'somnia', kind: 'setup', schemaVersion: 1, scope: 'user', categories: {
    settings: { mode: 'overrides', values: { 'nope.x': 1, 'workflow.units': 'parsecs', 'workflow.draftSeconds': 99999 } },
    keybindings: { common: { 'ghost.cmd': 'Mod+X', 'edit.save': 'Mod+<script>' }, platforms: {} }, extras: {} } }), CMDS);
  assert.ok(r.ok); if (r.ok) {
    assert.equal(Object.keys(r.setup.settings).length, 0); assert.equal(Object.keys(r.setup.shortcuts).length, 0);
    assert.equal(r.skipped.length, 6); assert.ok(!JSON.stringify(r.skipped).includes('parsecs'));
  }
});
test('blocked: malformed, wrong app, newer schema, project scope, bad envelope', () => {
  const env = (o: object) => JSON.stringify({ app: 'somnia', kind: 'setup', schemaVersion: 1, scope: 'user', categories: {}, ...o });
  const code = (t: string) => { const r = parseSetup(t, CMDS); return r.ok ? 'ok' : r.code; };
  assert.equal(code(''), 'empty'); assert.equal(code('{'), 'malformed'); assert.equal(code('[]'), 'not-somnia');
  assert.equal(code(env({ app: 'other' })), 'not-somnia'); assert.equal(code(env({ schemaVersion: 2 })), 'unsupported-newer');
  assert.equal(code(env({ schemaVersion: '1' })), 'invalid'); assert.equal(code(env({ schemaVersion: 0 })), 'invalid');
  assert.equal(code(env({ scope: 'project' })), 'unsupported-scope'); assert.equal(code(env({ categories: [] })), 'invalid');
  assert.equal(code(env({ categories: { settings: { mode: 'snapshot', values: {} } } })), 'invalid');
  assert.equal(code('{"app":"somnia","kind":"setup","schemaVersion":1,"scope":"user","scope":"user","categories":{}}'), 'malformed');
  assert.equal(code('{"app":"somnia","kind":"setup","__proto__":{}}'), 'malformed');
});
test('labels are bounded and stripped of control and bidi characters', () => {
  const r = parseSetup(JSON.stringify({ app: 'somnia', kind: 'setup', schemaVersion: 1, scope: 'user', label: 'a\u202eb\nc' + 'x'.repeat(200), categories: {} }), CMDS);
  assert.ok(r.ok); if (r.ok) { assert.ok(r.setup.label.length <= 80); assert.ok(!/[\u202e\n]/.test(r.setup.label)); }
});
test('legacy settings-v1 file is read as overrides', () => {
  const s: any = baseState(); s.editorPrefs.emmet = !s.editorPrefs.emmet;
  const r = parseSetup(exportSettings(s), CMDS); assert.ok(r.ok);
  if (r.ok) { assert.equal(r.setup.legacy, 'settings-v1'); assert.deepEqual(Object.keys(r.setup.settings), ['editor.emmet']); }
});
test('legacy shortcut object and sync-v1 are read; unknown legacy version is blocked', () => {
  const a = parseSetup('{"edit.save":"Mod+S","ghost":"Mod+G"}', CMDS); assert.ok(a.ok);
  if (a.ok) { assert.equal(a.setup.legacy, 'shortcuts'); assert.deepEqual(Object.keys(a.setup.shortcuts), ['edit.save']); assert.equal(a.skipped.length, 1); }
  const b = parseSetup('{"app":"somnia","kind":"sync","version":1,"updatedAt":1,"settings":{"editor.lint":false},"shortcuts":{"edit.save":"Mod+S"}}', CMDS); assert.ok(b.ok);
  if (b.ok) assert.equal(b.setup.legacy, 'sync-v1');
  const c = parseSetup('{"app":"somnia","kind":"settings","version":9,"settings":{}}', CMDS); assert.equal(c.ok, false);
  const d = parseSetup('{"app":"somnia","kind":"sync","version":2,"settings":{},"shortcuts":{}}', CMDS); assert.equal(d.ok, false);
});
