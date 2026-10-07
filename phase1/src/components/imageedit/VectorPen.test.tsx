import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { PenToolEditor, appendNode, convertNodes, deleteNodes, insertNode, moveHandle, moveNodes, pathData, penHandles, removeHandles, segmentPoint, selectInRect, type VectorDocument } from '../vectoredit';

const fixture = (): VectorDocument => ({ width: 640, height: 400, paths: [{ id: 'path', closed: false, nodes: [
  { id: 'a', x: 10, y: 20, kind: 'corner' }, { id: 'b', x: 110, y: 120, kind: 'corner' },
] }] });
const ref = { pathId: 'path', nodeId: 'a' };
test('pen click appends corner without mutating source; drag creates mirrored smooth handles', () => {
  const source = fixture(), snapshot = JSON.stringify(source);
  const added = appendNode(source, 'new', { id: 'c', x: 50, y: 60, kind: 'corner' });
  assert.equal(added.paths[1].nodes[0].kind, 'corner');
  const smooth = penHandles(source, ref, { x: 40, y: 30 }).paths[0].nodes[0];
  assert.equal(smooth.kind, 'smooth'); assert.deepEqual(smooth.in, { x: -20, y: 10 });
  assert.deepEqual(smooth.out, { x: 40, y: 30 }); assert.equal(JSON.stringify(source), snapshot);
});
test('anchor movement translates both handles and only selected anchors', () => {
  const source = penHandles(fixture(), ref, { x: 40, y: 30 });
  const moved = moveNodes(source, [ref], { x: 5, y: -10 });
  assert.deepEqual(moved.paths[0].nodes[0].in, { x: -15, y: 0 });
  assert.deepEqual(moved.paths[0].nodes[0].out, { x: 45, y: 20 });
  assert.deepEqual(moved.paths[0].nodes[1], source.paths[0].nodes[1]);
});
test('symmetric handles mirror; Alt breaks symmetry and leaves other handle untouched', () => {
  const source = penHandles(fixture(), ref, { x: 40, y: 30 });
  const linked = moveHandle(convertNodes(source, [ref], 'symmetric'), ref, 'in', { x: 0, y: 0 }).paths[0].nodes[0];
  assert.deepEqual(linked.out, { x: 20, y: 40 });
  const broken = moveHandle(source, ref, 'in', { x: 0, y: 0 }, true).paths[0].nodes[0];
  assert.equal(broken.kind, 'corner'); assert.deepEqual(broken.out, { x: 40, y: 30 });
});
test('corner/smooth conversion creates and removes handles, without touching other nodes', () => {
  const smooth = convertNodes(fixture(), [ref], 'smooth');
  assert.ok(smooth.paths[0].nodes[0].in); assert.ok(smooth.paths[0].nodes[0].out);
  const corner = removeHandles(convertNodes(smooth, [ref], 'corner'), [ref]).paths[0].nodes[0];
  assert.equal(corner.kind, 'corner'); assert.equal(corner.in, undefined); assert.equal(corner.out, undefined);
});
test('marquee works in every drag direction and includes boundaries', () => {
  const doc = fixture();
  assert.deepEqual(selectInRect(doc, { x: 110, y: 120 }, { x: 10, y: 20 }), [ref, { pathId: 'path', nodeId: 'b' }]);
  assert.deepEqual(selectInRect(doc, { x: 11, y: 21 }, { x: 109, y: 119 }), []);
});
test('subdivision retains cubic shape exactly on both halves', () => {
  const source = fixture(); source.paths[0].nodes[0].out = { x: 180, y: -50 }; source.paths[0].nodes[1].in = { x: -60, y: 190 };
  const t = 0.37, split = insertNode(source, 'path', 0, t, 'inserted');
  assert.equal(split.paths[0].nodes.length, 3);
  for (let i = 0; i <= 20; i++) {
    const u = i / 20, expected = segmentPoint(source.paths[0], 0, u);
    const actual = u <= t ? segmentPoint(split.paths[0], 0, u / t) : segmentPoint(split.paths[0], 1, (u - t) / (1 - t));
    assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-9);
  }
});
test('closed closing segment insertion and deletion maintain valid path topology', () => {
  const doc = fixture(); doc.paths[0].closed = true; doc.paths[0].nodes.push({ id: 'c', x: 200, y: 20, kind: 'corner' });
  const split = insertNode(doc, 'path', 2, 0.5, 'closing');
  assert.equal(split.paths[0].nodes.at(-1)?.id, 'closing'); assert.ok(split.paths[0].closed);
  const deleted = deleteNodes(doc, [ref]); assert.equal(deleted.paths[0].closed, false);
  assert.equal(deleteNodes(fixture(), [ref, { pathId: 'path', nodeId: 'b' }]).paths.length, 0);
  assert.match(pathData(doc.paths[0]), / Z$/);
});
test('editor renders accessible controls, disabled gate and selected node affordances', () => {
  const html = renderToStaticMarkup(<PenToolEditor value={fixture()} onChange={() => {}} disabled />);
  assert.match(html, /aria-label="Vector tools"/); assert.match(html, /aria-disabled="true"/);
  assert.match(html, /data-testid="vector-canvas"/); assert.match(html, /data-vector-hit="anchor"/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 8);
});

test('smooth preserves opposite length, symmetric matches length, corner keeps independent handles', () => {
  const doc = penHandles(fixture(), ref, { x: 40, y: 30 });
  const smooth = moveHandle(doc, ref, 'out', { x: 70, y: 20 }).paths[0].nodes[0];
  assert.ok(Math.abs(Math.hypot(smooth.in!.x - smooth.x, smooth.in!.y - smooth.y) - Math.sqrt(1000)) < 1e-9);
  const symmetric = moveHandle(convertNodes(doc, [ref], 'symmetric'), ref, 'out', { x: 70, y: 20 }).paths[0].nodes[0];
  assert.deepEqual(symmetric.in, { x: -50, y: 20 });
  assert.deepEqual(convertNodes(doc, [ref], 'corner').paths[0].nodes[0].out, { x: 40, y: 30 });
});
