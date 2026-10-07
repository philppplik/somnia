import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bezier, createVectorRegistry, documentFromJSON, documentFromString, documentToJSON, emptyDocument, hitTestDocument, hitTestPath,
  newVectorOperation, pathBBox, pathLength, pointInPath, registerVectorOps, renderDocument, renderOverlay, replay, segments, splitSegment,
  VectorHistory, VectorOperationRegistry, serializePath, parsePath, fmt, pointAt, splitCubic, cubicBBox, cubicLength,
  type Cubic, type Ctx2D, type VectorDocument, type VectorPath,
} from './index';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const line: Cubic = { p0: { x: 0, y: 0 }, c1: { x: 0, y: 0 }, c2: { x: 10, y: 0 }, p1: { x: 10, y: 0 } };
// quarter circle approximation r=100
const K = 0.5522847498;
const arc: Cubic = { p0: { x: 100, y: 0 }, c1: { x: 100, y: 100 * K }, c2: { x: 100 * K, y: 100 }, p1: { x: 0, y: 100 } };

test('evaluate endpoints and midpoint of a line', () => {
  assert.deepEqual(bezier.evaluate(line, 0), { x: 0, y: 0 });
  assert.deepEqual(bezier.evaluate(line, 1), { x: 10, y: 0 });
  near(bezier.evaluate(line, 0.5).x, 5, 1e-9 + 5);
});
test('split reproduces the curve', () => {
  const [a, b] = bezier.split(arc, 0.3);
  for (const t of [0, 0.25, 0.5, 1]) {
    const p = bezier.evaluate(a, t), q = bezier.evaluate(arc, 0.3 * t);
    near(p.x, q.x); near(p.y, q.y);
    const r = bezier.evaluate(b, t), s = bezier.evaluate(arc, 0.3 + 0.7 * t);
    near(r.x, s.x); near(r.y, s.y);
  }
});
test('length of line and quarter circle', () => {
  near(bezier.length(line), 10);
  near(bezier.length(arc), (Math.PI / 2) * 100, 0.05);
  const [a, b] = bezier.split(arc, 0.4);
  near(bezier.length(a) + bezier.length(b), bezier.length(arc), 1e-4);
});
test('bbox is tight on curve extrema', () => {
  const c: Cubic = { p0: { x: 0, y: 0 }, c1: { x: 0, y: 100 }, c2: { x: 100, y: 100 }, p1: { x: 100, y: 0 } };
  const b = bezier.bbox(c);
  near(b.minX, 0); near(b.maxX, 100); near(b.minY, 0); near(b.maxY, 75);
});
test('nearest finds the projection', () => {
  const r = bezier.nearest(line, { x: 4, y: 3 });
  near(r.point.x, 4, 1e-3); near(r.distance, 3, 1e-3);
});

const N = (id: string, x: number, y: number, extra: object = {}) => ({ id, x, y, kind: 'corner' as const, ...extra });
const tri = (id = 'p1'): VectorPath => ({ id, closed: true, fill: '#f00', stroke: '#000', strokeWidth: 2, nodes: [N('a', 0, 0), N('b', 100, 0), N('c', 50, 80)] });
const docOf = (...paths: VectorPath[]): VectorDocument => ({ width: 200, height: 200, paths });

