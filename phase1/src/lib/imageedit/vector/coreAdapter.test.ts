import test from 'node:test';
import assert from 'node:assert/strict';
import { coreToScene, sceneToCore } from './flatAdapter';
import type { VectorDocument } from '../../vectorcore/types';

const doc: VectorDocument = { width: 100, height: 100, paths: [{ id: 'p', closed: false,
  nodes: [{ id: 'n1', x: 0, y: 0, kind: 'corner' }, { id: 'n2', x: 10, y: 0, kind: 'smooth', in: { x: 5, y: 0 } }],
  fill: '#ff0000', stroke: null, strokeWidth: 2, fillRule: 'evenodd' }] };

test('explicit core boundary reads top-level paints, not vectorio style defaults', () => {
  const result = coreToScene(doc), p = result.value.nodes.p;
  assert.equal(p.kind, 'path');
  if (p.kind !== 'path') throw new Error('expected path');
  assert.deepEqual(p.style.fill, { kind: 'solid', rgba: [255, 0, 0, 1] });
  assert.equal(p.style.stroke.kind, 'none');
  assert.equal(p.style.fillRule, 'evenodd');
  const back = sceneToCore(result.value);
  assert.equal(back.value.paths[0].fill, '#ff0000');
  assert.equal(back.value.paths[0].stroke, null);
  assert.deepEqual(back.value.paths[0].nodes[1].in, { x: 5, y: 0 });
});

test('core missing styles match renderer: no fill, black 1px stroke; null disables stroke', () => {
  const p = doc.paths[0], { fill: _f, stroke: _s, strokeWidth: _w, ...bare } = p;
  const result = sceneToCore(coreToScene({ ...doc, paths: [bare] }).value).value.paths[0];
  assert.equal(result.fill, null);
  assert.equal(result.stroke, '#000000');
  assert.equal(result.strokeWidth, 1);
});

test('core export reports alpha loss and narrows symmetric nodes to smooth', () => {
  const result = sceneToCore(coreToScene({ ...doc, paths: [{ ...doc.paths[0], fill: '#ff000080',
    nodes: [{ id: 'a', x: 0, y: 0, kind: 'smooth', out: { x: 5, y: 0 } }, { id: 'b', x: 10, y: 0, kind: 'smooth', in: { x: 5, y: 0 }, out: { x: 15, y: 0 } }, { id: 'c', x: 20, y: 0, kind: 'corner' }] }] }).value);
  assert.equal(result.value.paths[0].nodes[1].kind, 'smooth');
  assert.ok(result.warnings.some((w) => /opacity/.test(w.message)));
});
