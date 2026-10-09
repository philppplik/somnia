import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReport} from './check.mjs';
const ok = {schema: 1, ok: true, csp_mode: 'prod', failures: [], worker: {}, panel: {}, navigation: {targets: {}}};
test('green report passes', () => assert.deepEqual(validateReport(ok), []));
test('listener hit fails even when report is green', () => assert.equal(validateReport(ok, 1).length, 1));
test('missing sections / wrong mode / ok=false fail', () => {
  assert.ok(validateReport({...ok, navigation: null}).length);
  assert.ok(validateReport({...ok, csp_mode: 'dev'}).length);
  assert.ok(validateReport({...ok, ok: false, failures: ['x']}).includes('x'));
  assert.ok(validateReport(null).length);
});
