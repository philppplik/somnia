import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HIGH_PROFILE,
  LOW_PROFILE,
  NORMAL_PROFILE,
  PRESSURE_CRITICAL_RATIO,
  PRESSURE_ENTER_RATIO,
  PRESSURE_EXIT_RATIO,
  resolveProfile,
} from './budgets';

test('normal profile matches the concept budget table (1536 MiB envelope)', () => {
  const MiB = 1024 * 1024;
  assert.equal(NORMAL_PROFILE.envelopeBytes, 1536 * MiB);
  assert.deepEqual(NORMAL_PROFILE.buckets, {
    shell: 256 * MiB,
    active: 512 * MiB,
    warm: 128 * MiB,
    suspended: 64 * MiB,
    jobs: 256 * MiB,
    extensions: 64 * MiB,
  });
  assert.equal(NORMAL_PROFILE.warmSlots, 1);
  assert.equal(NORMAL_PROFILE.heavyJobs, 2);
});

test('low profile halves the envelope and drops the warm slot', () => {
  const MiB = 1024 * 1024;
  assert.equal(LOW_PROFILE.envelopeBytes, 768 * MiB);
  assert.equal(LOW_PROFILE.warmSlots, 0);
  assert.equal(LOW_PROFILE.heavyJobs, 1);
  assert.equal(LOW_PROFILE.buckets.active, 256 * MiB);
});

test('high profile keeps one warm slot and expands only the envelope', () => {
  assert.equal(HIGH_PROFILE.warmSlots, 1);
  assert.ok(HIGH_PROFILE.envelopeBytes > NORMAL_PROFILE.envelopeBytes);
});

test('explicit profile settings win over device hints', () => {
  assert.equal(resolveProfile('low', { deviceMemory: 32 }).id, 'low');
  assert.equal(resolveProfile('high', { deviceMemory: 2 }).id, 'high');
  assert.equal(resolveProfile('normal', {}).id, 'normal');
});

test('auto profile: small devices go low, unknown hints stay normal', () => {
  assert.equal(resolveProfile('auto', { deviceMemory: 4 }).id, 'low');
  assert.equal(resolveProfile('auto', { deviceMemory: 16 }).id, 'normal');
  assert.equal(resolveProfile('auto', {}).id, 'normal');
  assert.equal(resolveProfile('auto', { deviceMemory: Number.NaN }).id, 'normal');
});

test('pressure thresholds are ordered and match the concept', () => {
  assert.equal(PRESSURE_ENTER_RATIO, 0.8);
  assert.equal(PRESSURE_EXIT_RATIO, 0.65);
  assert.equal(PRESSURE_CRITICAL_RATIO, 0.95);
  assert.ok(PRESSURE_EXIT_RATIO < PRESSURE_ENTER_RATIO && PRESSURE_ENTER_RATIO < PRESSURE_CRITICAL_RATIO);
});
