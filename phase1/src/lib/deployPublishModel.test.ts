import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTarget, DEPLOY_ERROR_CODES, describeDeployError, emptyTargetForm, formatBytes, formFromTarget, isDomain, liveUrl, nextStep, parseProgress, releaseDate, shortFingerprint, slugTargetId, sortReleases, validateTargetForm } from './deploy/publishModel';

test('every Rust error code has a plain-language entry and at least one action', () => {
  for (const code of DEPLOY_ERROR_CODES) {
    const info = describeDeployError(new Error(`deploy:${code}`));
    assert.equal(info.code, code); assert.equal(info.messageKey, `deploy.err.${code}`); assert.ok(info.actions.length > 0);
  }
});
test('error codes in the Rust source and in the model agree', async () => {
  const { readFileSync } = await import('node:fs');
  const rs = readFileSync(new URL('../../src-tauri/src/deploy_guard.rs', import.meta.url), 'utf8');
  const fn = rs.slice(rs.indexOf('pub fn code(&self)'), rs.indexOf('impl fmt::Display for DeployError'));
  const rust = [...fn.matchAll(/"([a-z-]+)"/g)].map(m => m[1]!).sort();
  assert.deepEqual(rust, DEPLOY_ERROR_CODES.filter(c => !['server-not-prepared', 'dns-not-ready', 'cancelled'].includes(c)).sort());
  // D7 adds setup/cancellation failures to the concrete runtime adapter.
});
test('unknown or raw messages never reach the screen', () => {
  for (const raw of [new Error('ssh: handshake failed at /srv/somnia/x'), 'boom', null, undefined, new Error('deploy:made-up-code')]) {
    const i = describeDeployError(raw); assert.equal(i.code, 'unknown'); assert.equal(i.messageKey, 'deploy.err.unknown');
  }
});
test('unsafe outcomes offer the version list; safe ones say nothing went live', () => {
  assert.equal(describeDeployError('deploy:health-failed-rollback-failed').safe, false);
  assert.ok(describeDeployError('deploy:health-failed-rollback-failed').actions.includes('rollbackList'));
  assert.equal(describeDeployError('deploy:upload-failed').safe, true);
  assert.deepEqual(describeDeployError('deploy:host-key-changed').actions, ['replaceKey']);
});
test('parseProgress accepts the engine words and counters only', () => {
  assert.deepEqual(parseProgress('upload'), { step: 'upload' });
  assert.deepEqual(parseProgress('upload:7/12'), { step: 'upload', done: 7, total: 12 });
  assert.deepEqual(parseProgress('Uploading 7 of 12'), { step: 'upload', done: 7, total: 12 });
  assert.deepEqual(parseProgress('upload:13/12'), { step: 'upload' });
  assert.deepEqual(parseProgress('switch'), { step: 'switch' });
  assert.equal(parseProgress('rm -rf /srv').step, 'other');
  assert.equal(parseProgress('').step, 'other');
  assert.equal(parseProgress('x'.repeat(500)).step, 'other');
});
test('release ids: date parsing and newest-first order', () => {
  assert.equal(releaseDate('20261012T143015Z-ab12cd')?.toISOString(), '2026-10-12T14:30:15.000Z');
  const prefix = String(Date.parse('2026-10-12T14:30:15Z') / 1000).padStart(20, '0');
  assert.equal(releaseDate(`${prefix}-abcdef123456`)?.toISOString(), '2026-10-12T14:30:15.000Z');
  assert.equal(releaseDate(`${prefix}-abcdef123456-123456ab`)?.toISOString(), '2026-10-12T14:30:15.000Z');
  assert.equal(releaseDate('99999999999999999999-abcdef123456'), null);
  assert.equal(releaseDate(`${prefix}-not-a-hash`), null);
  assert.deepEqual(sortReleases(['20261010T000000Z-a', `${prefix}-abcdef123456`, 'hand']), [`${prefix}-abcdef123456`, '20261010T000000Z-a', 'hand']);
  assert.equal(releaseDate('manual-1'), null);
  assert.equal(releaseDate('20261340T143015Z-ab'), null);
  assert.deepEqual(sortReleases(['20261010T000000Z-a', 'hand', '20261012T000000Z-b', '20261011T000000Z-c']), ['20261012T000000Z-b', '20261011T000000Z-c', '20261010T000000Z-a', 'hand']);
});
test('form validation mirrors Target::validate', () => {
  const ok = { ...emptyTargetForm(), name: 'Site', host: '203.0.113.10' };
  assert.deepEqual(validateTargetForm(ok), {});
  assert.ok(validateTargetForm({ ...ok, name: '  ' }).name);
  assert.ok(validateTargetForm({ ...ok, host: 'https://x.org' }).host);
  assert.ok(validateTargetForm({ ...ok, host: '-bad' }).host);
  assert.ok(validateTargetForm({ ...ok, port: '0' }).port); assert.ok(validateTargetForm({ ...ok, port: '70000' }).port); assert.ok(validateTargetForm({ ...ok, port: '2x' }).port);
  assert.ok(validateTargetForm({ ...ok, user: 'Root' }).user); assert.ok(validateTargetForm({ ...ok, user: '1abc' }).user);
  assert.deepEqual(validateTargetForm({ ...ok, domain: 'Example.com' }), {});
  assert.ok(validateTargetForm({ ...ok, domain: 'localhost' }).domain); assert.ok(validateTargetForm({ ...ok, domain: 'a..b.com' }).domain); assert.ok(validateTargetForm({ ...ok, domain: 'https://a.com' }).domain);
  assert.ok(validateTargetForm({ ...ok, kind: 'node', appPort: '80' }).appPort);
  assert.deepEqual(validateTargetForm({ ...ok, kind: 'node', appPort: '3000' }), {});
  assert.equal(isDomain('-a.com'), false); assert.equal(isDomain('a-b.example.org'), true);
});
test('buildTarget produces the exact save shape and round-trips through the form', () => {
  const t = buildTarget({ ...emptyTargetForm(), name: ' My Site ', host: ' example.org ', domain: 'EXAMPLE.org', spa: true }, 'my-site');
  assert.deepEqual(t, { id: 'my-site', name: 'My Site', host: 'example.org', port: 22, user: 'somnia', kind: 'static', keySlot: 'deploy-key:my-site', domain: 'example.org', spa: true });
  assert.deepEqual(formFromTarget(t), { name: 'My Site', host: 'example.org', port: '22', user: 'somnia', domain: 'example.org', kind: 'static', spa: true, appPort: '3000' });
  const n = buildTarget({ ...emptyTargetForm(), name: 'App', host: 'h.org', kind: 'node', appPort: '4000', spa: true }, 'app');
  assert.equal(n.appPort, 4000); assert.equal(n.spa, undefined);
  const u = buildTarget({ ...emptyTargetForm(), name: 'U', host: 'h.org', kind: 'upload-only', appPort: '4000' }, 'u');
  assert.equal(u.appPort, undefined);
});
test('slugTargetId is a valid id and unique', () => {
  assert.equal(slugTargetId('Mein Büro-Server!', []), 'mein-buro-server');
  assert.equal(slugTargetId('???', []), 'server');
  assert.equal(slugTargetId('Site', ['site', 'site-2']), 'site-3');
  const long = slugTargetId('x'.repeat(100), ['x'.repeat(32)]);
  assert.match(long, /^[a-z0-9-]{1,40}$/);
});
test('small helpers', () => {
  assert.equal(nextStep('key-missing'), 'createKey'); assert.equal(nextStep('needs-trust'), 'trust'); assert.equal(nextStep('ready'), 'publish');
  assert.equal(liveUrl({ domain: 'Example.com', kind: 'static' }), 'https://example.com'); assert.equal(liveUrl({ kind: 'static' }), null);
  assert.equal(formatBytes(900), '900 B'); assert.equal(formatBytes(2048), '2.0 KB'); assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(shortFingerprint('SHA256:Qm7x0123456789abcdefghijklmnopqrstuvwxyzZk4'), 'SHA256:Qm7x0123...xyzZk4');
  assert.equal(shortFingerprint('SHA256:short'), 'SHA256:short');
});
