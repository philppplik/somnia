import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LIFECYCLE_SETTINGS, LIFECYCLE_SETTINGS_KEY, readLifecycleSettings, writeLifecycleSettings } from './settings';

const mem = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
};

test('defaults: lifecycle enabled, automatic profile', () => {
  assert.deepEqual(readLifecycleSettings(mem()), DEFAULT_LIFECYCLE_SETTINGS);
  assert.equal(DEFAULT_LIFECYCLE_SETTINGS.enabled, true);
});

test('settings round-trip through storage', () => {
  const s = mem();
  writeLifecycleSettings({ enabled: false }, s);
  writeLifecycleSettings({ profile: 'low' }, s);
  assert.deepEqual(readLifecycleSettings(s), { enabled: false, profile: 'low' });
});

test('corrupt or partial values fall back safely', () => {
  assert.deepEqual(readLifecycleSettings(mem({ [LIFECYCLE_SETTINGS_KEY]: '{broken' })), DEFAULT_LIFECYCLE_SETTINGS);
  assert.deepEqual(readLifecycleSettings(mem({ [LIFECYCLE_SETTINGS_KEY]: '{"enabled":false}' })), { enabled: false, profile: 'auto' });
  assert.deepEqual(readLifecycleSettings(mem({ [LIFECYCLE_SETTINGS_KEY]: '{"profile":"extreme"}' })), { enabled: true, profile: 'auto' });
});

test('a throwing storage never breaks reads or writes', () => {
  const throwing = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
  };
  assert.deepEqual(readLifecycleSettings(throwing), DEFAULT_LIFECYCLE_SETTINGS);
  assert.deepEqual(writeLifecycleSettings({ enabled: false }, throwing), { enabled: false, profile: 'auto' });
});
