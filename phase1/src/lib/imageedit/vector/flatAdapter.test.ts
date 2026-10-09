import test from 'node:test';
import assert from 'node:assert/strict';
import { flatToScene, sceneToFlat, paintFromFlat } from './flatAdapter';
import { validateScene } from './scene';
import type { VectorDocument } from '../../vectorio/types';
import { importSvg, exportSvg } from '../../vectorio';

const doc: VectorDocument = {
  width: 100, height: 50,
  paths: [
    { id: 'a', closed: true, nodes: [{ id: '1', x: 0, y: 0, kind: 'corner' }, { id: '2', x: 10, y: 0, kind: 'corner', out: { x: 15, y: 5 } }, { id: '3', x: 10, y: 10, kind: 'corner', in: { x: 15, y: 8 } }], style: { fill: '#ff0000', fillOpacity: 0.5, stroke: 'none' }, layer: 'Layer 1', name: 'Tri' },
    { id: 'b', closed: false, nodes: [{ id: '4', x: 1, y: 1, kind: 'corner' }, { id: '5', x: 2, y: 2, kind: 'corner' }], style: { stroke: 'blue', strokeWidth: 2, fill: 'none' }, hidden: true },
    { id: 'h1', closed: true, compound: 'k', nodes: [{ id: '6', x: 0, y: 0, kind: 'corner' }, { id: '7', x: 9, y: 0, kind: 'corner' }, { id: '8', x: 9, y: 9, kind: 'corner' }] },
    { id: 'h2', closed: true, compound: 'k', nodes: [{ id: '9', x: 2, y: 2, kind: 'corner' }, { id: '10', x: 4, y: 2, kind: 'corner' }, { id: '11', x: 4, y: 4, kind: 'corner' }] },
  ],
};

test('flat -> scene: layers, compound, hidden, alpha', () => {
  const { value: s, warnings } = flatToScene(doc);
  assert.deepEqual(warnings, []);
  validateScene(s);
  assert.equal(s.roots.length, 3);
  const g = s.nodes[s.roots[0]];
  assert.equal(g.kind, 'group'); assert.equal(g.name, 'Layer 1');
  const a = s.nodes.a as any;
  assert.equal(a.style.fill.rgba[3], 0.5);
  assert.equal(a.segments.filter((x: any) => x.kind === 'C').length, 1);
  assert.equal(a.segments.at(-1).kind, 'Z');
  assert.equal((s.nodes.b as any).visible, false);
  const comp = s.nodes.h1 as any;
  assert.equal(comp.segments.filter((x: any) => x.kind === 'M').length, 2);
  assert.equal(s.nodes.h2, undefined);
});

test('scene -> flat -> scene keeps geometry, layers, compound', () => {
  const s1 = flatToScene(doc).value;
  const f = sceneToFlat(s1).value;
  assert.equal(f.width, 100);
  assert.equal(f.paths.length, 4);
  assert.equal(f.paths.filter((p) => p.compound).length, 2);
  assert.equal(f.paths.find((p) => p.name === 'Tri')!.layer, 'Layer 1');
  const s2 = flatToScene(f).value;
  assert.equal(Object.keys(s2.nodes).length, Object.keys(s1.nodes).length);
});

