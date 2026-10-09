import test from 'node:test';
import assert from 'node:assert/strict';
import {alignPatches, distributePatches, FIELD_RULES, parseNumberField, normalizeHex} from '../../src/lib/design/inspectorModel';
import {toolForKey} from '../../src/lib/design/tools';
import type {DesignNodeView} from '../../src/lib/design/panelContract';

const node = (id: string, x: number, y: number, width: number, height: number, locked = false): DesignNodeView => ({id, name: id, type: 'rectangle', depth: 0, visible: true, locked, x, y, width, height, rotation: 0, opacity: 1});

test('all inspector field ranges reject each out-of-range boundary', () => {
  for (const [field, rule] of Object.entries(FIELD_RULES)) {
    if ('min' in rule) {
      assert.equal(parseNumberField(String(rule.min), rule).ok, true, field);
      assert.equal(parseNumberField(String(rule.min - 0.001), rule).ok, false, field);
    }
    if ('max' in rule) {
      assert.equal(parseNumberField(String(rule.max), rule).ok, true, field);
      assert.equal(parseNumberField(String(rule.max + 0.001), rule).ok, false, field);
    }
  }
});

test('numeric and color fields never accept CSS or code payloads', () => {
  for (const payload of ['calc(100% - 1px)', 'NaN', '1;alert(1)', '0x10', '1e309', '12,34,56', '<script>', '100%', '+', '-']) {
    assert.equal(parseNumberField(payload).ok, false, payload);
    assert.equal(normalizeHex(payload), null, payload);
  }
  assert.equal(normalizeHex('url(https://example.invalid/pixel)'), null);
});

test('all six alignment modes use joint bounds without mutating inputs', () => {
  const nodes = [node('a', 10, 20, 20, 10), node('b', 80, 70, 40, 30)];
  const before = structuredClone(nodes);
  const expected = {left: {x: 10}, centerH: {x: 55}, right: {x: 100}, top: {y: 20}, centerV: {y: 55}, bottom: {y: 90}};
  for (const [kind, patch] of Object.entries(expected)) {
    const patches = alignPatches(nodes, kind as keyof typeof expected);
    assert.deepEqual(patches.get('a'), patch, kind);
    assert.equal(patches.size, 2, kind);
  }
  assert.deepEqual(nodes, before);
  assert.equal(alignPatches(nodes.map(n => ({...n, locked: true})), 'left').size, 0);
});

test('vertical distribution respects dimensions, unordered input and locked middle layers', () => {
  const nodes = [node('last', 0, 100, 20, 20), node('first', 0, 0, 20, 10), node('middle', 0, 20, 20, 30)];
  const before = structuredClone(nodes);
  assert.deepEqual([...distributePatches(nodes, 'vertical')], [['middle', {y: 40}]]);
  assert.deepEqual(nodes, before);
  nodes[2].locked = true;
  assert.equal(distributePatches(nodes, 'vertical').size, 0);
});

test('tool shortcuts ignore every editable input family and all command modifiers', () => {
  for (const key of ['V', 'h', 'F', 'r', 'T']) {
    for (const tagName of ['INPUT', 'input', 'TEXTAREA', 'SELECT']) assert.equal(toolForKey({key, target: {tagName}}), null);
    assert.equal(toolForKey({key, target: {isContentEditable: true}}), null);
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) assert.equal(toolForKey({key, [modifier]: true}), null);
  }
});
