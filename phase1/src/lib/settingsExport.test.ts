import test from 'node:test';
import assert from 'node:assert/strict';
import { exportSettings, parseSettingsImport, importPatch, validSettingValue } from './settingsExport';
import { modifiedSettings, SETTINGS_REGISTRY } from './settingsRegistry';
import { DEFAULT_WORKFLOW_PREFS } from './workflowPrefs';
import { DEFAULT_EDITOR_PREFS } from './editorPrefs';
import { DEFAULT_DOCUMENT_PREFS } from './documentPrefs';

const base = () => ({ workflowPrefs: { ...DEFAULT_WORKFLOW_PREFS }, editorPrefs: { ...DEFAULT_EDITOR_PREFS }, documentPrefs: { ...DEFAULT_DOCUMENT_PREFS }, wrapLines: false });
test('export holds only changes and roundtrips through import', () => {
  const s = { ...base(), workflowPrefs: { ...DEFAULT_WORKFLOW_PREFS, units: 'imperial', draftSeconds: 10 }, wrapLines: true };
  const text = exportSettings(s);
  assert.deepEqual(Object.keys(JSON.parse(text).settings).sort(), ['editor.wrapLines', 'workflow.draftSeconds', 'workflow.units']);
  const r = parseSettingsImport(text);
  assert.deepEqual(r.warnings, []);
  const next = { ...base(), ...importPatch(base(), r.accepted) } as any;
  assert.equal(next.workflowPrefs.units, 'imperial'); assert.equal(next.wrapLines, true); assert.equal(next.workflowPrefs.draftSeconds, 10);
  assert.equal(modifiedSettings(next).length, 3);
});
test('import resets what the file does not mention, skips unknown and invalid values', () => {
  const s = { ...base(), workflowPrefs: { ...DEFAULT_WORKFLOW_PREFS, confirmDelete: true } };
  const r = parseSettingsImport(JSON.stringify({ kind: 'settings', settings: { 'workflow.units': 'metric', 'workflow.draftSeconds': 9999, 'x.y': 1, 'editor.lint': 'no' } }));
  assert.equal(r.warnings.length, 3);
  const n = { ...s, ...importPatch(s, r.accepted) } as any;
  assert.equal(n.workflowPrefs.units, 'metric'); assert.equal(n.workflowPrefs.confirmDelete, false);
});
test('bad files are refused without throwing', () => {
  for (const t of ['', 'nope', '[]', '{"kind":"other"}', '{"kind":"settings","settings":[]}']) assert.deepEqual({ ...parseSettingsImport(t).accepted }, {});
  assert.equal(parseSettingsImport('nope').warnings.length, 1);
});
test('every registry default is a valid value', () => { for (const e of SETTINGS_REGISTRY) assert.ok(validSettingValue(e, e.default), e.id); });
