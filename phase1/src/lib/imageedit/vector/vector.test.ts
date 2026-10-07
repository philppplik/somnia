import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTITY, multiply, invert, applyMatrix, translation, scaling, rotation, worldMatrix, outline, createScene, validateScene, validateNode, parentIndex, isLocked,
  createVectorDocument, appendVectorOperation, withVectorOperations, replayVector, serializeVectorDocument, parseVectorDocument, VectorHistory, VectorOperationRegistry,
  registerVectorOperations, createVectorRegistry, insertOp, deleteOp, transformOp, styleOp, geometryOp, reparentOp, propertiesOp, viewportOp, batchOp, reorderOp, bakeToPathOp,
  defaultGeometry, geometryToSegments, segmentsToData, polygonPoints, validateGeometry, validateStyle, validateStylePatch, DEFAULT_SHAPE_STYLE, solid, toSvg, LIMITS,
  type VectorEditDocument, type VectorNode, type VectorScene,
} from './index';
import type { ImageOperation } from '../../image-editor/types';

let seq = 0;
const oid = () => `op${++seq}`;
const common = (id: string, name = id) => ({ id, name, transform: IDENTITY, opacity: 1, visible: true, locked: false });
const rect = (id: string, extra: Record<string, unknown> = {}): VectorNode => validateNode({ ...common(id), ...defaultGeometry('rect'), x: 10, y: 20, width: 30, height: 40, style: DEFAULT_SHAPE_STYLE, ...extra });
const group = (id: string, children: string[] = [], extra: Record<string, unknown> = {}): VectorNode => validateNode({ ...common(id), kind: 'group', children, ...extra });
const add = (id: string, node: VectorNode, parentId: string | null = null, index = 0, nodes: Record<string, VectorNode> = { [id]: node }) => insertOp(oid(), { parentId, index, rootId: id, nodes });
const baseDoc = () => createVectorDocument({ id: 's', name: 'test.svg' }, createScene(200, 100));
function doc(...ops: ImageOperation[]): VectorEditDocument { return ops.reduce(appendVectorOperation, baseDoc()); }
const scene = (...ops: ImageOperation[]) => replayVector(doc(...ops));
const fails = (d: VectorEditDocument, re: RegExp | ErrorConstructor) => assert.throws(() => replayVector(d), re as RegExp);

test('matrix order: world = parent * local; inverse; singular returns null', () => {
  const m = multiply(translation(10, 0), scaling(2, 2)); // scale first, then translate
  assert.deepEqual(applyMatrix(m, 1, 1), [12, 2]);
  const r = multiply(rotation(90), translation(1, 0));
  const [x, y] = applyMatrix(r, 0, 0); assert.ok(Math.abs(x) < 1e-9 && Math.abs(y - 1) < 1e-9);
  const inv = invert(multiply(translation(5, 7), multiply(rotation(30), scaling(2, -3))))!;
  const p = applyMatrix(multiply(translation(5, 7), multiply(rotation(30), scaling(2, -3))), 4, 9);
  const back = applyMatrix(inv, p[0], p[1]); assert.ok(Math.abs(back[0] - 4) < 1e-9 && Math.abs(back[1] - 9) < 1e-9);
  assert.equal(invert([1, 2, 2, 4, 0, 0]), null);
  assert.deepEqual(multiply(IDENTITY, IDENTITY), IDENTITY);
});