test('transforms are baked, shapes become paths, group opacity multiplied with a warning', () => {
  const s = validateScene({
    viewBox: [10, 10, 100, 100], outputSize: { width: 100, height: 100 }, roots: ['g'],
    nodes: {
      g: { id: 'g', name: 'G', kind: 'group', children: ['r'], transform: [1, 0, 0, 1, 5, 0], opacity: 0.5, visible: true, locked: false },
      r: { id: 'r', name: 'R', kind: 'rect', x: 20, y: 20, width: 10, height: 10, rx: 0, ry: 0, transform: [2, 0, 0, 2, 0, 0], opacity: 0.5, visible: true, locked: false,
        style: { fill: { kind: 'solid', rgba: [0, 255, 0, 1] }, stroke: { kind: 'none' }, strokeWidth: 1, fillRule: 'nonzero', lineCap: 'butt', lineJoin: 'miter', miterLimit: 4, dash: [], dashOffset: 0 } },
    },
  });
  const r = sceneToFlat(s);
  const p = r.value.paths[0];
  // world = translate(5,0) * scale(2); origin shift -10: x = 2*20+5-10 = 35, y = 2*20-10 = 30
  assert.deepEqual([p.nodes[0].x, p.nodes[0].y], [35, 30]);
  assert.equal(p.nodes.length, 4); assert.equal(p.closed, true);
  assert.equal(p.style!.opacity, 0.25); assert.equal(p.layer, 'G');
  assert.equal(r.warnings.length, 1);
});

test('unsupported paint becomes none with a warning; limits throw', () => {
  const w: string[] = [];
  assert.deepEqual(paintFromFlat('url(#g)', 1, (m) => w.push(m), 'fill'), { kind: 'none' });
  assert.equal(w.length, 1);
  const many: VectorDocument = { width: 1, height: 1, paths: Array.from({ length: 10_001 }, (_, i) => ({ id: `p${i}`, closed: false, nodes: [{ id: 'a', x: 0, y: 0, kind: 'corner' as const }, { id: 'b', x: 1, y: 1, kind: 'corner' as const }] })) };
  assert.throws(() => flatToScene(many), RangeError);
});

test('real SVG import -> scene -> flat -> export keeps path count', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><g id="L"><path d="M0 0 L10 0 A5 5 0 0 1 20 10 Z" fill="#00f"/></g><circle cx="20" cy="20" r="5" fill="red"/></svg>';
  const imp = importSvg(svg);
  const sc = flatToScene(imp.doc).value;
  const back = sceneToFlat(sc).value;
  assert.ok(back.paths.length >= 2);
  assert.match(exportSvg(back), /<path/);
});

test('layer runs preserve paint order instead of moving later paths before intervening roots', () => {
  const paths = ['a', 'b', 'c', 'd'].map((id, i) => ({ ...doc.paths[1], id, name: id, hidden: undefined, layer: i === 1 ? undefined : 'Same' }));
  const scene = flatToScene({ ...doc, paths }).value;
  assert.equal(scene.roots.length, 3);
  assert.deepEqual(sceneToFlat(scene).value.paths.map((p) => p.id), ['a', 'b', 'c', 'd']);
});

test('reserved, duplicate and generated-id collisions are deterministic and safe', () => {
  const paths = ['constructor', 'toString', '__proto__', 'n1', 'n1', ''].map((id) => ({ ...doc.paths[1], id, layer: 'L' }));
  const result = flatToScene({ ...doc, paths }).value;
  validateScene(result);
  assert.equal(Object.keys(result.nodes).length, 7);
  assert.deepEqual(result, flatToScene({ ...doc, paths }).value);
});

test('supported CSS colours include shorthand and rgb/rgba', () => {
  const warnings: string[] = [], warn = (m: string) => warnings.push(m);
  assert.deepEqual(paintFromFlat('#0f08', 0.5, warn, 'fill'), { kind: 'solid', rgba: [0, 255, 0, 0.267] });
  assert.deepEqual(paintFromFlat('rgba(255,0,128,0.5)', 1, warn, 'fill'), { kind: 'solid', rgba: [255, 0, 128, 0.502] });
  assert.deepEqual(warnings, []);
});

test('invalid dimensions and style values fail rather than silently clamping', () => {
  for (const width of [0, -1, NaN, Infinity, 100_001]) assert.throws(() => flatToScene({ ...doc, width }));
  for (const style of [{ opacity: NaN }, { strokeWidth: -1 }, { dashArray: [-1] }, { dashArray: [0, 0] }, { fillOpacity: 2 }])
    assert.throws(() => flatToScene({ ...doc, paths: [{ ...doc.paths[0], style }] }));
});

