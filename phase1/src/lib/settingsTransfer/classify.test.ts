import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_REGISTRY } from '../settingsRegistry';
import { classify, coverageReport, isTransferable, transferableSettings, unclassifiedSettings, TRANSFER_CATEGORIES } from './classify';

test('every registry setting is classified (new settings must be classified explicitly)', () => {
  assert.deepEqual(unclassifiedSettings(), []);
});
test('executable and unknown settings are never transferable', () => {
  assert.equal(isTransferable('previewScripts'), false);
  assert.equal(classify('previewScripts').sensitivity, 'executable');
  assert.equal(isTransferable('some.new.setting'), false);
  assert.equal(classify('__proto__').reason, 'unclassified');
  assert.equal(classify('constructor').sensitivity, 'device');
});
test('transferable settings all have a known category', () => {
  for (const e of transferableSettings()) assert.ok(TRANSFER_CATEGORIES.includes(classify(e.id).category!), e.id);
  assert.equal(transferableSettings().length, SETTINGS_REGISTRY.length - 1);
});
test('coverage report carries counts and reasons, no setting ids', () => {
  const r = coverageReport();
  assert.equal(Object.values(r.included).reduce((a, b) => a + b, 0), transferableSettings().length);
  assert.deepEqual(r.excluded, { 'enables script execution': 1 });
  assert.ok(!JSON.stringify(r).includes('previewScripts'));
});