test('geometry validation and defaults', () => {
  assert.deepEqual(validateGeometry({ kind: 'rect', x: 0, y: 0, width: 10, height: 4, rx: 99 }), { kind: 'rect', x: 0, y: 0, width: 10, height: 4, rx: 5, ry: 2 });
  assert.throws(() => validateGeometry({ kind: 'rect', x: 0, y: 0, width: -1, height: 1 }), RangeError);
  assert.throws(() => validateGeometry({ kind: 'ellipse', cx: NaN, cy: 0, rx: 1, ry: 1 }), TypeError);
  assert.throws(() => validateGeometry({ kind: 'polygon', cx: 0, cy: 0, radius: 5, sides: 2 }), RangeError);
  assert.throws(() => validateGeometry({ kind: 'polygon', cx: 0, cy: 0, radius: 5, sides: 3.5 }), RangeError);
  assert.throws(() => validateGeometry({ kind: 'star' }), TypeError);
  assert.throws(() => validateGeometry({ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, extra: 1 }), /unknown key/);
  assert.throws(() => validateGeometry({ kind: 'path', segments: [{ kind: 'L', x: 1, y: 1 }] }), TypeError);
  assert.throws(() => validateGeometry({ kind: 'path', segments: [{ kind: 'M', x: 1, y: 1 }, { kind: 'A', rx: 1, ry: 1, rotation: 0, largeArc: 1, sweep: true, x: 2, y: 2 }] }), /boolean/);
  assert.equal(validateGeometry({ kind: 'path', segments: [{ kind: 'M', x: 1, y: 1 }, { kind: 'Q', x1: 2, y1: 2, x: 3, y: 3 }, { kind: 'Z' }] }).kind, 'path');
  for (const k of ['rect', 'ellipse', 'polygon', 'line', 'path'] as const) assert.equal(validateGeometry(defaultGeometry(k)).kind, k);
});

test('polygon and shapeToPath conversions', () => {
  assert.deepEqual(polygonPoints({ cx: 50, cy: 50, radius: 10, sides: 4, rotation: 0 })[0], [50, 40]);
  assert.equal(segmentsToData(geometryToSegments({ kind: 'rect', x: 10, y: 20, width: 30, height: 40, rx: 0, ry: 0 })), 'M 10 20 L 40 20 L 40 60 L 10 60 Z');
  const e = geometryToSegments({ kind: 'ellipse', cx: 0, cy: 0, rx: 10, ry: 5 });
  assert.deepEqual(e.map((s) => s.kind), ['M', 'C', 'C', 'C', 'C', 'Z']); assert.deepEqual(e[0], { kind: 'M', x: 10, y: 0 });
  assert.equal(geometryToSegments({ kind: 'rect', x: 0, y: 0, width: 10, height: 10, rx: 2, ry: 3 }).filter((s) => s.kind === 'C').length, 4);
  assert.equal(geometryToSegments({ kind: 'polygon', cx: 0, cy: 0, radius: 1, sides: 6, rotation: 0 }).length, 7);
  assert.deepEqual(geometryToSegments({ kind: 'line', x1: 1, y1: 2, x2: 3, y2: 4 }), [{ kind: 'M', x: 1, y: 2 }, { kind: 'L', x: 3, y: 4 }]);
  assert.match(segmentsToData([{ kind: 'M', x: 0, y: 0 }, { kind: 'A', rx: 5, ry: 5, rotation: 0, largeArc: true, sweep: false, x: 5, y: 5 }]), /A 5 5 0 1 0 5 5$/);
});

test('style: explicit canonical, patches reject unknown keys and bad values', () => {
  assert.deepEqual(validateStyle(DEFAULT_SHAPE_STYLE), DEFAULT_SHAPE_STYLE);
  assert.throws(() => validateStyle({ fill: solid('#fff') }), /required/);
  assert.deepEqual(solid('#f00'), { kind: 'solid', rgba: [255, 0, 0, 1] });
  assert.deepEqual(validateStylePatch({ strokeWidth: 3, dash: [4, 2], lineCap: 'round' }), { strokeWidth: 3, dash: [4, 2], lineCap: 'round' });
  for (const bad of [{ fill: { kind: 'solid', rgba: [300, 0, 0, 1] } }, { strokeWidth: -1 }, { lineCap: 'x' }, { dash: [0, 0] }, { miterLimit: 0.5 }, { color: 1 }, {}, { fill: { kind: 'gradient' } }]) assert.throws(() => validateStylePatch(bad));
});

