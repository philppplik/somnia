import test from 'node:test';
import assert from 'node:assert/strict';
import { LifecycleTelemetry } from './telemetry';

test('the ring is bounded and drops the oldest events', () => {
  const t = new LifecycleTelemetry({ capacity: 5, now: () => 0 });
  for (let i = 0; i < 9; i++) t.event({ type: 'pin', studioId: `s${i}` });
  assert.equal(t.events().length, 5);
  assert.equal(t.events()[0].studioId, 's4');
});

test('countsByType aggregates the retained events', () => {
  const t = new LifecycleTelemetry({ now: () => 0 });
  t.transition('a', 'active', 'warm', 'test');
  t.transition('a', 'warm', 'suspended', 'test');
  t.event({ type: 'pin', studioId: 'a' });
  const counts = t.countsByType();
  assert.equal(counts.transition, 2);
  assert.equal(counts.pin, 1);
});

test('marks are bounded monotonic timing points', () => {
  let now = 0;
  const t = new LifecycleTelemetry({ capacity: 3, now: () => ++now });
  for (let i = 0; i < 5; i++) t.mark(`m${i}`);
  assert.equal(t.recentMarks().length, 3);
  assert.equal(t.recentMarks()[0].name, 'm2');
});

test('diagnostic export contains states, counts and events but no payloads', () => {
  const t = new LifecycleTelemetry({ now: () => 7 });
  t.transition('slides', 'warm', 'suspended', 'warm-grace-expired', 12);
  const out = JSON.parse(t.exportDiagnostics({ slides: 'suspended' }));
  assert.equal(out.kind, 'somnia-lifecycle-diagnostics');
  assert.equal(out.states.slides, 'suspended');
  assert.equal(out.counts.transition, 1);
  assert.equal(out.events.length, 1);
  assert.equal(JSON.stringify(out).includes('payload'), false);
});
