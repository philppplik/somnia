import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { getSwallowCounts, resetSwallowCounts, swallow, SWALLOW_REASONS } from './swallow';

beforeEach(resetSwallowCounts);
describe('swallow', () => {
  it('returns the value and counts nothing on success', async () => {
    assert.equal(swallow('best-effort-window', () => 5), 5);
    assert.equal(await swallow('best-effort-window', Promise.resolve(6)), 6);
    assert.equal(getSwallowCounts()['best-effort-window'], 0);
  });
  it('counts sync throws and async rejections per reason', async () => {
    assert.equal(swallow('clipboard-denied', () => { throw new Error('x'); }), undefined);
    assert.equal(await swallow('best-effort-window', Promise.reject(new Error('y'))), undefined);
    const c = getSwallowCounts();
    assert.equal(c['clipboard-denied'], 1);
    assert.equal(c['best-effort-window'], 1);
    assert.equal(c['expected-cancel'], 0);
  });
  it('has the closed reason set including best-effort-window', () => {
    assert.ok(SWALLOW_REASONS.includes('best-effort-window'));
    assert.equal(new Set(SWALLOW_REASONS).size, SWALLOW_REASONS.length);
  });
});