test('node and scene validation: ids, dangerous keys, tree invariants', () => {
  for (const bad of ['__proto__', 'constructor', 'a b', '', 'x'.repeat(65)]) assert.throws(() => validateNode({ ...common('a'), id: bad, kind: 'group', children: [] }), TypeError);
  const nodes = { a: group('a', ['b']), b: rect('b') };
  assert.equal(validateScene({ viewBox: [0, 0, 10, 10], outputSize: { width: 10, height: 10 }, roots: ['a'], nodes }).roots[0], 'a');
  const mk = (roots: string[], n: Record<string, VectorNode>) => () => validateScene({ viewBox: [0, 0, 10, 10], outputSize: { width: 10, height: 10 }, roots, nodes: n });
  assert.throws(mk(['a'], { a: group('a', ['zz']) }), /Dangling/);
  assert.throws(mk(['a', 'b'], { a: group('a', ['b']), b: rect('b') }), /more than once/);
  assert.throws(mk(['a'], { a: group('a', ['a']) }), /cycle|more than once/);
  assert.throws(mk(['a'], { a: group('a', []), b: rect('b') }), /Unreachable/);
  assert.throws(mk(['a', 'a'], { a: rect('a') }), /more than once/);
  assert.throws(() => validateScene({ viewBox: [0, 0, 0, 10], outputSize: { width: 10, height: 10 }, roots: [], nodes: {} }), RangeError);
  let deep: Record<string, VectorNode> = {}; const ids = Array.from({ length: LIMITS.depth + 2 }, (_, i) => `g${i}`);
  ids.forEach((id, i) => { deep[id] = group(id, i < ids.length - 1 ? [ids[i + 1]] : []); });
  assert.throws(mk(['g0'], deep), /too deep/);
  assert.ok(Object.isFrozen(scene(add('a', rect('a'))).nodes.a));
});

test('insert, delete (subtree + overlap normalization), collisions', () => {
  const sub = { g: group('g', ['r1', 'r2']), r1: rect('r1'), r2: rect('r2') };
  const s = scene(add('g', sub.g, null, 0, sub), add('top', rect('top'), null, 1));
  assert.deepEqual(s.roots, ['g', 'top']); assert.deepEqual(Object.keys(s.nodes).sort(), ['g', 'r1', 'r2', 'top']);
  const s2 = replayVector(appendVectorOperation(doc(add('g', sub.g, null, 0, sub)), deleteOp(oid(), ['g', 'r1'])));
  assert.deepEqual(Object.keys(s2.nodes), []); assert.deepEqual(s2.roots, []);
  const s3 = replayVector(appendVectorOperation(doc(add('g', sub.g, null, 0, sub)), deleteOp(oid(), ['r1'])));
  assert.deepEqual((s3.nodes.g as any).children, ['r2']);
  fails(doc(add('a', rect('a')), add('a', rect('a'))), /collision/);
  fails(doc(add('a', rect('a')), deleteOp(oid(), ['zz'])), /Unknown node/);
  fails(doc(add('a', rect('a'), 'zz')), /Unknown node/);
  fails(doc(add('a', rect('a'), null, 5)), RangeError);
  fails(doc(add('a', rect('a')), add('b', rect('b'), 'a')), /Not a group/);
  assert.throws(() => replayVector(doc(insertOp(oid(), { parentId: null, index: 0, rootId: 'g', nodes: { g: group('g', ['x']) } }))), /Dangling/);
});

