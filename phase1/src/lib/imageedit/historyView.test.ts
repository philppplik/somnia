import test from 'node:test';
import assert from 'node:assert/strict';
import { timeline, jumpTo, toggleOp, removeOp, stepLabelKey } from './historyView';

const op = (id: string, type: string, enabled = true) => ({ id, type, enabled });
const s0 = { stack: [], adjust: 0, filter: null };
const s1 = { stack: [op('a', 'crop')], adjust: 0, filter: null };
const s2 = { stack: [op('a', 'crop')], adjust: 1, filter: null };
const s3 = { stack: [op('a', 'crop', false)], adjust: 1, filter: null };

test('timeline labels and cursor', () => {
  const t = timeline([s0, s1], s2, [s3]);
  assert.deepEqual(t.map((e) => e.labelKey), ['imageeditor.history.original', 'imageeditor.op.crop', 'imageeditor.op.adjust', 'imageeditor.history.toggled']);
  assert.equal(t[2].current, true); assert.equal(t[3].future, true); assert.equal(t[1].future, false);
});
test('jumpTo keeps everything reachable', () => {
  const r = jumpTo([s0, s1], s2, [s3], 1)!;
  assert.equal(r.now, s1); assert.deepEqual(r.past, [s0]); assert.deepEqual(r.future, [s2, s3]);
  assert.equal(jumpTo([s0], s1, [], 5), null);
});
test('toggle and remove only touch the target', () => {
  const st = [op('a', 'crop'), op('b', 'flip')];
  assert.equal(toggleOp(st, 'b')[1].enabled, false); assert.equal(toggleOp(st, 'b')[0], st[0]);
  assert.deepEqual(removeOp(st, 'a').map((o) => o.id), ['b']);
  assert.equal(stepLabelKey(s1, s0), 'imageeditor.history.removed');
});
