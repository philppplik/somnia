import test from 'node:test';
import assert from 'node:assert/strict';
import { canPublish, checkDomain, dryRunView, frameworkAdvice, liveLog, targetRows } from './model';
import type { DeployPlan, DeployTarget, DeployTargetStatus } from '../deploy/contract';

const t = (id: string, kind: DeployTarget['kind'] = 'static', port = 22): DeployTarget => ({ id, name: id, host: '203.0.113.10', port, user: 'somnia', kind, keySlot: `deploy-key:${id}` });
const status = (id: string, state: DeployTargetStatus['state'], kind: DeployTarget['kind'] = 'static'): DeployTargetStatus => ({ target: t(id, kind), state });
const file = (path: string, change: DeployPlan['files'][number]['change'], size = 10) => ({ path, change, size, sha256: 'a'.repeat(64) });
const plan = (files: DeployPlan['files']): DeployPlan => ({ planHash: 'h'.repeat(64), action: 'publish', targetId: 's1', fingerprint: 'SHA256:abcdefghijkl', buildId: 'b', files });

test('target rows show user@host, a non-default port and the selection', () => {
  const rows = targetRows({ targets: [status('a', 'ready'), { target: t('b', 'node', 2222), state: 'needs-trust' }], selectedId: 'b' });
  assert.deepEqual(rows.map(r => [r.id, r.address, r.selected, r.next]), [['a', 'somnia@203.0.113.10', false, 'publish'], ['b', 'somnia@203.0.113.10:2222', true, 'trust']]);
});

test('dry run view counts changes, sums upload bytes for added and changed files only and sorts new before changed before removed', () => {
  const v = dryRunView(plan([file('z.css', 'changed', 100), file('a.html', 'added', 50), file('old.js', 'removed', 999), file('keep.png', 'unchanged', 5000)]));
  assert.deepEqual(v.counts, { added: 1, changed: 1, removed: 1, unchanged: 1 });
  assert.equal(v.uploadBytes, 150);
  assert.deepEqual(v.rows.map(r => r.path), ['a.html', 'z.css', 'old.js']);
  assert.equal(v.empty, false);
  assert.equal(dryRunView(plan([file('x', 'unchanged')])).empty, true);
});

test('dry run view caps the list and says how many are hidden', () => {
  const v = dryRunView(plan(Array.from({ length: 55 }, (_, i) => file(`f${String(i).padStart(2, '0')}`, 'added'))));
  assert.equal(v.rows.length, 40);
  assert.equal(v.hidden, 15);
});

test('framework advice compares what the project builds with the target kind', () => {
  assert.equal(frameworkAdvice(null, t('a')), 'none');
  assert.equal(frameworkAdvice({ output: 'static' }, null), 'none');
  assert.equal(frameworkAdvice({ output: 'static' }, t('a', 'static')), 'match');
  assert.equal(frameworkAdvice({ output: 'node' }, t('a', 'static')), 'needs-node');
  assert.equal(frameworkAdvice({ output: 'node' }, t('a', 'node')), 'match');
  assert.equal(frameworkAdvice({ output: 'static' }, t('a', 'node')), 'node-not-needed');
  assert.equal(frameworkAdvice({ output: 'node' }, t('a', 'ftp')), 'upload-only');
  assert.equal(frameworkAdvice({ output: 'static' }, t('a', 'upload-only')), 'match');
});

test('domain check accepts empty and plain host names, rejects schemes, paths and ports', () => {
  assert.deepEqual(checkDomain('  '), { ok: true, value: '' });
  assert.deepEqual(checkDomain(' Example.COM '), { ok: true, value: 'example.com' });
  for (const bad of ['https://example.com', 'example.com/path', 'example.com:8080', 'localhost', 'exa mple.com', '-a.com']) assert.equal(checkDomain(bad).ok, false, bad);
});

test('live log: build first, then engine steps; the latest step is active', () => {
  const lines = liveLog({ busy: 'publish', build: { phase: 'done', summary: { fileCount: 12, totalBytes: 1 } }, progress: { seen: [{ step: 'connect' }, { step: 'upload', done: 7, total: 12 }], latest: { step: 'upload', done: 7, total: 12 } } });
  assert.deepEqual(lines.map(l => [l.key, l.status]), [['deploy.progress.build.done', 'done'], ['deploy.progress.connect', 'done'], ['deploy.progress.upload.count', 'active']]);
  assert.deepEqual(lines[2]!.params, { done: 7, total: 12 });
});

test('live log: waiting line while a publish has no step yet, nothing when idle', () => {
  assert.deepEqual(liveLog({ busy: 'publish', build: { phase: null, summary: null }, progress: { seen: [], latest: null } }).map(l => l.status), ['waiting']);
  assert.deepEqual(liveLog({ busy: null, build: { phase: null, summary: null }, progress: { seen: [], latest: null } }), []);
  assert.deepEqual(liveLog({ busy: 'plan', build: { phase: 'building', summary: null }, progress: { seen: [], latest: null } }).map(l => [l.key, l.status]), [['deploy.progress.build.building', 'active']]);
});

test('only a ready, idle target can publish', () => {
  assert.equal(canPublish(status('a', 'ready'), null), true);
  assert.equal(canPublish(status('a', 'ready'), 'publish'), false);
  assert.equal(canPublish(status('a', 'needs-trust'), null), false);
  assert.equal(canPublish(null, null), false);
});
