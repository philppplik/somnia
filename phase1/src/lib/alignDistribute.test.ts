import test from 'node:test';
import assert from 'node:assert/strict';
import {alignDeltas, distributeDeltas, gapGuides, edgeGuides, shiftStyle, type Box} from './alignDistribute';

const A: Box = {id: 'a', x: 10, y: 10, w: 40, h: 20};
const B: Box = {id: 'b', x: 100, y: 50, w: 60, h: 40};
const C: Box = {id: 'c', x: 300, y: 20, w: 20, h: 20};

test('align left/right/top/bottom use the selection bounds', () => {
  assert.deepEqual(alignDeltas([A, B], 'left'), [{id: 'b', dx: -90, dy: 0}]);
  assert.deepEqual(alignDeltas([A, B], 'right'), [{id: 'a', dx: 110, dy: 0}]);
  assert.deepEqual(alignDeltas([A, B], 'top'), [{id: 'b', dx: 0, dy: -40}]);
  assert.deepEqual(alignDeltas([A, B], 'bottom'), [{id: 'a', dx: 0, dy: 60}]);
});
test('align centre and middle', () => {
  const d = alignDeltas([A, B], 'hcenter');
  assert.equal(d.length, 2);
  assert.equal(d[0].dx + A.x + A.w / 2, d[1].dx + B.x + B.w / 2 );
  const m = alignDeltas([A, B], 'vmiddle');
  assert.equal(m[0].dy + A.y + A.h / 2, m[1].dy + B.y + B.h / 2);
});
test('align drops zero moves and needs two boxes', () => {
  assert.deepEqual(alignDeltas([A, {...B, x: 10}], 'left'), []);
  assert.deepEqual(alignDeltas([A], 'left'), []);
});
test('distribute keeps the outer boxes and equalises gaps', () => {
  const d = distributeDeltas([A, B, C], 'h');
  assert.equal(d.length, 1);
  const gap = (300 - 50 - 60) / 2;
  assert.equal(d[0].id, 'b');
  assert.equal(10 + 40 + gap, B.x + d[0].dx);
  assert.deepEqual(distributeDeltas([A, B], 'h'), []);
});
test('distribute vertically works on unsorted input', () => {
  const v = distributeDeltas([{id: 'z', x: 0, y: 200, w: 10, h: 10}, {id: 'y', x: 0, y: 0, w: 10, h: 10}, {id: 'x', x: 0, y: 20, w: 10, h: 10}], 'v');
  assert.deepEqual(v, [{id: 'x', dx: 0, dy: 80}]);
});
test('gap guides measure neighbours that overlap on the cross axis, and flag equal gaps', () => {
  const g = gapGuides([{id: 'a', x: 0, y: 0, w: 10, h: 10}, {id: 'b', x: 20, y: 0, w: 10, h: 10}, {id: 'c', x: 40, y: 0, w: 10, h: 10}]);
  assert.equal(g.length, 2);
  assert.ok(g.every(x => x.axis === 'h' && x.gap === 10 && x.equal));
  assert.deepEqual(gapGuides([A, {id: 'q', x: 200, y: 500, w: 5, h: 5}]), []);
});
test('edge guides find shared edges and centres', () => {
  const g = edgeGuides([{id: 'a', x: 0, y: 0, w: 10, h: 10}, {id: 'b', x: 0, y: 30, w: 10, h: 20}]);
  assert.ok(g.some(x => x.axis === 'x' && x.pos === 0));
  assert.ok(g.some(x => x.axis === 'x' && x.pos === 10));
  assert.deepEqual(edgeGuides([A]), []);
});
test('shiftStyle by position kind', () => {
  assert.deepEqual(shiftStyle({position: 'static', left: 'auto', top: 'auto'}, 12, 0), {position: 'relative', left: '12px'});
  assert.deepEqual(shiftStyle({position: 'relative', left: '5px', top: '0px'}, -8, 3), {left: '-3px', top: '3px'});
  assert.deepEqual(shiftStyle({position: 'absolute', left: '100px', top: '40px'}, 0, 10), {top: '50px', bottom: 'auto'});
});