test('contract aliases accept object and tuple cubics', () => {
  const tuple = [arc.p0, arc.c1, arc.c2, arc.p1] as const;
  assert.deepEqual(pointAt(tuple, 0.5), bezier.evaluate(arc, 0.5));
  assert.deepEqual(splitCubic(arc, 0.5), bezier.split(arc, 0.5));
  assert.deepEqual(cubicBBox(tuple), bezier.bbox(arc));
  near(cubicLength(arc), bezier.length(arc));
});
test('path bbox and length (closed triangle)', () => {
  const p = tri();
  assert.deepEqual(pathBBox(p), { minX: 0, minY: 0, maxX: 100, maxY: 80 });
  near(pathLength(p), 100 + 2 * Math.hypot(50, 80), 1e-4);
  assert.equal(segments(p).length, 3);
  assert.equal(segments({ ...p, closed: false }).length, 2);
  assert.equal(pathBBox({ ...p, nodes: [] }), null);
});
test('splitSegment keeps shape, also on the closing segment', () => {
  const p: VectorPath = { id: 'q', closed: true, nodes: [N('a', 0, 0, { out: { x: 0, y: 50 } }), N('b', 100, 0, { in: { x: 100, y: 50 } }), N('c', 50, -60)] };
  const before = bezier.length(segments(p)[0]);
  const p2 = splitSegment(p, 0, 0.5, 'm');
  assert.equal(p2.nodes.length, 4);
  near(bezier.length(segments(p2)[0]) + bezier.length(segments(p2)[1]), before, 1e-4);
  const p3 = splitSegment(p, 2, 0.5, 'm');
  assert.deepEqual([p3.nodes[3].x, p3.nodes[3].y], [25, -30]);
  assert.throws(() => splitSegment(p, 5, 0.5, 'm'), RangeError);
  assert.throws(() => splitSegment(p, 0, 1, 'm'), RangeError);
  assert.throws(() => splitSegment(p, 0, 0.5, 'a'), /Duplicate/);
  assert.equal(p.nodes.length, 3);
});
test('hit testing priority: handle > node > segment > fill', () => {
  const p: VectorPath = { ...tri(), nodes: [N('a', 0, 0, { out: { x: 30, y: 0 } }), N('b', 100, 0), N('c', 50, 80)] };
  assert.equal(hitTestPath(p, { x: 31, y: 1 })?.kind, 'handle');
  assert.equal(hitTestPath(p, { x: 99, y: 1 })?.kind, 'node');
  assert.equal(hitTestPath(p, { x: 70, y: 2 })?.kind, 'segment');
  assert.equal(hitTestPath(p, { x: 50, y: 30 }), null);
  assert.equal(hitTestPath(p, { x: 50, y: 30 }, { includeFill: true })?.kind, 'fill');
  assert.equal(hitTestPath(p, { x: 500, y: 500 }, { includeFill: true }), null);
  assert.equal(hitTestPath(p, { x: 31, y: 1 }, { showHandles: false })?.kind, 'segment');
  assert.equal(pointInPath(p, { x: 50, y: 30 }), true);
});
test('topmost path wins in document hit test', () => {
  assert.equal(hitTestDocument(docOf(tri('a'), tri('b')).paths, { x: 0, y: 0 })?.pathId, 'b');
});
test('JSON round trip and validation', () => {
  const d = docOf(tri());
  assert.deepEqual(documentFromString(documentToJSON(d)), d);
  assert.throws(() => documentFromJSON({ paths: [] }), TypeError);
  assert.throws(() => documentFromJSON({ width: 1, height: 1, paths: [{ id: 'x', nodes: [{ id: 'n', x: NaN, y: 0 }] }] }), /finite/);
  assert.throws(() => documentFromJSON({ width: 1, height: 1, paths: [tri('a'), tri('a')] }), /duplicate/);
  assert.throws(() => documentFromJSON({ width: 1, height: 1, paths: [{ id: 'x', nodes: [{ id: 'n', x: 0, y: 0 }, { id: 'n', x: 1, y: 1 }] }] }), /duplicate node/);
  assert.throws(() => documentFromJSON({ width: 0, height: 1, paths: [] }), RangeError);
});
test('canonical serialization: absolute M/L/C/Z, 3 decimals, no -0', () => {
  assert.equal(serializePath(tri()), 'M0 0L100 0L50 80Z');
  assert.equal(serializePath({ id: 'x', closed: false, nodes: [N('a', -0, 0.12345), N('b', 1e-9, 2.0005, { in: { x: -0.0004, y: 1 } })] }), 'M0 0.123C0 0.123 0 1 0 2.001');
  assert.equal(fmt(-0.0001), '0'); assert.equal(fmt(12), '12'); assert.equal(fmt(1.5), '1.5');
  const curved: VectorPath = { id: 'c', closed: true, nodes: [N('a', 0, 0, { out: { x: 0, y: 10 } }), N('b', 10, 0), N('c', 5, 5, { out: { x: 4, y: 6 } })] };
  assert.equal(serializePath(curved), 'M0 0C0 10 10 0 10 0L5 5C4 6 0 0 0 0Z');
  assert.equal(serializePath({ id: 'e', closed: false, nodes: [] }), '');
});
test('parsePath inverts serializePath (geometry, closed flag, smooth detection)', () => {
  const p: VectorPath = { id: 'c', closed: true, nodes: [N('a', 0, 0, { out: { x: 0, y: 10 }, in: { x: 0, y: -10 }, kind: 'smooth' }), N('b', 10, 0), N('c', 5, 5, { out: { x: 4, y: 6 } })] };
  const d = serializePath(p);
  const q = parsePath(d, 'c', 'a');
  assert.equal(q.closed, true);
  assert.equal(q.nodes.length, 3);
  assert.equal(serializePath(q), d);
  assert.equal(q.nodes[0].kind, 'smooth');
  assert.equal(parsePath('M0 0L10 10', 'o').closed, false);
  assert.equal(parsePath('M0,0 C1,1 2,2 3,3 4,4 5,5 6,6 L1 1', 'm').nodes.length, 4);
  assert.throws(() => parsePath('M0 0 l10 10'), SyntaxError);
  assert.throws(() => parsePath('M0 0Q1 1 2 2'), SyntaxError);
  assert.throws(() => parsePath('L1 1'), SyntaxError);
  assert.throws(() => parsePath('M0 0Z M5 5'), SyntaxError);
});

