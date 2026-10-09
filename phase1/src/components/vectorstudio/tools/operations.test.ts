import test from 'node:test';
import assert from 'node:assert/strict';
import { importSvg } from '../../../lib/vectorio';
import { deleteSelection, deleteSelectedNodes, hitTestObject, pathBounds, resizeSelection, rotateSelection, scaleSelection, selectedPaths, selectPathsInRect, selectionBounds, setNodeHandle, setNodeKind, splitPathSegment, straightenNodes, togglePathSelection, translateNodes, translateSelection } from './operations';
import { readSvgFile, svgExportSource } from './svgIO';
const rect = (x = 10, y = 20, width = 30, height = 40) => importSvg(`<svg width="100" height="100"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="red"/></svg>`).doc;
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('exact bounds include curve extrema, not handle box', () => {
  const doc = importSvg('<svg width="100" height="100"><path d="M0 0 C0 100 100 100 100 0"/></svg>').doc;
  assert.deepEqual(pathBounds(doc.paths[0]), { minX: 0, minY: 0, maxX: 100, maxY: 75 });
});
test('selection translation is immutable and preserves metadata', () => {
  const doc = rect(), source = JSON.stringify(doc); doc.paths[0].name = 'Logo'; const next = translateSelection(doc, ['missing'], 10, -10);
  // import IDs are zero-based, do not hardcode them in operation consumers.
  const actual = translateSelection(doc, [doc.paths[0].id], 10, -10);
  assert.deepEqual(selectionBounds(actual, [doc.paths[0].id]), { x: 20, y: 10, width: 30, height: 40 });
  assert.equal(actual.paths[0].name, 'Logo'); assert.equal(actual.paths[0].style?.fill, 'red'); assert.notEqual(actual, doc);
  assert.equal(next.paths[0], doc.paths[0]); assert.equal(JSON.stringify({ ...doc, paths: doc.paths.map(p => { const { name: _, ...rest } = p; return rest; }) }), source);
});
test('transform changes absolute handles, retains stroke width', () => {
  const doc = importSvg('<svg width="100" height="100"><path d="M0 0 C0 100 100 100 100 0" stroke="red" stroke-width="4"/></svg>').doc;
  const id = doc.paths[0].id, scaled = scaleSelection(doc, [id], 2, 3, { x: 0, y: 0 });
  assert.deepEqual(scaled.paths[0].nodes[0].out, { x: 0, y: 300 }); assert.equal(scaled.paths[0].style?.strokeWidth, 4);
});
test('resize, rotation and flip use explicit origins', () => {
  const doc = rect(), ids = [doc.paths[0].id]; assert.deepEqual(selectionBounds(resizeSelection(doc, ids, 60, 20), ids), { x: 10, y: 20, width: 60, height: 20 });
  const box = selectionBounds(rotateSelection(doc, ids, 90), ids)!; close(box.x, 5); close(box.y, 25); close(box.width, 40); close(box.height, 30);
  assert.deepEqual(selectionBounds(scaleSelection(doc, ids, -1, 1, { x: 25, y: 40 }), ids), selectionBounds(doc, ids));
});
test('compound contours select, toggle, transform and delete as one object', () => {
  const doc = importSvg('<svg width="100" height="100"><path d="M0 0L40 0L40 40L0 40Z M10 10L30 10L30 30L10 30Z" fill-rule="evenodd"/></svg>').doc;
  const ids = doc.paths.map(p => p.id); assert.equal(ids.length, 2); assert.deepEqual(togglePathSelection(doc, [], ids[0]), ids);
  assert.deepEqual(togglePathSelection(doc, ids, ids[1], true), []); assert.equal(selectedPaths(doc, [ids[1]]).length, 2);
  assert.equal(deleteSelection(doc, [ids[0]]).paths.length, 0); assert.deepEqual(selectPathsInRect(doc, { x: 9, y: 9 }, { x: 31, y: 31 }, true), ids);
  assert.equal(hitTestObject(doc, { x: 20, y: 20 }), null); assert.ok(hitTestObject(doc, { x: 5, y: 5 }));
});
test('marquee overlap versus containment and hidden paths', () => {
  const doc = rect(), id = doc.paths[0].id;
  assert.deepEqual(selectPathsInRect(doc, { x: 15, y: 25 }, { x: 20, y: 30 }), [id]); assert.deepEqual(selectPathsInRect(doc, { x: 15, y: 25 }, { x: 20, y: 30 }, true), []);
  doc.paths[0].hidden = true; assert.equal(selectionBounds(doc, [id]), null); assert.equal(hitTestObject(doc, { x: 20, y: 30 }), null);
});
test('hit test respects z-order, fill and stroke', () => {
  const doc = importSvg('<svg width="100" height="100"><rect width="50" height="50"/><rect x="10" y="10" width="20" height="20" fill="blue"/><line x1="0" y1="70" x2="50" y2="70" stroke="red" stroke-width="4"/></svg>').doc;
  assert.equal(hitTestObject(doc, { x: 20, y: 20 }), doc.paths[1].id); assert.equal(hitTestObject(doc, { x: 20, y: 70 }), doc.paths[2].id); assert.equal(hitTestObject(doc, { x: 100, y: 100 }), null);
});
test('node helpers preserve styles and coupled handle symmetry', () => {
  const doc = rect(), ref = { pathId: doc.paths[0].id, nodeId: doc.paths[0].nodes[0].id };
  const smooth = setNodeKind(doc, [ref], 'symmetric'), node = smooth.paths[0].nodes[0]; assert.ok(node.in && node.out);
  const edited = setNodeHandle(smooth, ref, 'out', { x: node.x + 20, y: node.y + 10 }); assert.deepEqual(edited.paths[0].nodes[0].in, { x: node.x - 20, y: node.y - 10 });
  const moved = translateNodes(edited, [ref], 5, 6); assert.deepEqual(moved.paths[0].nodes[0].out, { x: node.x + 25, y: node.y + 16 }); assert.deepEqual(moved.paths[0].style, doc.paths[0].style);
  assert.equal(straightenNodes(moved, [ref]).paths[0].nodes[0].out, undefined); assert.equal(deleteSelectedNodes(doc, [ref]).paths[0].nodes.length, 3);
});
test('curve splitting is exact and validates identities', () => {
  const doc = importSvg('<svg width="100" height="100"><path d="M0 0 C0 100 100 100 100 0"/></svg>').doc, id = doc.paths[0].id;
  const split = splitPathSegment(doc, id, 0, 0.5, 'new'); assert.equal(split.paths[0].nodes.length, 3); assert.deepEqual(split.paths[0].nodes[1], { id: 'new', x: 50, y: 75, kind: 'smooth', in: { x: 25, y: 75 }, out: { x: 75, y: 75 } });
  assert.throws(() => splitPathSegment(doc, id, 0, 0, 'new')); assert.throws(() => splitPathSegment(doc, id, 0, 0.5, doc.paths[0].nodes[0].id));
});
test('invalid transforms cannot poison a document', () => {
  const doc = rect(), ids = [doc.paths[0].id]; assert.throws(() => translateSelection(doc, ids, NaN, 0)); assert.throws(() => scaleSelection(doc, ids, 0, 1, { x: 0, y: 0 })); assert.throws(() => resizeSelection(doc, ids, -1, 30));
});
test('strict SVG file import rejects unsafe or unsupported content', async () => {
  await assert.rejects(readSvgFile({ size: 9 * 1024 * 1024, text: async () => '' }), /limit/);
  await assert.rejects(readSvgFile({ size: 100, text: async () => '<svg><script>alert(1)</script></svg>' }));
  await assert.rejects(readSvgFile({ size: 100, text: async () => '<svg><text>Hello</text></svg>' }));
  const result = await readSvgFile({ size: 100, text: async () => '<svg width="30" height="40"><rect width="20" height="20"/></svg>' }); assert.equal(result.doc.width, 30);
});
test('SVG export/import is stable and rejects invalid geometry', () => {
  const source = svgExportSource(rect()); assert.equal(svgExportSource(importSvg(source).doc), source);
  assert.throws(() => svgExportSource({ width: NaN, height: 100, paths: [] }));
  const doc = rect(); doc.paths[0].nodes[0].x = Infinity; assert.throws(() => svgExportSource(doc));
});
