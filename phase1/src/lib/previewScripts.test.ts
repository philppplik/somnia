import test from 'node:test';
import assert from 'node:assert/strict';
import { PREVIEW_SETTINGS_KEY, previewScriptsProjectKey, readPreviewScripts, savePreviewScripts, readProjectPreviewScripts, resolvePreviewScripts, sanitizePreviewSettings } from './previewScripts';

function storage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }});
  return values;
}
test('new installs default on; missing keys in old settings migrate to true', () => {
  const values = storage();
  assert.equal(readPreviewScripts(), true);
  values.set(PREVIEW_SETTINGS_KEY, JSON.stringify({ legacy: false }));
  assert.equal(readPreviewScripts(), true);
  for (const raw of [null, {}, { previewScripts: 'false' }, { previewScripts: 0 }])
    assert.deepEqual(sanitizePreviewSettings(raw), { previewScripts: true });
});
test('global opt-out and opt-in survive persistence', () => {
  storage();
  savePreviewScripts(false);
  assert.equal(readPreviewScripts(), false);
  assert.equal(resolvePreviewScripts(null, readPreviewScripts()), false);
  savePreviewScripts(true);
  assert.equal(readPreviewScripts(), true);
  assert.equal(resolvePreviewScripts(null, readPreviewScripts()), true);
});
test('explicit project choices win in either direction and stay project-scoped', () => {
  const values = storage();
  values.set(previewScriptsProjectKey('one'), '0');
  values.set(previewScriptsProjectKey('two'), '1');
  for (const globalDefault of [false, true]) {
    assert.equal(resolvePreviewScripts(readProjectPreviewScripts('one'), globalDefault), false);
    assert.equal(resolvePreviewScripts(readProjectPreviewScripts('two'), globalDefault), true);
    assert.equal(resolvePreviewScripts(readProjectPreviewScripts('new'), globalDefault), globalDefault);
  }
  values.set(previewScriptsProjectKey('invalid'), 'unknown');
  assert.equal(readProjectPreviewScripts('invalid'), null);
});
test('unavailable or corrupt storage falls back to global default', () => {
  storage().set(PREVIEW_SETTINGS_KEY, '{');
  assert.equal(readPreviewScripts(), true);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('disabled'); }});
  assert.equal(readPreviewScripts(), true);
  assert.equal(readProjectPreviewScripts('one'), null);
  assert.doesNotThrow(() => savePreviewScripts(false));
  delete (globalThis as any).localStorage;
});
