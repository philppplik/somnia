import test from 'node:test';
import assert from 'node:assert/strict';
import {MIXED, alignPatches, distributePatches, normalizeHex, parseNumberField, shared} from './inspectorModel';
import {DESIGN_TOOLS, toolForKey} from './tools';
import type {DesignNodeView} from './panelContract';
const n = (id: string, x: number, y: number, w: number, h: number, extra: Partial<DesignNodeView> = {}): DesignNodeView =>
  ({id, name: id, type: 'rectangle', visible: true, locked: false, depth: 0, x, y, width: w, height: h, rotation: 0, opacity: 1, ...extra});
test('parseNumberField accepts decimals and commas, rejects junk and range', () => {
  assert.deepEqual(parseNumberField(' 12,5 '), {ok: true, value: 12.5});
  assert.deepEqual(parseNumberField('-3'), {ok: true, value: -3});
  for (const bad of ['abc', '1e3', '12px', 'Infinity', '--1', '1.2.3']) assert.deepEqual(parseNumberField(bad), {ok: false, reason: 'nan'}, bad);
  assert.deepEqual(parseNumberField(''), {ok: false, reason: 'empty'});
  assert.deepEqual(parseNumberField('0', {min: 0.01}), {ok: false, reason: 'range'});
  assert.deepEqual(parseNumberField('2.6', {integer: true}), {ok: true, value: 3});
});
test('normalizeHex', () => {
  assert.equal(normalizeHex('ABC'), '#aabbcc'); assert.equal(normalizeHex('#3366FF'), '#3366ff');
  for (const bad of ['', '#12', 'red', '#ggg', '#12345678']) assert.equal(normalizeHex(bad), null, bad);
});
test('shared returns MIXED when values differ', () => {
  assert.equal(shared([n('a', 1, 0, 1, 1), n('b', 1, 5, 1, 1)], v => v.x), 1);
  assert.equal(shared([n('a', 1, 0, 1, 1), n('b', 2, 5, 1, 1)], v => v.x), MIXED);
  assert.equal(shared([], v => v.x), undefined);
});
test('align aligns to joint bounds and skips locked nodes', () => {
  const nodes = [n('a', 0, 0, 10, 10), n('b', 30, 5, 20, 10), n('c', 10, 40, 10, 10, {locked: true})];
  const left = alignPatches(nodes, 'left');
  assert.deepEqual([...left.entries()], [['a', {x: 0}], ['b', {x: 0}]]);
  assert.equal(alignPatches(nodes, 'right').get('a')?.x, 40);
  assert.equal(alignPatches(nodes, 'centerV').get('a')?.y, 20);
  assert.equal(alignPatches([nodes[0]], 'left').size, 0);
});
test('distribute makes equal gaps and keeps ends', () => {
  const p = distributePatches([n('a', 0, 0, 10, 10), n('b', 12, 0, 10, 10), n('c', 90, 0, 10, 10)], 'horizontal');
  assert.deepEqual([...p.entries()], [['b', {x: 45}]]);
  assert.equal(distributePatches([n('a', 0, 0, 1, 1), n('b', 5, 0, 1, 1)], 'horizontal').size, 0);
});
test('tool shortcuts are unique and ignore inputs and modifiers', () => {
  assert.equal(new Set(DESIGN_TOOLS.map(t => t.shortcut)).size, DESIGN_TOOLS.length);
  assert.equal(toolForKey({key: 'r'}), 'rectangle');
  assert.equal(toolForKey({key: 'r', ctrlKey: true}), null);
  assert.equal(toolForKey({key: 'r', target: {tagName: 'INPUT'}}), null);
  assert.equal(toolForKey({key: 'Enter'}), null);
});
