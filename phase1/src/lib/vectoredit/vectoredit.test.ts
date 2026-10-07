import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addLayerOp, createVectorDocument, createVectorRegistry, appendVectorOperation, resolveLayers, serializeVectorDocument, parseVectorDocument,
  removeLayerOp, renameLayerOp, reorderLayerOp, setLockedOp, setVisibleOp, toPathOp, updateLayerOp, toSvg, VectorHistory, VectorOpRegistry, registerVectorOps,
  normalizeShape, normalizeStyle, shapeToPath, defaultShape, polygonPoints, pathData, type VectorDocument, type VectorOperation,
} from './index';

let n = 0;
const id = () => `op${++n}`;
function build(...ops: VectorOperation[]): VectorDocument { return ops.reduce(appendVectorOperation, createVectorDocument(200, 100)); }
const rect = { kind: 'rect', x: 10, y: 20, width: 30, height: 40, rx: 0 };

test('shapes validate and fill defaults; bad input throws', () => {
  assert.deepEqual(normalizeShape({ kind: 'rect', x: 0, y: 0, width: 10, height: 10 }), { kind: 'rect', x: 0, y: 0, width: 10, height: 10, rx: 0 });
  assert.equal((normalizeShape({ kind: 'rect', x: 0, y: 0, width: 10, height: 4, rx: 99 }) as any).rx, 2);
  assert.throws(() => normalizeShape({ kind: 'rect', x: 0, y: 0, width: -1, height: 1 }), RangeError);
  assert.throws(() => normalizeShape({ kind: 'ellipse', cx: NaN, cy: 0, rx: 1, ry: 1 }), TypeError);
  assert.throws(() => normalizeShape({ kind: 'polygon', cx: 0, cy: 0, radius: 5, sides: 2 }), RangeError);
  assert.throws(() => normalizeShape({ kind: 'polygon', cx: 0, cy: 0, radius: 5, sides: 3.5 }), RangeError);
  assert.throws(() => normalizeShape({ kind: 'star' }), TypeError);
  assert.throws(() => normalizeShape({ kind: 'path', commands: [['L', 1, 1]] }), TypeError);
  assert.throws(() => normalizeShape({ kind: 'path', commands: [['M', 1]] }), TypeError);
  for (const k of ['rect', 'ellipse', 'polygon', 'line', 'path'] as const) assert.equal(normalizeShape(defaultShape(k)).kind, k);
});

test('polygon vertices lie on the circle and first points up', () => {
  const pts = polygonPoints({ kind: 'polygon', cx: 50, cy: 50, radius: 10, sides: 4, rotation: 0 });
  assert.deepEqual(pts[0], [50, 40]);
  for (const [x, y] of pts) assert.ok(Math.abs(Math.hypot(x - 50, y - 50) - 10) < 1e-4);
});

test('shapeToPath: rect, ellipse, polygon, line convert; paths pass through', () => {
  assert.equal(pathData(shapeToPath(normalizeShape(rect)).commands), 'M 10 20 L 40 20 L 40 60 L 10 60 Z');
  const e = shapeToPath({ kind: 'ellipse', cx: 0, cy: 0, rx: 10, ry: 5 });
  assert.deepEqual(e.commands.map((c) => c[0]), ['M', 'C', 'C', 'C', 'C', 'Z']);
  assert.deepEqual(e.commands[0], ['M', 10, 0]);
  const rr = shapeToPath({ kind: 'rect', x: 0, y: 0, width: 10, height: 10, rx: 2 });
  assert.equal(rr.commands.filter((c) => c[0] === 'C').length, 4);
  assert.equal(shapeToPath({ kind: 'polygon', cx: 0, cy: 0, radius: 1, sides: 6, rotation: 0 }).commands.length, 7);
  assert.deepEqual(shapeToPath({ kind: 'line', x1: 1, y1: 2, x2: 3, y2: 4 }).commands, [['M', 1, 2], ['L', 3, 4]]);
  const p = normalizeShape({ kind: 'path', commands: [['M', 0, 0], ['L', 1, 1]] });
  assert.deepEqual(shapeToPath(p), p);
});

