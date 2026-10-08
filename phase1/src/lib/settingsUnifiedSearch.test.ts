import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseQuery, unifiedSearch } from './settingsUnifiedSearch';
import { DEFAULT_WORKFLOW_PREFS } from './workflowPrefs';
import { DEFAULT_EDITOR_PREFS } from './editorPrefs';
import { DEFAULT_DOCUMENT_PREFS } from './documentPrefs';

const en = JSON.parse(readFileSync(new URL('../locales/en.json', import.meta.url), 'utf8'));
const label = (k: string) => en[k];
const state = { workflowPrefs: { ...DEFAULT_WORKFLOW_PREFS, units: 'imperial' }, editorPrefs: { ...DEFAULT_EDITOR_PREFS }, documentPrefs: { ...DEFAULT_DOCUMENT_PREFS }, wrapLines: false };
const cmds = [{ id: 'project.export', title: 'Export project...', category: 'Project', shortcut: 'Mod+E', keywords: ['zip'] }, { id: 'help.about', title: 'About Somnia' }];

test('parseQuery splits known @filters only', () => {
  assert.deepEqual(parseQuery('@modified  units @bogus'), { filters: ['modified'], text: 'units @bogus' });
  assert.deepEqual(parseQuery('@project'), { filters: ['project'], text: '' });
});
test('settings and commands in one list', () => {
  const r = unifiedSearch('export', state, label, cmds);
  assert.ok(r.some((x) => x.kind === 'command' && x.command.id === 'project.export'));
  assert.ok(r.some((x) => x.kind === 'setting' && x.entry.id === 'document.stripEditorIds'));
});
test('@modified, @project and @shortcut', () => {
  assert.deepEqual(unifiedSearch('@modified', state, label, cmds).map((x) => x.kind === 'setting' && x.entry.id), ['workflow.units']);
  const proj = unifiedSearch('@project', state, label, cmds);
  assert.equal(proj.length, 4); assert.ok(proj.every((x) => x.kind === 'setting'));
  const sc = unifiedSearch('@shortcut', state, label, cmds);
  assert.deepEqual(sc.map((x) => x.kind === 'command' && x.command.id), ['project.export']);
  assert.deepEqual(unifiedSearch('', state, label, cmds), []);
});
test('synonym finds a setting that the label does not contain', () => {
  assert.ok(unifiedSearch('a4', state, label, []).some((x) => x.kind === 'setting' && x.entry.id === 'workflow.units'));
});