test('transform, style, geometry, properties, viewport', () => {
  const base = [add('a', rect('a')), add('b', rect('b')), add('g', group('g'))];
  let s = scene(...base, transformOp(oid(), [{ id: 'a', matrix: translation(5, 5) }, { id: 'b', matrix: scaling(2, 2) }]));
  assert.deepEqual(s.nodes.a.transform, [1, 0, 0, 1, 5, 5]); assert.deepEqual(s.nodes.b.transform, [2, 0, 0, 2, 0, 0]);
  s = scene(...base, styleOp(oid(), ['a', 'b'], { fill: solid('#ff0000'), dash: [3, 1] }));
  for (const id of ['a', 'b']) assert.deepEqual((s.nodes[id] as any).style.fill, solid('#ff0000'));
  assert.equal((s.nodes.a as any).style.strokeWidth, 1);
  fails(doc(...base, styleOp(oid(), ['g'], { strokeWidth: 2 })), /Groups have no shape style/);
  s = scene(...base, geometryOp(oid(), 'a', { ...defaultGeometry('rect'), width: 77 }));
  assert.equal((s.nodes.a as any).width, 77);
  fails(doc(...base, geometryOp(oid(), 'a', defaultGeometry('line'))), /does not match node kind/);
  fails(doc(...base, geometryOp(oid(), 'g', defaultGeometry('rect'))), /Groups/);
  s = scene(...base, propertiesOp(oid(), [{ id: 'a', name: 'Box', opacity: 0.5, visible: false }]));
  assert.deepEqual([s.nodes.a.name, s.nodes.a.opacity, s.nodes.a.visible], ['Box', 0.5, false]);
  fails(doc(...base, propertiesOp(oid(), [{ id: 'a' }])), /at least one/);
  fails(doc(...base, propertiesOp(oid(), [{ id: 'a', name: '' }])), TypeError);
  fails(doc(...base, propertiesOp(oid(), [{ id: 'a', kind: 'x' } as any])), /unknown key/);
  s = scene(...base, viewportOp(oid(), [10, 20, 300, 150], { width: 600, height: 300 }));
  assert.deepEqual([...s.viewBox], [10, 20, 300, 150]); assert.equal(s.outputSize.width, 600);
  fails(doc(...base, viewportOp(oid(), [0, 0, -1, 5], { width: 1, height: 1 })), RangeError);
});

test('reparent: grouping preserves world, cycles and self-moves rejected, order and index', () => {
  const g = group('g', [], { transform: translation(100, 0) });
  const d = doc(add('a', rect('a', { transform: translation(10, 0) })), add('b', rect('b'), null, 1), add('g', g, null, 2));
  const before = replayVector(d);
  const worldA = worldMatrix(before, 'a');
  // move a into g: local = inverse(parent world) * world
  const local = multiply(invert(worldMatrix(before, 'g'))!, worldA);
  const afterDoc = appendVectorOperation(d, reparentOp(oid(), { ids: ['a'], parentId: 'g', index: 0, nodes: [{ id: 'a', matrix: local }] }));
  const after = replayVector(afterDoc);
  assert.deepEqual(after.roots, ['b', 'g']); assert.deepEqual((after.nodes.g as any).children, ['a']);
  assert.deepEqual(worldMatrix(after, 'a').map((n) => Math.round(n * 1e9) / 1e9), worldA.map((n) => Math.round(n * 1e9) / 1e9));
  const one = (ids: string[], parentId: string | null, index: number) => appendVectorOperation(d, reparentOp(oid(), { ids, parentId, index, nodes: ids.map((id) => ({ id, matrix: IDENTITY })) }));
  assert.deepEqual(replayVector(one(['a', 'b'], null, 1)).roots, ['g', 'a', 'b']);
  assert.deepEqual(replayVector(one(['b'], null, 0)).roots, ['b', 'a', 'g']);
  assert.throws(() => replayVector(one(['a'], 'a', 0)), /Not a group|group/);
  assert.throws(() => replayVector(one(['g'], 'g', 0)), /cycle/);
  const nested = appendVectorOperation(afterDoc, reparentOp(oid(), { ids: ['g'], parentId: 'b', index: 0, nodes: [{ id: 'g', matrix: IDENTITY }] }));
  assert.throws(() => replayVector(nested), /group/);
  const inside = doc(add('o', group('o', ['i']), null, 0, { o: group('o', ['i']), i: group('i') }));
  assert.throws(() => replayVector(appendVectorOperation(inside, reparentOp(oid(), { ids: ['o'], parentId: 'i', index: 0, nodes: [{ id: 'o', matrix: IDENTITY }] }))), /cycle/);
  assert.throws(() => replayVector(appendVectorOperation(inside, reparentOp(oid(), { ids: ['o', 'i'], parentId: null, index: 0, nodes: [{ id: 'o', matrix: IDENTITY }, { id: 'i', matrix: IDENTITY }] }))), /descendant/);
  assert.throws(() => replayVector(one(['a'], null, 9)), RangeError);
  assert.throws(() => appendVectorOperation(d, reparentOp(oid(), { ids: ['a', 'b'], parentId: null, index: 0, nodes: [{ id: 'b', matrix: IDENTITY }, { id: 'a', matrix: IDENTITY }] })) && replayVector(appendVectorOperation(d, reparentOp(oid(), { ids: ['a', 'b'], parentId: null, index: 0, nodes: [{ id: 'b', matrix: IDENTITY }, { id: 'a', matrix: IDENTITY }] }))), /same order/);
});