test('style: partial patches merge, bad values throw', () => {
  const s = normalizeStyle({ fill: { color: '#FF0000' }, stroke: { width: 3, cap: 'round', join: 'bevel', dash: [4, 2] }, opacity: 0.5 });
  assert.deepEqual(s, { fill: { color: '#ff0000' }, stroke: { color: '#000000', width: 3, cap: 'round', join: 'bevel', dash: [4, 2] }, opacity: 0.5 });
  assert.equal(normalizeStyle({ fill: { color: null } }).fill.color, null);
  assert.throws(() => normalizeStyle({ fill: { color: 'red' } }), TypeError);
  assert.throws(() => normalizeStyle({ stroke: { width: -1 } }), RangeError);
  assert.throws(() => normalizeStyle({ stroke: { cap: 'x' } }), TypeError);
  assert.throws(() => normalizeStyle({ stroke: { dash: [0, 0] } }), RangeError);
  assert.throws(() => normalizeStyle({ opacity: 2 }), RangeError);
});

test('layer ops: add, reorder, rename, visibility, lock, remove', () => {
  let doc = build(addLayerOp(id(), { id: 'a', shape: rect }), addLayerOp(id(), { id: 'b', name: 'Ball', shape: defaultShape('ellipse') as any }), addLayerOp(id(), { id: 'c', shape: defaultShape('line') as any }, 0));
  assert.deepEqual(resolveLayers(doc).map((l) => l.id), ['c', 'a', 'b']);
  assert.equal(resolveLayers(doc)[1].name, 'Layer 1');
  doc = [reorderLayerOp(id(), 'c', 2), renameLayerOp(id(), 'a', 'Box'), setVisibleOp(id(), 'b', false)].reduce(appendVectorOperation, doc);
  const s = resolveLayers(doc);
  assert.deepEqual(s.map((l) => l.id), ['a', 'b', 'c']);
  assert.equal(s[0].name, 'Box'); assert.equal(s[1].visible, false);
  assert.deepEqual(resolveLayers(appendVectorOperation(doc, removeLayerOp(id(), 'b'))).map((l) => l.id), ['a', 'c']);
  assert.throws(() => resolveLayers(appendVectorOperation(doc, reorderLayerOp(id(), 'a', 3))), RangeError);
  assert.throws(() => resolveLayers(appendVectorOperation(doc, renameLayerOp(id(), 'zz', 'x'))), /Unknown layer/);
  assert.throws(() => resolveLayers(appendVectorOperation(doc, renameLayerOp(id(), 'a', ''))), TypeError);
  assert.throws(() => resolveLayers(appendVectorOperation(doc, addLayerOp(id(), { id: 'a', shape: rect }))), /Duplicate layer/);
});

test('locked layers reject geometry/style/remove/convert but allow visibility, rename, reorder, unlock', () => {
  const doc = build(addLayerOp(id(), { id: 'a', shape: rect }), addLayerOp(id(), { id: 'b', shape: rect }), setLockedOp(id(), 'a', true));
  for (const op of [updateLayerOp(id(), 'a', { style: { opacity: 0.1 } }), removeLayerOp(id(), 'a'), toPathOp(id(), 'a')]) {
    assert.throws(() => resolveLayers(appendVectorOperation(doc, op)), /locked/);
  }
  const ok = [setVisibleOp(id(), 'a', false), renameLayerOp(id(), 'a', 'X'), reorderLayerOp(id(), 'a', 1), setLockedOp(id(), 'a', false), updateLayerOp(id(), 'a', { style: { opacity: 0.1 } })].reduce(appendVectorOperation, doc);
  assert.equal(resolveLayers(ok).find((l) => l.id === 'a')!.style.opacity, 0.1);
});

test('update: style patch merges, shape kind change rejected, toPath converts', () => {
  let doc = build(addLayerOp(id(), { id: 'a', shape: rect, style: { stroke: { width: 2 } } }));
  doc = appendVectorOperation(doc, updateLayerOp(id(), 'a', { shape: { ...rect, width: 99 }, style: { stroke: { color: '#ff00ff', dash: [3, 3] } } }));
  let l = resolveLayers(doc)[0];
  assert.equal((l.shape as any).width, 99);
  assert.deepEqual([l.style.stroke.width, l.style.stroke.color, l.style.stroke.dash], [2, '#ff00ff', [3, 3]]);
  assert.throws(() => resolveLayers(appendVectorOperation(doc, updateLayerOp(id(), 'a', { shape: defaultShape('line') as any }))), /toPath/);
  assert.throws(() => resolveLayers(appendVectorOperation(doc, updateLayerOp(id(), 'a', {}))), TypeError);
  l = resolveLayers(appendVectorOperation(doc, toPathOp(id(), 'a')))[0];
  assert.equal(l.shape.kind, 'path');
});