test('single-anchor closed cubic retains both handles', () => {
  const input: VectorDocument = { width: 20, height: 20, paths: [{ id: 'loop', closed: true,
    nodes: [{ id: 'n', x: 0, y: 0, kind: 'corner', in: { x: 10, y: 0 }, out: { x: 0, y: 10 } }] }] };
  const back = sceneToFlat(flatToScene(input).value).value.paths[0];
  assert.equal(back.nodes.length, 1);
  assert.deepEqual(back.nodes[0].in, { x: 10, y: 0 });
  assert.deepEqual(back.nodes[0].out, { x: 0, y: 10 });
});

test('compound first-contour semantics match vectorio and warn about conflicting metadata', () => {
  const first = { ...doc.paths[0], compound: '', id: 'one' };
  const second = { ...doc.paths[1], compound: '', id: 'two' };
  const result = flatToScene({ ...doc, paths: [first, second] });
  assert.equal(Object.keys(result.value.nodes).length, 2);
  assert.match(result.warnings[0].message, /first contour/);
});

test('export preserves first-contour identity and avoids split-contour ID collisions', () => {
  const scene = flatToScene({ ...doc, paths: [{ ...doc.paths[0], id: 'p1' }, ...doc.paths.slice(2)] }).value;
  const flat = sceneToFlat(scene).value;
  assert.equal(flat.paths[0].id, 'p1');
  assert.equal(flat.paths[1].id, 'h1');
  assert.equal(new Set(flat.paths.map((p) => p.id)).size, flat.paths.length);
});

function transformedScene(transform: readonly [number, number, number, number, number, number], groupOpacity = 1) {
  const base = flatToScene({ ...doc, paths: [{ ...doc.paths[1], hidden: undefined, layer: 'L', style: { stroke: 'blue', strokeWidth: 2, dashArray: [2, 4], dashOffset: 1 } }] }).value;
  const g = base.roots[0];
  return validateScene({ ...base, nodes: { ...base.nodes, [g]: { ...base.nodes[g], transform, opacity: groupOpacity } } });
}

test('uniform/reflected world scale also scales stroke and dash metrics', () => {
  const result = sceneToFlat(transformedScene([-3, 0, 0, 3, 0, 0]));
  assert.equal(result.value.paths[0].style!.strokeWidth, 6);
  assert.deepEqual(result.value.paths[0].style!.dashArray, [6, 12]);
  assert.equal(result.value.paths[0].style!.dashOffset, 3);
  assert.deepEqual(result.warnings, []);
});

test('group opacity is reported even when all descendant shape opacities are one', () => {
  const result = sceneToFlat(transformedScene([1, 0, 0, 1, 0, 0], 0));
  assert.equal(result.value.paths[0].style!.opacity, 0);
  assert.match(result.warnings[0].message, /Group opacity/);
});

test('anisotropic stroke, output-size differences, locks and nested/empty groups warn', () => {
  const base = transformedScene([2, 0, 0, 1, 0, 0]);
  const result = sceneToFlat(validateScene({ ...base, outputSize: { width: 200, height: 100 }, nodes: { ...base.nodes, b: { ...base.nodes.b, locked: true } } }));
  assert.equal(result.value.paths[0].style!.strokeWidth, 2);
  assert.equal(result.warnings.length, 3);
  const g = base.roots[0];
  const nested = validateScene({ ...base, nodes: { ...base.nodes, [g]: { ...base.nodes[g], kind: 'group', children: ['empty', 'b'] },
    empty: { ...base.nodes[g], id: 'empty', kind: 'group', children: [] } } });
  assert.ok(sceneToFlat(nested).warnings.some((w) => /Nested groups/.test(w.message)));
  assert.ok(sceneToFlat(nested).warnings.some((w) => /Empty groups/.test(w.message)));
});

