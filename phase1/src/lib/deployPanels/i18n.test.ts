import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPLOY_PANEL_CATALOGUES } from './i18n';
import { deployInspectorSections, deployPanels, DEPLOY_RAIL_ITEMS } from './shell';

const LOCALES = ['en', 'de', 'es', 'fr', 'pt-BR'];
test('every Publish panel key exists in all five locales and keeps its placeholders', () => {
  const en = DEPLOY_PANEL_CATALOGUES.en!;
  for (const l of LOCALES) {
    assert.deepEqual(Object.keys(DEPLOY_PANEL_CATALOGUES[l]!).sort(), Object.keys(en).sort(), l);
    for (const [k, v] of Object.entries(DEPLOY_PANEL_CATALOGUES[l]!)) {
      assert.ok(v && v.length > 0, `${l} ${k}`);
      assert.deepEqual([...v.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), [...en[k]!.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), `${l} ${k} placeholders`);
    }
  }
});
test('manifest title keys, rail labels and panel ids resolve to catalogue entries', () => {
  const en = DEPLOY_PANEL_CATALOGUES.en!;
  for (const p of deployPanels) assert.ok(en[p.titleKey!], p.id);
  for (const s of deployInspectorSections) assert.ok(en[s.titleKey!], s.id);
  const panelIds = new Set(deployPanels.map(p => p.id));
  for (const r of DEPLOY_RAIL_ITEMS) { assert.ok(panelIds.has(r.panel!), r.id); assert.ok(en[r.labelKey!], r.id); }
});