test('reorderOp keeps appearance; locks: own and ancestor block edits, properties still work', () => {
  const d = doc(add('a', rect('a')), add('b', rect('b'), null, 1), add('c', rect('c'), null, 2));
  assert.deepEqual(replayVector(appendVectorOperation(d, reorderOp(oid(), replayVector(d), 'a', 2))).roots, ['b', 'c', 'a']);
  assert.throws(() => reorderOp('x', replayVector(d), 'a', 3), RangeError);
  const sub = { g: group('g', ['k'], { locked: true }), k: rect('k') };
  const locked = doc(add('g', sub.g, null, 0, sub), add('free', rect('free'), null, 1));
  const s = replayVector(locked);
  assert.ok(isLocked(s, 'k', parentIndex(s)));
  for (const op of [styleOp(oid(), ['k'], { strokeWidth: 2 }), deleteOp(oid(), ['k']), transformOp(oid(), [{ id: 'k', matrix: IDENTITY }]), geometryOp(oid(), 'k', defaultGeometry('rect')),
    insertOp(oid(), { parentId: 'g', index: 0, rootId: 'n', nodes: { n: rect('n') } }), reparentOp(oid(), { ids: ['free'], parentId: 'g', index: 0, nodes: [{ id: 'free', matrix: IDENTITY }] }),
    reparentOp(oid(), { ids: ['k'], parentId: null, index: 0, nodes: [{ id: 'k', matrix: IDENTITY }] })]) assert.throws(() => replayVector(appendVectorOperation(locked, op)), /locked/);
  const unlocked = replayVector(appendVectorOperation(appendVectorOperation(locked, propertiesOp(oid(), [{ id: 'g', locked: false, name: 'Open' }])), styleOp(oid(), ['k'], { strokeWidth: 2 })));
  assert.equal((unlocked.nodes.k as any).style.strokeWidth, 2);
});

test('batch is atomic, bounded, non-nested, validated per child', () => {
  const ok = batchOp(oid(), [add('a', rect('a')), add('b', rect('b'), null, 1), styleOp(oid(), ['a'], { strokeWidth: 5 })]);
  assert.deepEqual(replayVector(doc(ok)).roots, ['a', 'b']);
  const d = doc(add('keep', rect('keep')));
  const bad = appendVectorOperation(d, batchOp(oid(), [add('x', rect('x'), null, 1), deleteOp(oid(), ['missing'])]));
  assert.throws(() => replayVector(bad), /Unknown node/);
  assert.deepEqual(Object.keys(replayVector(d).nodes), ['keep']); // input scene unchanged
  assert.throws(() => replayVector(doc(batchOp(oid(), [batchOp(oid(), [])]))), /nested/);
  assert.throws(() => replayVector(doc(batchOp(oid(), []))), RangeError);
  assert.throws(() => replayVector(doc(batchOp(oid(), Array.from({ length: LIMITS.batch + 1 }, (_, i) => deleteOp(`d${i}`, ['a']))))), RangeError);
  assert.throws(() => replayVector(doc(batchOp(oid(), [{ id: 'z', type: 'raster', version: 1, enabled: true, params: {} }]))), /Not a vector operation/);
  const skipped = batchOp(oid(), [{ ...add('a', rect('a')), enabled: false }, add('b', rect('b'))]);
  assert.deepEqual(replayVector(doc(skipped)).roots, ['b']);
});