test('adapter does not mutate inputs and validated scenes are deeply frozen', () => {
  const original = structuredClone(doc), scene = flatToScene(doc).value;
  assert.deepEqual(doc, original);
  assert.ok(Object.isFrozen(scene.nodes.a));
  const before = JSON.stringify(scene);
  const flat = sceneToFlat(scene).value;
  flat.paths[0].nodes[0].x = 999;
  flat.paths[0].style!.dashArray!.push(9);
  assert.equal(JSON.stringify(scene), before);
});

test('quad and arc conversion bakes controls and endpoints through world matrix', () => {
  const base = flatToScene({ ...doc, paths: [doc.paths[1]] }).value;
  const shape = base.nodes.b;
  const scene = validateScene({ ...base, viewBox: [5, 7, 100, 50], nodes: { b: { ...shape, transform: [2, 0, 0, 2, 3, 4],
    kind: 'path', segments: [{ kind: 'M', x: 0, y: 0 }, { kind: 'Q', x1: 3, y1: 6, x: 6, y: 0 }, { kind: 'A', rx: 3, ry: 3, rotation: 0, largeArc: false, sweep: true, x: 12, y: 0 }] } } });
  const nodes = sceneToFlat(scene).value.paths[0].nodes;
  assert.deepEqual(nodes[0].out, { x: 2, y: 5 });
  assert.deepEqual(nodes[1].in, { x: 6, y: 5 });
  assert.deepEqual([nodes.at(-1)!.x, nodes.at(-1)!.y], [22, -3]);
  assert.ok(nodes.length > 2);
});

test('ellipse, polygon and line become flat contours without losing closed state', () => {
  const base = flatToScene({ ...doc, paths: [doc.paths[1]] }).value;
  const node = base.nodes.b;
  if (node.kind !== 'path') throw new Error('expected path');
  const { segments: _segments, kind: _kind, ...common } = node;
  const scene = validateScene({ ...base, roots: ['ellipse', 'polygon', 'line'], nodes: {
    ellipse: { ...common, id: 'ellipse', kind: 'ellipse', cx: 20, cy: 20, rx: 5, ry: 8 },
    polygon: { ...common, id: 'polygon', kind: 'polygon', cx: 20, cy: 20, radius: 8, sides: 5, rotation: 0 },
    line: { ...common, id: 'line', kind: 'line', x1: 0, y1: 0, x2: 4, y2: 6 },
  } });
  const flat = sceneToFlat(scene).value;
  assert.deepEqual(flat.paths.map((p) => [p.id, p.closed, p.nodes.length]), [['ellipse', true, 4], ['polygon', true, 5], ['line', false, 2]]);
  assert.ok(flat.paths[0].nodes.every((n) => n.in && n.out));
});

test('generated layer IDs never steal a later valid path ID', () => {
  const scene = flatToScene({ ...doc, paths: [{ ...doc.paths[1], id: 'a', layer: 'L' }, { ...doc.paths[1], id: 'n1' }] }).value;
  assert.equal(scene.nodes.n1.kind, 'path');
});

test('prototype-like paint names are unsupported, not object prototype lookups', () => {
  const warnings: string[] = [];
  for (const name of ['constructor', 'toString', '__proto__'])
    assert.deepEqual(paintFromFlat(name, 1, (m) => warnings.push(m), 'fill'), { kind: 'none' });
  assert.equal(warnings.length, 3);
});

test('compound segment limit is enforced after subpaths are combined', () => {
  const nodes = Array.from({ length: 50_000 }, (_, i) => ({ id: `n${i}`, x: i, y: 0, kind: 'corner' as const }));
  const path = { id: 'a', closed: false, compound: 'c', nodes };
  assert.throws(() => flatToScene({ width: 100, height: 100, paths: [path, { ...path, id: 'b' }, { ...path, id: 'c' }] }), RangeError);
});