test('disabled ops are skipped; resolve does not mutate earlier states', () => {
  const doc = build(addLayerOp(id(), { id: 'a', shape: rect }), { ...renameLayerOp(id(), 'a', 'Z'), enabled: false });
  assert.equal(resolveLayers(doc)[0].name, 'Layer 1');
});

test('serialization round-trips and rejects bad documents', () => {
  const doc = build(addLayerOp(id(), { id: 'a', shape: rect }), setVisibleOp(id(), 'a', false));
  const back = parseVectorDocument(serializeVectorDocument(doc));
  assert.deepEqual(back, doc);
  assert.deepEqual(resolveLayers(back), resolveLayers(doc));
  assert.throws(() => parseVectorDocument('{"schemaVersion":2}'), /Unsupported/);
  assert.throws(() => parseVectorDocument(JSON.stringify({ ...doc, operations: [{ ...doc.operations[0], type: 'nope' }] })), /Unsupported vector operation/);
  assert.throws(() => parseVectorDocument(JSON.stringify({ ...doc, operations: [doc.operations[0], doc.operations[0]] })), /Duplicate operation/);
  assert.throws(() => createVectorDocument(0, 10), RangeError);
  assert.ok(Object.isFrozen(doc.operations[0].params));
});

test('registry rejects duplicates and cleanup unregisters', () => {
  const r = new VectorOpRegistry();
  const off = registerVectorOps(r);
  assert.throws(() => registerVectorOps(r), /already registered/);
  off();
  assert.throws(() => r.get({ type: 'layer.add', version: 1 }), /Unsupported/);
  assert.doesNotThrow(() => createVectorRegistry().get({ type: 'layer.add', version: 1 }));
});

test('history: undo/redo, invalid op leaves history untouched', () => {
  const h = new VectorHistory(createVectorDocument(10, 10));
  h.push(addLayerOp(id(), { id: 'a', shape: rect }));
  h.push(renameLayerOp(id(), 'a', 'Q'));
  assert.throws(() => h.push(renameLayerOp(id(), 'nope', 'Q')));
  assert.equal(h.current.operations.length, 2);
  h.undo(); assert.equal(resolveLayers(h.current)[0].name, 'Layer 1'); assert.ok(h.canRedo);
  h.redo(); assert.equal(resolveLayers(h.current)[0].name, 'Q');
  h.undo(); h.push(setVisibleOp(id(), 'a', false)); assert.equal(h.canRedo, false);
  h.undo(); h.undo(); h.undo(); assert.equal(h.current.operations.length, 0); assert.equal(h.canUndo, false);
});

test('SVG export: paint order, hidden skipped, stroke/fill/dash attributes, shapes', () => {
  const doc = build(
    addLayerOp(id(), { id: 'bottom', shape: rect, style: { fill: { color: '#ff0000' }, stroke: { color: '#00ff00', width: 4, cap: 'round', join: 'round', dash: [5, 2] } } }),
    addLayerOp(id(), { id: 'hid', shape: defaultShape('line') as any, visible: false }),
    addLayerOp(id(), { id: 'top', shape: { kind: 'polygon', cx: 5, cy: 5, radius: 5, sides: 3, rotation: 0 }, style: { fill: { color: null }, stroke: { width: 0 }, opacity: 0.5 } }),
  );
  const svg = toSvg(doc);
  assert.match(svg, /viewBox="0 0 200 100"/);
  assert.ok(svg.indexOf('data-layer="bottom"') < svg.indexOf('data-layer="top"'));
  assert.ok(!svg.includes('data-layer="hid"'));
  assert.match(svg, /<rect [^>]*fill="#ff0000" stroke="#00ff00" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 2"/);
  assert.match(svg, /<polygon [^>]*fill="none" stroke="none" opacity="0.5"/);
});
