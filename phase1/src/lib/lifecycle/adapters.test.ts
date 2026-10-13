import test from 'node:test';
import assert from 'node:assert/strict';
import { getRegisteredLifecycleAdapter, registerLifecycleAdapter } from './adapters';
import type { StudioLifecycleAdapter } from './types';

const fake = (): StudioLifecycleAdapter => ({});

test('register, resolve and dispose', () => {
  const dispose = registerLifecycleAdapter('test-studio', fake);
  assert.ok(getRegisteredLifecycleAdapter('test-studio'));
  dispose();
  assert.equal(getRegisteredLifecycleAdapter('test-studio'), undefined);
});

test('unregistered studios resolve to undefined (lazy session code)', () => {
  assert.equal(getRegisteredLifecycleAdapter('never-loaded'), undefined);
});

test('duplicate registration throws', () => {
  const dispose = registerLifecycleAdapter('dup-studio', fake);
  assert.throws(() => registerLifecycleAdapter('dup-studio', fake));
  dispose();
});
