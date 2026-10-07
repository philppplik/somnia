import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFStream } from 'pdf-lib';
import {
  PdfAnnotError, addAnnotationOp, exportAnnotatedPdf, listPdfAnnotations, parseAnnotOps,
  removeAnnotationOp, resolveAnnotations, serializeAnnotOps, updateAnnotationOp, rectToQuadPoints,
} from './index';

async function samplePdf(pages = 2) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([300, 400]).drawText(`Page ${i}`, { x: 20, y: 350 });
  return d.save();
}
const r = { x: 20, y: 340, width: 100, height: 14 };

test('normalizes defaults and rejects bad input', () => {
  const [a] = resolveAnnotations([addAnnotationOp('a', { kind: 'highlight', page: 0, rects: [{ x: 120, y: 354, width: -100, height: -14 }] })]);
  assert.equal(a.annotation.kind, 'highlight');
  assert.deepEqual((a.annotation as { rects: unknown[] }).rects[0], r);
  assert.equal(a.annotation.opacity, 0.4);
  assert.throws(() => addAnnotationOp('x', { kind: 'highlight', page: 0, rects: [] }), PdfAnnotError);
  assert.throws(() => addAnnotationOp('x', { kind: 'ink', page: 0, strokes: [[{ x: 1, y: 1 }]] }), PdfAnnotError);
  assert.throws(() => addAnnotationOp('x', { kind: 'note', page: -1, position: { x: 0, y: 0 } }), PdfAnnotError);
  assert.throws(() => addAnnotationOp('x', { kind: 'nope', page: 0 }), PdfAnnotError);
  assert.throws(() => addAnnotationOp('x', { kind: 'note', page: 0, position: { x: NaN, y: 0 } }), PdfAnnotError);
});

test('update, remove, disabled ops and replay order', () => {
  const ops = [
    addAnnotationOp('a', { kind: 'note', page: 0, position: { x: 10, y: 100 }, contents: 'hi' }),
    addAnnotationOp('b', { kind: 'underline', page: 1, rects: [r] }),
    updateAnnotationOp('u1', 'a', { contents: 'changed', opacity: 5 }),
    removeAnnotationOp('r1', 'b'),
    removeAnnotationOp('r2', 'missing'),
  ];
  const out = resolveAnnotations(ops);
  assert.equal(out.length, 1);
  assert.equal(out[0].annotation.contents, 'changed');
  assert.equal(out[0].annotation.opacity, 1);
  ops[3] = { ...ops[3], enabled: false };
  assert.equal(resolveAnnotations(ops).length, 2);
  assert.throws(() => updateAnnotationOp('u', 'a', { kind: 'ink' }), PdfAnnotError);
  assert.throws(() => resolveAnnotations([ops[0], ops[0]]), PdfAnnotError);
});

test('serialize round-trips and validates', () => {
  const ops = [addAnnotationOp('a', { kind: 'ink', page: 0, strokes: [[{ x: 1, y: 1 }, { x: 5, y: 9 }]], width: 3 })];
  const back = parseAnnotOps(serializeAnnotOps(ops));
  assert.deepEqual(back, ops);
  assert.throws(() => parseAnnotOps('{'), PdfAnnotError);
  assert.throws(() => parseAnnotOps('{"schema":"x","ops":[]}'), PdfAnnotError);
  assert.throws(() => parseAnnotOps(JSON.stringify({ schema: 'somnia.pdfannotate/1', ops: [{ ...ops[0], version: 9 }] })), PdfAnnotError);
});

test('quad points follow Acrobat order', () => {
  assert.deepEqual(rectToQuadPoints({ x: 1, y: 2, width: 10, height: 5 }), [1, 7, 11, 7, 1, 2, 11, 2]);
});

test('export writes real annotations of every kind and keeps the page content', async () => {
  const pdf = await samplePdf();
  const ops = [
    addAnnotationOp('h', { kind: 'highlight', page: 0, rects: [r, { ...r, y: 320 }], contents: 'Größe ✓', author: 'Phil' }),
    addAnnotationOp('u', { kind: 'underline', page: 0, rects: [r] }),
    addAnnotationOp('s', { kind: 'strikeout', page: 1, rects: [r] }),
    addAnnotationOp('n', { kind: 'note', page: 1, position: { x: 200, y: 300 }, contents: 'Note text' }),
    addAnnotationOp('d', { kind: 'ink', page: 1, strokes: [[{ x: 10, y: 10 }, { x: 50, y: 40 }, { x: 90, y: 10 }]], width: 2.5 }),
  ];
  const res = await exportAnnotatedPdf(pdf, ops);
  assert.equal(res.written, 5);
  assert.deepEqual(res.skipped, []);
  const list = await listPdfAnnotations(res.bytes);
  assert.deepEqual(list.map((a) => `${a.page}:${a.subtype}`).sort(), ['0:Highlight', '0:Underline', '1:Ink', '1:StrikeOut', '1:Text']);
  assert.equal(list.find((a) => a.subtype === 'Highlight')?.contents, 'Größe ✓');
  assert.equal(list.find((a) => a.subtype === 'Highlight')?.id, 'h');

  const doc = await PDFDocument.load(res.bytes);
  assert.equal(doc.getPageCount(), 2);
  const annots = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  const hl = annots.lookup(0, PDFDict);
  assert.equal(hl.lookup(PDFName.of('QuadPoints'), PDFArray).size(), 16);
  assert.equal(hl.lookup(PDFName.of('CA'), PDFNumber).asNumber(), 0.4);
  const ap = hl.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
  assert.match(new TextDecoder().decode(ap.getContents()), /re f/);
  const ink = doc.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray).lookup(2, PDFDict);
  assert.equal(ink.lookup(PDFName.of('InkList'), PDFArray).size(), 1);
});

test('export preserves existing annotations and does not mutate input', async () => {
  const pdf = await samplePdf(1);
  const once = await exportAnnotatedPdf(pdf, [addAnnotationOp('a', { kind: 'note', page: 0, position: { x: 5, y: 50 } })]);
  const copy = new Uint8Array(once.bytes);
  const twice = await exportAnnotatedPdf(once.bytes, [addAnnotationOp('b', { kind: 'highlight', page: 0, rects: [r] })]);
  assert.deepEqual(once.bytes, copy);
  assert.equal((await listPdfAnnotations(twice.bytes)).length, 2);
});

test('missing page is skipped and reported; bad PDF throws', async () => {
  const pdf = await samplePdf(1);
  const res = await exportAnnotatedPdf(pdf, [addAnnotationOp('x', { kind: 'note', page: 4, position: { x: 1, y: 1 } })]);
  assert.equal(res.written, 0);
  assert.equal(res.skipped[0].id, 'x');
  await assert.rejects(exportAnnotatedPdf(new Uint8Array([1, 2, 3]), []), PdfAnnotError);
});
