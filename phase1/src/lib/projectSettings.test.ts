import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProjectSettings, serializeProjectSettings, effectiveSetting, effectivePrefs, settingSource, withOverride } from './projectSettings';
import { SETTINGS_REGISTRY } from './settingsRegistry';
import { DEFAULT_WORKFLOW_PREFS } from './workflowPrefs';
import { DEFAULT_EDITOR_PREFS } from './editorPrefs';
import { DEFAULT_DOCUMENT_PREFS } from './documentPrefs';

const state = { workflowPrefs: { ...DEFAULT_WORKFLOW_PREFS }, editorPrefs: { ...DEFAULT_EDITOR_PREFS }, documentPrefs: { ...DEFAULT_DOCUMENT_PREFS }, wrapLines: false };
const entry = (id: string) => SETTINGS_REGISTRY.find((e) => e.id === id)!;

test('valid overrides are kept; user-only, unknown and bad values are dropped with warnings', () => {
  const r = parseProjectSettings(JSON.stringify({ version: 1, settings: { 'workflow.units': 'metric', 'workflow.imageSaveMode': 'copy', 'document.keepComments': false, 'editor.lint': false, 'nope.x': 1, 'workflow.units2': 1 } }));
  assert.deepEqual({ ...r.overrides }, { 'workflow.units': 'metric', 'workflow.imageSaveMode': 'copy', 'document.keepComments': false });
  assert.equal(r.warnings.length, 3);
  assert.ok(r.warnings.some((w) => w.includes('editor.lint') && w.includes('user-only')));
  const bad = parseProjectSettings(JSON.stringify({ settings: { 'workflow.units': 'furlong', 'workflow.imageSaveMode': 'delete' } }));
  assert.deepEqual({ ...bad.overrides }, {}); assert.equal(bad.warnings.length, 2);
});
test('garbage input never throws and never overrides', () => {
  for (const t of ['', '   ', 'not json', '[]', '"x"', 'null', '{"settings":[]}', '{"__proto__":{"x":1}}', 'x'.repeat(70_000)]) assert.deepEqual({ ...parseProjectSettings(t).overrides }, {});
});
test('effective value, source and effective prefs', () => {
  const o = parseProjectSettings('{"settings":{"workflow.units":"imperial"}}').overrides;
  assert.equal(effectiveSetting(state, entry('workflow.units'), o), 'imperial');
  assert.equal(effectiveSetting(state, entry('workflow.imageSaveMode'), o), 'overwrite');
  assert.equal(settingSource(state, entry('workflow.units'), o), 'project');
  assert.equal(settingSource({ ...state, workflowPrefs: { ...state.workflowPrefs, confirmDelete: true } }, entry('workflow.confirmDelete'), o), 'user');
  assert.equal(effectivePrefs(state, o).workflowPrefs.units, 'imperial');
  assert.equal(state.workflowPrefs.units, 'auto');
});
test('withOverride sets, inherits, and rejects non-overridable ids; serialize roundtrips', () => {
  let o = withOverride({}, 'workflow.imageSaveMode', 'copy');
  assert.throws(() => withOverride(o, 'editor.lint', false));
  assert.throws(() => withOverride(o, 'workflow.units', 'x'));
  o = withOverride(o, 'workflow.units', 'metric');
  assert.deepEqual({ ...parseProjectSettings(serializeProjectSettings(o)).overrides }, { ...o });
  assert.deepEqual({ ...withOverride(o, 'workflow.units', null, true) }, { 'workflow.imageSaveMode': 'copy' });
});
