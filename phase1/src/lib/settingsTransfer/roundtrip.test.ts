import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSetup, parseSetup } from './format';
import { planImport } from './plan';
import { applyChange, buildChange } from './apply';
import { settingsPatch } from './host';
import { TRANSFER_CATEGORIES } from './classify';
import { baseState } from './format.test';
import { SETTINGS_REGISTRY, getSetting } from '../settingsRegistry';

test('machine A -> file -> machine B: merge reproduces A, keeps B-only values, never touches excluded ones', async () => {
  const a: any = baseState(); a.workflowPrefs.units = 'imperial'; a.editorPrefs.lint = !a.editorPrefs.lint; a.documentPrefs.font = 'serif'; a.previewScripts = !a.previewScripts;
  const text = buildSetup({ state: a, shortcuts: { 'x.cmd': 'Mod+Shift+X' }, categories: TRANSFER_CATEGORIES, label: 'A' });
  const b: any = baseState(); b.editorPrefs.emmet = !b.editorPrefs.emmet;
  const parsed = parseSetup(text, ['x.cmd']); assert.ok(parsed.ok); if (!parsed.ok) return;
  const target = { state: b, shortcuts: {} as Record<string, string> };
  const plan = planImport(parsed.setup, target, { mode: 'merge', categories: [...parsed.setup.categories] });
  const c = buildChange(plan, target, { selectedKeys: new Set(plan.rows.map((r) => r.key)) }); assert.ok(c.ok); if (!c.ok) return;
  let state = b; const sc: Record<string, string> = {};
  const out = await applyChange(c.change, target, {
    async saveSnapshot() {}, async writeSettings(v) { state = { ...state, ...settingsPatch(state, v) }; },
    async writeShortcuts(m) { for (const [k, v] of Object.entries(m)) { if (v === null) delete sc[k]; else sc[k] = v; } },
  }, 1);
  assert.equal(out.status, 'applied');
  assert.equal(getSetting(state, SETTINGS_REGISTRY.find((e) => e.id === 'workflow.units')!), 'imperial');
  assert.equal(getSetting(state, SETTINGS_REGISTRY.find((e) => e.id === 'editor.lint')!), a.editorPrefs.lint);
  assert.equal(getSetting(state, SETTINGS_REGISTRY.find((e) => e.id === 'editor.emmet')!), b.editorPrefs.emmet, 'B-only value survives a merge');
  assert.equal(state.previewScripts, b.previewScripts, 'script switch is never transferred');
  assert.deepEqual(sc, { 'x.cmd': 'Mod+Shift+X' });
});
