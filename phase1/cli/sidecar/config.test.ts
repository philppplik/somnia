// Unit tests for provider resolution. No network, no real keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEngine, ConfigError, COMPAT_KEY_ENV } from './config';

const base = { SOMNIA_ENGINE_MODEL: 'm', SOMNIA_ENGINE_CLOUD_CONSENT: '1' };
for (const [id, envName] of Object.entries(COMPAT_KEY_ENV)) {
  test(`${id}: resolves from ${envName} with consent`, () => {
    const r = resolveEngine({ ...base, SOMNIA_ENGINE_PROVIDER: id, [envName]: 'placeholder' });
    assert.equal(r.providerId, id);
  });
  test(`${id}: fails closed without consent (config error code consent)`, () => {
    assert.throws(() => resolveEngine({ SOMNIA_ENGINE_MODEL: 'm', SOMNIA_ENGINE_PROVIDER: id, [envName]: 'placeholder' }), (e: any) => e instanceof ConfigError && e.code === 'consent');
  });
  test(`${id}: missing key is an auth error naming only the variable`, () => {
    assert.throws(() => resolveEngine({ ...base, SOMNIA_ENGINE_PROVIDER: id }), (e: any) => e instanceof ConfigError && e.code === 'auth' && e.message === `${envName} is not set.`);
  });
}
test('another vendor\'s key does not satisfy the provider', () => {
  assert.throws(() => resolveEngine({ ...base, SOMNIA_ENGINE_PROVIDER: 'xai', DEEPSEEK_API_KEY: 'placeholder' }), (e: any) => e.code === 'auth');
});
test('unknown provider lists the supported ones', () => {
  assert.throws(() => resolveEngine({ ...base, SOMNIA_ENGINE_PROVIDER: 'grok' }), /xai, meta, deepseek/);
});
