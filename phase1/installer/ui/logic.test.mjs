import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { fmt, formatBytes, percent, canAccept, errorVars, errorKey, stepKey } from './logic.mjs';
test('fmt', () => { assert.equal(fmt('Hi {a} {b}', { a: 1 }), 'Hi 1 {b}'); });
test('bytes', () => { assert.equal(formatBytes(412e6), '393 MB'); assert.equal(formatBytes(2 * 1073741824), '2.0 GB'); });
test('percent never invents', () => { assert.equal(percent(null), null); assert.equal(percent(0.456), 46); assert.equal(percent(3), 100); });
test('accept gate needs scroll and tick', () => { assert.equal(canAccept(true, false), false); assert.equal(canAccept(false, true), false); assert.equal(canAccept(true, true), true); });
test('error vars + keys', () => {
  assert.deepEqual(errorVars({ kind: 'disk_full', code: 'SOM-DSK-02', required: 412e6, free: 90e6, drive: 'C:' }), { code: 'SOM-DSK-02', required: '393 MB', free: '86 MB', drive: 'C:' });
  assert.equal(errorKey('nope'), 'error.generic'); assert.equal(stepKey(2), 'progress.step.assoc');
});
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
test('a11y contract from checklist', () => {
  assert.match(html, /role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby/);
  assert.match(html, /aria-label="Welcome to Somnia"/); assert.match(html, /lang="la"/);
  assert.match(html, /class="logo" src="mark.svg" alt="" aria-hidden="true"/);
  assert.match(html, /role="alert"/); assert.match(html, /role="progressbar"/); assert.match(html, /aria-live="polite"/);
  assert.match(css, /prefers-reduced-motion:reduce/); assert.match(css, /forced-colors:active/);
  assert.match(css, /\.close\{[^}]*width:44px;height:44px/); assert.match(css, /hyphens:none/);
  assert.match(css, /--tag:#5C5C66/); assert.match(css, /#C26A00/); assert.doesNotMatch(css, /filter:\s*blur/);
  assert.match(css, /focus-visible\{outline:3px/);
});
test('every data-i18n key exists in all locales', () => {
  const keys = [...html.matchAll(/data-i18n(?:-label)?="([^"]+)"/g)].map((m) => m[1]);
  for (const c of ['en', 'de', 'es', 'fr', 'pt-BR']) { const t = JSON.parse(fs.readFileSync(new URL(`../core/locales/${c}.json`, import.meta.url))); for (const k of keys) assert.ok(k in t, `${c}:${k}`); }
});
