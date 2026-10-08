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