const add = newVectorOperation('o1', 'vector.path.add-path', { path: JSON.parse(JSON.stringify(tri())) });
test('ops: replay is deterministic and never mutates the base', () => {
  const base = emptyDocument(200, 200);
  const frozen = JSON.stringify(base);
  const ops = [
    add,
    newVectorOperation('o2', 'vector.path.move-node', { pathId: 'p1', nodeId: 'b', delta: { x: 5, y: 5 } }),
    newVectorOperation('o3', 'vector.path.split-segment', { pathId: 'p1', segment: 0, t: 0.5, newNodeId: 'm' }),
    newVectorOperation('o4', 'vector.path.move-handle', { pathId: 'p1', nodeId: 'a', handle: 'out', to: { x: 10, y: 20 }, mirror: true }),
    newVectorOperation('o5', 'vector.path.set-style', { pathId: 'p1', style: { fill: null } }),
    newVectorOperation('o6', 'vector.path.translate-path', { pathId: 'p1', delta: { x: 1, y: 1 } }),
  ];
  const a = replay(base, ops), b = replay(base, JSON.parse(JSON.stringify(ops)));
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(base), frozen);
  const p = a.paths[0];
  assert.deepEqual(p.nodes.map((n) => n.id), ['a', 'm', 'b', 'c']);
  assert.deepEqual(p.nodes[0].in, { x: -9, y: -19 });
  assert.equal(p.fill, null);
  assert.equal(p.nodes[2].x, 106);
});
test('ops: smooth nodes mirror by default, corners do not', () => {
  const sm = { ...tri(), nodes: [N('a', 0, 0, { kind: 'smooth' }), N('b', 100, 0), N('c', 50, 80)] };
  const d0 = docOf(sm);
  const mv = (id: string) => newVectorOperation(id, 'vector.path.move-handle', { pathId: 'p1', nodeId: 'a', handle: 'out', to: { x: 10, y: 0 } });
  assert.deepEqual(replay(d0, [mv('x')]).paths[0].nodes[0].in, { x: -10, y: 0 });
  const d1 = docOf({ ...sm, nodes: [N('a', 0, 0), ...sm.nodes.slice(1)] });
  assert.equal(replay(d1, [mv('x')]).paths[0].nodes[0].in, undefined);
});
test('ops: disabled skipped but still validated, errors loud, delete ops', () => {
  const doc = replay(emptyDocument(), [add]);
  const del = newVectorOperation('x', 'vector.path.delete-path', { pathId: 'p1' });
  assert.equal(replay(doc, [{ ...del, enabled: false }]).paths.length, 1);
  assert.equal(replay(doc, [del]).paths.length, 0);
  assert.throws(() => replay(doc, [{ id: 'x', type: 'vector.path.nope', version: 1, enabled: false, params: {} }]), /Unsupported/);
  assert.throws(() => replay(doc, [del, del]), /Duplicate operation id/);
  assert.throws(() => replay(doc, [newVectorOperation('x', 'vector.path.delete-path', { pathId: 'nope' })]), /Unknown path/);
  assert.throws(() => replay(doc, [newVectorOperation('x', 'vector.path.move-node', { pathId: 'p1', nodeId: 'zz', delta: { x: 1, y: 1 } })]), /Unknown node/);
  assert.throws(() => replay(doc, [newVectorOperation('x', 'vector.path.move-node', { pathId: 'p1', nodeId: 'a', delta: { x: NaN, y: 1 } })]), /finite/);
  assert.throws(() => replay(doc, [newVectorOperation('x', 'vector.path.set-style', { pathId: 'p1', style: { evil: 1 } })]), /unknown style key/);
  assert.throws(() => replay(doc, [add]), /Duplicate/);
  const d2 = replay(doc, [newVectorOperation('x', 'vector.path.delete-node', { pathId: 'p1', nodeId: 'a' }), newVectorOperation('y', 'vector.path.set-closed', { pathId: 'p1', closed: false })]);
  assert.equal(d2.paths[0].nodes.length, 2);
  assert.equal(d2.paths[0].closed, false);
  assert.throws(() => newVectorOperation('x', 'vector-bogus' as never, {}), TypeError);
  assert.throws(() => newVectorOperation('x', 'vector.path.set-closed', JSON.parse('{"__proto__":{"a":1},"pathId":"p1","closed":true}')) && replay(doc, [newVectorOperation('x', 'vector.path.set-closed', JSON.parse('{"constructor":1}'))]), /forbidden key/);
});
test('ops: batch is atomic', () => {
  const doc = replay(emptyDocument(), [add]);
  const ok = newVectorOperation('b', 'vector.path.batch', { ops: [
    { id: 'c1', type: 'vector.path.translate-path', version: 1, enabled: true, params: { pathId: 'p1', delta: { x: 1, y: 0 } } },
    { id: 'c2', type: 'vector.path.set-node-kind', version: 1, enabled: true, params: { pathId: 'p1', nodeId: 'a', kind: 'smooth' } },
  ] });
  const r = replay(doc, [ok]);
  assert.equal(r.paths[0].nodes[0].x, 1); assert.equal(r.paths[0].nodes[0].kind, 'smooth');
  const bad = newVectorOperation('b2', 'vector.path.batch', { ops: [
    { id: 'c1', type: 'vector.path.translate-path', version: 1, enabled: true, params: { pathId: 'p1', delta: { x: 1, y: 0 } } },
    { id: 'c2', type: 'vector.path.delete-path', version: 1, enabled: true, params: { pathId: 'missing' } },
  ] });
  assert.throws(() => replay(doc, [bad]), /Unknown path/);
  assert.equal(doc.paths[0].nodes[0].x, 0);
  assert.throws(() => replay(doc, [newVectorOperation('n', 'vector.path.batch', { ops: [{ id: 'q', type: 'vector.path.batch', version: 1, enabled: true, params: { ops: [] } }] })]), /non-batch/);
  assert.throws(() => replay(doc, [newVectorOperation('n', 'vector.path.batch', { ops: [] })]), RangeError);
});
test('ops: abort signal stops replay', () => {
  const ac = new AbortController(); ac.abort();
  assert.throws(() => replay(emptyDocument(), [add], undefined, ac.signal));
});
test('registry: opt-in registration and cleanup, duplicates rejected', () => {
  const r = new VectorOperationRegistry();
  assert.equal(r.has('vector.path.add-path'), false);
  const off = registerVectorOps(r);
  assert.equal(r.has('vector.path.add-path'), true);
  assert.throws(() => registerVectorOps(r), /Duplicate/);
  off();
  assert.equal(r.has('vector.path.add-path'), false);
  assert.equal(createVectorRegistry().has('vector.path.set-style'), true);
});
test('history: undo/redo, failing push leaves state untouched', () => {
  const h = new VectorHistory(emptyDocument());
  h.push(add);
  h.push(newVectorOperation('o2', 'vector.path.translate-path', { pathId: 'p1', delta: { x: 10, y: 0 } }));
  assert.equal(h.document.paths[0].nodes[0].x, 10);
  h.undo();
  assert.equal(h.document.paths[0].nodes[0].x, 0);
  assert.ok(h.canRedo);
  h.redo();
  assert.equal(h.document.paths[0].nodes[0].x, 10);
  assert.throws(() => h.push(newVectorOperation('bad', 'vector.path.delete-path', { pathId: 'zz' })));
  assert.throws(() => h.push(newVectorOperation('o2', 'vector.path.delete-path', { pathId: 'p1' })), /Duplicate operation id/);
  assert.equal(h.operations.length, 2);
  h.undo(); h.push(newVectorOperation('o3', 'vector.path.delete-path', { pathId: 'p1' }));
  assert.equal(h.canRedo, false);
});

