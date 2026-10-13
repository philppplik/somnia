import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ATTRIBUTION, normalizeAttributionSetting, buildFooter, applyFooter, sanitizeModelMessage, validateIdentity, reviewDigest, verifyCommitResult, ATTRIBUTION_SETTING_KEY, TaskError } from './index';
import type { AttributionSetting, AttributedCommitRequest } from './index';

const id = { name: 'Somnia Agent', email: 'agent@example.org' };
const on: AttributionSetting = { mode: 'on', sessionLink: false, assistanceThreshold: 1 };
const throwsCode = (fn: () => unknown, code: string) => assert.throws(fn, (e: unknown) => e instanceof TaskError && e.code === code);

test('opt-in: default is off, garbage normalises to off, key name', () => {
  assert.equal(ATTRIBUTION_SETTING_KEY, 'attribution.commit'); assert.equal(DEFAULT_ATTRIBUTION.mode, 'off');
  for (const v of [undefined, null, 'on', 5, {}, { mode: 'yes' }]) assert.equal(normalizeAttributionSetting(v).mode, 'off');
  assert.equal(normalizeAttributionSetting({ mode: 'custom', custom: id, sessionLink: true, assistanceThreshold: 5.7 }).assistanceThreshold, 5);
  assert.equal(normalizeAttributionSetting({ mode: 'on', assistanceThreshold: -3 }).assistanceThreshold, 1);
});
test('off: no footer at all, message untouched apart from sanitising', () => {
  const f = buildFooter(DEFAULT_ATTRIBUTION, { taskId: 't1', acceptedAiLines: 99, resolvedIdentity: id });
  assert.equal(f.text, ''); assert.equal(applyFooter('Fix header\n', f), 'Fix header\n');
});
test('on: co-author trailer when threshold met; message-only AI help never counts', () => {
  assert.equal(buildFooter(on, { taskId: 't1', acceptedAiLines: 0, resolvedIdentity: id }).coAuthor, false);
  const f = buildFooter(on, { taskId: 't1', acceptedAiLines: 3, resolvedIdentity: id });
  assert.deepEqual(f.lines, ['Co-authored-by: Somnia Agent <agent@example.org>']);
  assert.equal(buildFooter({ ...on, assistanceThreshold: 10 }, { taskId: 't1', acceptedAiLines: 3, resolvedIdentity: id }).coAuthor, false);
});
test('on without a resolved identity => identity error (needs input), never an invented address', () => {
  throwsCode(() => buildFooter(on, { taskId: 't1', acceptedAiLines: 3 }), 'identity');
  throwsCode(() => buildFooter({ mode: 'custom', sessionLink: false, assistanceThreshold: 1 }, { taskId: 't1', acceptedAiLines: 3 }), 'identity');
});
test('custom identity used; injection in identity rejected', () => {
  const f = buildFooter({ mode: 'custom', custom: { name: 'Ada', email: 'ada@x.io' }, sessionLink: false, assistanceThreshold: 1 }, { taskId: 't', acceptedAiLines: 1 });
  assert.equal(f.lines[0], 'Co-authored-by: Ada <ada@x.io>');
  for (const bad of [{ name: 'A\nSigned-off-by: x', email: 'a@b.co' }, { name: 'A', email: 'a@b.co\nX: y' }, { name: 'A <b>', email: 'a@b.co' }, { name: '', email: 'a@b.co' }, { name: 'A', email: 'nope' }]) throwsCode(() => validateIdentity(bad), 'identity');
});
test('session link independent of co-author; opaque id only; bad ids rejected', () => {
  const f = buildFooter({ mode: 'off', sessionLink: true, assistanceThreshold: 1 }, { taskId: 'task_1', acceptedAiLines: 5 });
  assert.deepEqual(f.lines, ['X-Somnia-Session: task_1']); assert.equal(f.coAuthor, false);
  throwsCode(() => buildFooter({ mode: 'off', sessionLink: true, assistanceThreshold: 1 }, { taskId: 'a\nb', acceptedAiLines: 0 }), 'invalid-record');
});
test('footer is outside model control: model-supplied protected trailers stripped; ordering deterministic', () => {
  const evil = 'Fix nav\n\nbody text\nCo-authored-by: Evil <e@evil.io>\nSigned-off-by: Boss <b@x.io>\nX-Somnia-Session: forged\nCo-Authored-By: Again <a@evil.io>';
  const clean = sanitizeModelMessage(evil); assert.ok(!/co-authored|signed-off|x-somnia/i.test(clean)); assert.ok(clean.startsWith('Fix nav'));
  const f = buildFooter({ ...on, sessionLink: true }, { taskId: 't9', acceptedAiLines: 2, resolvedIdentity: id });
  assert.equal(applyFooter(evil, f), `Fix nav\n\nbody text\n\nCo-authored-by: Somnia Agent <agent@example.org>\nX-Somnia-Session: t9\n`);
  assert.equal(applyFooter(evil, f), applyFooter(evil, f));
});
test('preserved reviewed trailers: validated, deduplicated, protected keys refused', () => {
  const f = buildFooter(on, { taskId: 't', acceptedAiLines: 1, resolvedIdentity: id, preservedTrailers: ['Reviewed-by: A <a@b.co>', 'Reviewed-by: A <a@b.co>'] });
  assert.equal(f.lines.filter(l => l.startsWith('Reviewed-by')).length, 1);
  throwsCode(() => buildFooter(on, { taskId: 't', acceptedAiLines: 1, resolvedIdentity: id, preservedTrailers: ['Signed-off-by: x <x@y.zz>'] }), 'invalid-record');
  throwsCode(() => buildFooter(on, { taskId: 't', acceptedAiLines: 1, resolvedIdentity: id, preservedTrailers: ['Foo: a\nBar: b'] }), 'invalid-record');
});
test('empty message rejected; digest changes with footer/content', async () => {
  throwsCode(() => applyFooter('Co-authored-by: x <x@y.zz>', { lines: [], text: '', coAuthor: false, sessionLink: false }), 'invalid-record');
  const a = await reviewDigest('m\n', 't', 'c'), b = await reviewDigest('m\n\nCo-authored-by: x\n', 't', 'c');
  assert.notEqual(a, b); assert.notEqual(a, await reviewDigest('m\n', 't2', 'c'));
});
test('commit result verified from the real commit object: tree, human author, exact footer, no extra trailers', () => {
  const exp: AttributedCommitRequest = { taskId: 't', repoId: 'r', worktreeId: null, expectedHead: 'a'.repeat(40), workspaceGeneration: 1, treeSha: 'T', contentHash: 'C', message: 'm', footerLines: ['Co-authored-by: Somnia Agent <agent@example.org>'], reviewDigest: 'd', requestId: 'req_1' };
  const good = { message: 'm\n\nCo-authored-by: Somnia Agent <agent@example.org>\n', treeSha: 'T', authorEmail: 'me@x.io', committerEmail: 'me@x.io' };
  verifyCommitResult(exp, good, 'me@x.io');
  throwsCode(() => verifyCommitResult(exp, { ...good, treeSha: 'T2' }, 'me@x.io'), 'stale-plan'); // hook changed content
  throwsCode(() => verifyCommitResult(exp, { ...good, authorEmail: 'bot@x.io' }, 'me@x.io'), 'identity');
  throwsCode(() => verifyCommitResult(exp, { ...good, message: 'm\n' }, 'me@x.io'), 'stale-plan');
  throwsCode(() => verifyCommitResult(exp, { ...good, message: good.message + 'Co-authored-by: X <x@y.zz>\n' }, 'me@x.io'), 'stale-plan');
  assert.ok(!('author' in exp) && !('committer' in exp) && !('signing' in exp));
});