test('bakeToPathOp replaces a primitive with an equivalent path at the same place', () => {
  const d = doc(add('a', rect('a', { name: 'Box', transform: translation(3, 4) })), add('e', validateNode({ ...common('e'), ...defaultGeometry('ellipse'), style: DEFAULT_SHAPE_STYLE }), null, 1), add('z', rect('z'), null, 2));
  const s0 = replayVector(d);
  const s = replayVector(appendVectorOperation(d, bakeToPathOp(oid(), s0, 'e', 'e2')));
  assert.deepEqual(s.roots, ['a', 'e2', 'z']);
  const n = s.nodes.e2 as any;
  assert.equal(n.kind, 'path'); assert.equal(n.name, 'e'); assert.equal(n.segments.length, 6); assert.deepEqual(n.style, (s0.nodes.e as any).style);
  assert.throws(() => bakeToPathOp(oid(), s0, 'zz', 'q'), /Unknown node/);
  const g = replayVector(doc(add('g', group('g'))));
  assert.throws(() => bakeToPathOp(oid(), g, 'g', 'q'), /Groups/);
});

test('replay: validates disabled ops too, exact versions, abort, determinism, no mutation', () => {
  const disabledBad = { ...deleteOp(oid(), []), enabled: false };
  assert.throws(() => replayVector(doc(disabledBad)), TypeError);
  assert.throws(() => replayVector(doc({ ...add('a', rect('a')), version: 2 })), /Unsupported vector operation: vector.insert@2/);
  assert.throws(() => replayVector(doc({ id: oid(), type: 'vector.nope', version: 1, enabled: true, params: {} })), /Unsupported/);
  const d = doc(add('a', rect('a')));
  const ac = new AbortController(); ac.abort();
  assert.throws(() => replayVector(d, createVectorRegistry(), { signal: ac.signal }));
  assert.deepEqual(replayVector(d), replayVector(d));
  assert.throws(() => withVectorOperations(d, [d.operations[0], d.operations[0]]), /Duplicate operation/);
  const frozen = replayVector(d);
  assert.throws(() => { (frozen.nodes as any).a = null; }, TypeError);
});

test('document JSON round trip; unknown schema fails; params detached and frozen', () => {
  const d = doc(add('a', rect('a')), styleOp(oid(), ['a'], { fill: solid('#00ff00') }));
  const back = parseVectorDocument(serializeVectorDocument(d));
  assert.deepEqual(back, d); assert.deepEqual(replayVector(back), replayVector(d));
  assert.ok(Object.isFrozen(d.operations[0].params));
  assert.throws(() => parseVectorDocument('{"kind":"vector","schemaVersion":2}'), /Unsupported/);
  assert.throws(() => parseVectorDocument(JSON.stringify({ ...d, kind: 'raster' })), /Unsupported/);
  assert.throws(() => parseVectorDocument(JSON.stringify({ ...d, operations: [{ ...d.operations[0], version: 9 }] })), /Unsupported vector operation/);
  const params = { ids: ['a'], patch: { strokeWidth: 2 } };
  const op = { id: 'x', type: 'vector.style', version: 1, enabled: true, params } as ImageOperation;
  const dd = appendVectorOperation(d, op); (params.patch as any).strokeWidth = 99;
  assert.equal((dd.operations[2].params as any).patch.strokeWidth, 2);
});