function recorder() {
  const calls: string[] = [];
  const ctx = new Proxy({ fillStyle: '', strokeStyle: '', lineWidth: 0 } as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => { calls.push(`${k}(${a.join(',')})`); }),
    set: (t, k: string, v) => { t[k] = v; calls.push(`${k}=${v}`); return true; },
  }) as unknown as Ctx2D;
  return { ctx, calls };
}
test('render: Canvas2D calls for lines, curves, fill rule and overlay', () => {
  const p: VectorPath = { ...tri(), fillRule: 'evenodd', nodes: [N('a', 0, 0, { out: { x: 0, y: 10 } }), N('b', 10, 0), N('c', 5, 5)] };
  const { ctx, calls } = recorder();
  renderDocument(ctx, docOf(p));
  assert.ok(calls.includes('moveTo(0,0)'));
  assert.ok(calls.some((c) => c.startsWith('bezierCurveTo(0,10,10,0,10,0)')));
  assert.ok(calls.includes('lineTo(5,5)'));
  assert.ok(calls.includes('closePath()'));
  assert.ok(calls.includes('fill(evenodd)'));
  assert.ok(calls.includes('stroke()'));
  assert.ok(calls.includes('fillStyle=#f00'));
  const o = recorder(); renderOverlay(o.ctx, p, { scale: 2 });
  assert.ok(o.calls.some((c) => c.startsWith('fillRect(')));
  assert.ok(o.calls.some((c) => c.startsWith('arc(0,10,1.5')));
  const nf = recorder(); renderDocument(nf.ctx, docOf({ id: 'z', closed: false, nodes: [N('a', 0, 0), N('b', 1, 1)] }));
  assert.ok(nf.calls.includes('strokeStyle=#000000') && !nf.calls.some((c) => c.startsWith('fill(')));
});
