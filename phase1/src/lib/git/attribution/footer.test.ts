import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFooter, finalizeCommitMessage, DEFAULT_ATTRIBUTION_POLICY, type AttributionPolicy} from './footer';
const on: AttributionPolicy = {enabled: true, coAuthorName: 'Somnia Agent', coAuthorEmail: 'agent@example.com'};
test('off by default: no footer even when substantive', () => {
  assert.deepEqual(buildFooter(DEFAULT_ATTRIBUTION_POLICY, true, 'task-1'), []);
});
test('opt-in and substantive yields exactly two trailer lines', () => {
  assert.deepEqual(buildFooter(on, true, 'task-1'), ['Co-authored-by: Somnia Agent <agent@example.com>', 'X-Somnia-Session: task-1']);
  assert.deepEqual(buildFooter(on, false, 'task-1'), []);
});
test('model-written reserved trailers are stripped and replaced, other trailers stay', () => {
  const r = finalizeCommitMessage({subject: 'Fix hero\n', body: 'Tighten spacing.\n\nSigned-off-by: A <a@b.co>\nCo-authored-by: Evil <e@x.io>\nX-Somnia-Session: forged', aiDrafted: true, substantive: true, policy: on, sessionId: 'task-9'});
  assert.equal(r.strippedModelTrailers, 2);
  assert.ok(r.body.includes('Signed-off-by: A <a@b.co>'));
  assert.ok(!r.body.includes('Evil') && !r.body.includes('forged'));
  assert.ok(r.body.endsWith('Co-authored-by: Somnia Agent <agent@example.com>\nX-Somnia-Session: task-9'));
  assert.equal(r.subject, 'Fix hero');
});
test('AI-drafted text alone is not co-authorship; forged trailers still stripped', () => {
  const r = finalizeCommitMessage({subject: 's', body: 'x\n\nCo-authored-by: Evil <e@x.io>', aiDrafted: true, substantive: false, policy: on, sessionId: 't'});
  assert.equal(r.applied, false); assert.equal(r.body, 'x'); assert.deepEqual(r.footer, []);
});
test('idempotent and rejects bad identity or session ids', () => {
  const a = finalizeCommitMessage({subject: 's', body: 'b', aiDrafted: true, substantive: true, policy: on, sessionId: 't'});
  const b = finalizeCommitMessage({subject: 's', body: a.body, aiDrafted: true, substantive: true, policy: on, sessionId: 't'});
  assert.equal(a.body, b.body);
  assert.deepEqual(buildFooter({...on, coAuthorName: 'A\nB'}, true), []);
  assert.deepEqual(buildFooter(on, true, 'bad id; rm'), ['Co-authored-by: Somnia Agent <agent@example.com>']);
});
test('human-written message is untouched apart from the footer', () => {
  const r = finalizeCommitMessage({subject: 's', body: 'Mine', aiDrafted: false, substantive: false, policy: on});
  assert.equal(r.body, 'Mine'); assert.equal(r.applied, false);
});
