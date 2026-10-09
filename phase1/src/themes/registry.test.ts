import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {THEME_CHOICES} from '../lib/theme';

test('every named theme has a palette stylesheet and a label key in all locales', () => {
  const css = ['forest','royal','slate','nord-frost','crimson','honey-amber','ocean-blue','sakura','sunset-orange','lagoon-teal']
    .map(n => readFileSync(new URL(`./${n}.css`, import.meta.url), 'utf8')).join('\n');
  const locales = ['en','de','es','fr','pt-BR'].map(l => JSON.parse(readFileSync(new URL(`../locales/${l}.json`, import.meta.url), 'utf8')));
  for (const t of THEME_CHOICES) {
    if (t.palette !== 'default' && t.mode) {
      const sel = new RegExp(`data-theme=["']?${t.mode}["']?\\]\\[data-palette=["']?${t.palette}["']?[\\]:]`);
      const legacy = ['cream','midnight','blueice','grape','melon'].includes(t.palette);
      assert.ok(legacy || sel.test(css), `${t.id}: no ${t.mode}/${t.palette} rule`);
    }
    for (const l of locales) assert.ok(l[`finish.settings.theme.${t.id}`], `${t.id}: missing label`);
  }
  assert.equal(new Set(THEME_CHOICES.map(t => t.id)).size, THEME_CHOICES.length);
});
