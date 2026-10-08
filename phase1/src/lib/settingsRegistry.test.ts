import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SETTINGS_REGISTRY, getSetting, isModified, modifiedSettings, modifiedCountBySection, resetPatch, searchRegistry, projectOverridable } from './settingsRegistry';
import { DEFAULT_WORKFLOW_PREFS } from './workflowPrefs';
import { DEFAULT_EDITOR_PREFS } from './editorPrefs';
import { DEFAULT_DOCUMENT_PREFS } from './documentPrefs';

const en = JSON.parse(readFileSync(new URL('../locales/en.json', import.meta.url), 'utf8'));
const base = () => ({ workflowPrefs: { ...DEFAULT_WORKFLOW_PREFS }, editorPrefs: { ...DEFAULT_EDITOR_PREFS }, documentPrefs: { ...DEFAULT_DOCUMENT_PREFS }, wrapLines: false });

test('ids are unique, label keys exist in en.json, fields exist in the real defaults', () => {
  const ids = new Set<string>();
  for (const e of SETTINGS_REGISTRY) {
    assert.ok(!ids.has(e.id), e.id); ids.add(e.id);
    assert.ok(typeof en[e.labelKey] === 'string', `missing label ${e.labelKey}`);
    assert.equal(isModified(base(), e), false, `${e.id} default must equal the app default`);
    assert.notEqual(getSetting(base(), e), undefined, e.id);
  }
});
test('modified detection, counts and reset keep other fields', () => {
  const s = { ...base(), workflowPrefs: { ...DEFAULT_WORKFLOW_PREFS, units: 'imperial', confirmDelete: true }, wrapLines: true };
  const m = modifiedSettings(s).map((e) => e.id).sort();
  assert.deepEqual(m, ['editor.wrapLines', 'workflow.confirmDelete', 'workflow.units']);
  assert.deepEqual(modifiedCountBySection(s), { 'Code editor': 1, General: 1, Editing: 1 });
  const one = resetPatch(s, SETTINGS_REGISTRY.filter((e) => e.id === 'workflow.units'));
  assert.equal((one.workflowPrefs as any).units, 'auto'); assert.equal((one.workflowPrefs as any).confirmDelete, true);
  const all = { ...s, ...resetPatch(s, modifiedSettings(s)) };
  assert.equal(modifiedSettings(all).length, 0);
});
test('search finds synonyms, ranks label hits first, ignores accents', () => {
  const label = (k: string) => en[k];
  assert.ok(searchRegistry('inches', label).some((e) => e.id === 'workflow.units'));
  assert.ok(searchRegistry('paper', label).some((e) => e.id === 'workflow.units'));
  assert.equal(searchRegistry('word wrap', label)[0].id, 'editor.wrapLines');
  assert.deepEqual(searchRegistry('', label), []);
  assert.deepEqual(searchRegistry('zzzzqq', label), []);
});
test('project-overridable settings are exactly units, save mode and publish options', () => {
  assert.deepEqual(projectOverridable().map((e) => e.id).sort(), ['document.keepComments', 'document.stripEditorIds', 'workflow.imageSaveMode', 'workflow.units']);
});
