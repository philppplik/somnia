import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewErrorGate} from './previewErrorGate';

test('first occurrences show, exact repeats drop without triggering the notice', () => {
  const gate = createPreviewErrorGate(3);
  assert.equal(gate.accept('boom'), 'show');
  assert.equal(gate.accept('boom'), 'drop');
  assert.equal(gate.accept('boom'), 'drop');
  assert.equal(gate.takeSuppressionNotice(), false, 'dedupe alone never claims a cap');
  assert.equal(gate.accept('other'), 'show');
  assert.equal(gate.takeSuppressionNotice(), false);
});

test('past the cap only new distinct errors drop and the notice fires exactly once', () => {
  const gate = createPreviewErrorGate(2);
  assert.equal(gate.accept('a'), 'show');
  assert.equal(gate.accept('b'), 'show');
  assert.equal(gate.accept('c'), 'drop');
  assert.equal(gate.takeSuppressionNotice(), true);
  assert.equal(gate.takeSuppressionNotice(), false, 'notice is a one-shot');
  assert.equal(gate.accept('d'), 'drop');
  assert.equal(gate.takeSuppressionNotice(), false, 'still one notice');
});

test('long messages dedupe by their truncated key and a fresh gate starts empty', () => {
  const gate = createPreviewErrorGate(1);
  const long = 'x'.repeat(500);
  assert.equal(gate.accept(long + '1'.repeat(0)), 'show');
  assert.equal(gate.accept(long), 'drop', 'same truncated key is a repeat');
  assert.throws(() => createPreviewErrorGate(0), /Invalid/);
});