test('registry: prefix, duplicates, cleanup ownership, rollback on partial failure', () => {
  const r = new VectorOperationRegistry();
  const off = registerVectorOperations(r);
  assert.throws(() => registerVectorOperations(r), /already registered/);
  off(); assert.throws(() => r.get({ type: 'vector.insert', version: 1 }), /Unsupported/);
  assert.throws(() => r.register({ type: 'raster' as any, version: 1, validate: (p) => p as any, apply: (s) => s }), /vector\./);
  const r2 = new VectorOperationRegistry();
  const mine = { type: 'vector.style' as const, version: 1, validate: (p: unknown) => p as any, apply: (s: VectorScene) => s };
  r2.register(mine);
  assert.throws(() => registerVectorOperations(r2), /already registered/);
  assert.equal(r2.get({ type: 'vector.style', version: 1 }), mine); // pre-existing handler survives rollback
  assert.throws(() => r2.get({ type: 'vector.insert', version: 1 }), /Unsupported/);
});

test('history: undo/redo, bad op leaves history untouched, redo cleared, cap', () => {
  const h = new VectorHistory(baseDoc(), 3);
  h.push(add('a', rect('a'))); h.push(propertiesOp(oid(), [{ id: 'a', name: 'Q' }]));
  assert.throws(() => h.push(deleteOp(oid(), ['nope'])));
  assert.equal(h.current.operations.length, 2);
  h.undo(); assert.equal(replayVector(h.current).nodes.a.name, 'a'); assert.ok(h.canRedo);
  h.redo(); assert.equal(replayVector(h.current).nodes.a.name, 'Q');
  h.undo(); h.push(propertiesOp(oid(), [{ id: 'a', visible: false }])); assert.equal(h.canRedo, false);
  for (let i = 0; i < 5; i++) h.push(propertiesOp(oid(), [{ id: 'a', opacity: i / 10 }]));
  let steps = 0; while (h.canUndo) { h.undo(); steps++; } assert.equal(steps, 3);
});

test('SVG export: tree order, transforms, group opacity, hidden, paints, escaping, locks dropped', () => {
  const sub = {
    g: group('g', ['r', 'p'], { opacity: 0.5, transform: translation(5, 6), locked: true }),
    r: rect('r', { style: { ...DEFAULT_SHAPE_STYLE, fill: solid('#ff000080'), stroke: solid('#00ff00'), strokeWidth: 4, lineCap: 'round', lineJoin: 'round', dash: [5, 2], dashOffset: 1, fillRule: 'evenodd' } }),
    p: validateNode({ ...common('p', 'a"<b>'), visible: false, ...defaultGeometry('polygon'), style: { ...DEFAULT_SHAPE_STYLE, fill: { kind: 'none' }, stroke: { kind: 'none' } } }),
  };
  const s = scene(add('g', sub.g, null, 0, sub), add('l', validateNode({ ...common('l'), ...defaultGeometry('line'), style: DEFAULT_SHAPE_STYLE }), null, 1));
  const svg = toSvg(s);
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="200" height="100" viewBox="0 0 200 100">/);
  assert.match(svg, /<g data-node="g" transform="matrix\(1 0 0 1 5 6\)" opacity="0.5">/);
  assert.ok(svg.indexOf('data-node="g"') < svg.indexOf('data-node="r"') && svg.indexOf('data-node="p"') < svg.indexOf('data-node="l"'));
  assert.match(svg, /<rect [^>]*fill="rgb\(255,0,0\)" fill-opacity="0.502" stroke="rgb\(0,255,0\)" fill-rule="evenodd" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 2" stroke-dashoffset="1"/);
  assert.match(svg, /<polygon [^>]*display="none" fill="none" stroke="none"/);
  assert.ok(!/locked|a"<b>/.test(svg));
  assert.ok(!svg.includes('<script'));
});
