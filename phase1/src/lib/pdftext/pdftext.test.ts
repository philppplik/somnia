import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';
import { applyPdfTextOperations, inspectPdfText, newPdfTextOperation, patchPdfTextOperation, PdfTextError } from './index';
import { tokenize } from './lexer';

async function fixture(text = 'Hello world', fontName = StandardFonts.Helvetica) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);
  const font = await doc.embedFont(fontName);
  page.drawText(text, { x: 30, y: 100, size: 20, font, color: rgb(0.1, 0.2, 0.3) });
  return doc.save();
}
async function custom(source: string, fontChanges: Record<string, unknown> = {}) {
  const doc = await PDFDocument.create(); const page = doc.addPage([400, 200]);
  page.node.set(PDFName.of('Resources'), doc.context.obj({ Font: { F1: { Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding', ...fontChanges } } }));
  page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(source)));
  return doc.save();
}
const isCode = (code: string) => (e: unknown) => e instanceof PdfTextError && e.code === code;

test('real replacement, JSON replay, original unchanged and output reloadable', async () => {
  const input = await fixture(); const original = input.slice();
  const [run] = await inspectPdfText(input, 0);
  assert.equal(run.expectedText, 'Hello world'); assert.equal(run.font, 'Helvetica');
  const op = newPdfTextOperation('replace-1', { ...run, replacement: 'Hi world' });
  const output = await applyPdfTextOperations(input, JSON.parse(JSON.stringify([op])));
  assert.equal((await inspectPdfText(output, 0))[0].expectedText, 'Hi world');
  assert.deepEqual(input, original);
  assert.equal((await PDFDocument.load(output)).getPageCount(), 1);
});
test('all twelve Latin standard fonts supported, no silent Symbol/Dingbats fallback', async () => {
  for (const font of Object.values(StandardFonts)) {
    if (font === StandardFonts.Symbol || font === StandardFonts.ZapfDingbats) continue;
    const bytes = await fixture('Hello world', font);
    const [run] = await inspectPdfText(bytes, 0);
    const output = await applyPdfTextOperations(bytes, [newPdfTextOperation(font, { ...run, replacement: 'Hi' })]);
    assert.equal((await inspectPdfText(output, 0))[0].expectedText, 'Hi');
  }
  await assert.rejects(inspectPdfText(await custom('BT /F1 12 Tf 1 0 0 1 0 0 Tm (a) Tj ET', { BaseFont: 'Symbol' }), 0), isCode('UNSUPPORTED_FONT'));
});
test('WinAnsi accented replacement round-trips; unsupported Unicode fails', async () => {
  const bytes = await fixture('Cafe noir'); const [run] = await inspectPdfText(bytes, 0);
  const output = await applyPdfTextOperations(bytes, [newPdfTextOperation('accent', { ...run, replacement: 'Café' })]);
  assert.equal((await inspectPdfText(output, 0))[0].expectedText, 'Café');
  await assert.rejects(applyPdfTextOperations(bytes, [newPdfTextOperation('emoji', { ...run, replacement: '😀' })]), isCode('UNENCODABLE_TEXT'));
});
test('shorter edits, empty replacement and chained compare-and-swap', async () => {
  const bytes = await fixture(); const [run] = await inspectPdfText(bytes, 0);
  const first = newPdfTextOperation('one', { ...run, replacement: 'Hello' });
  const second = newPdfTextOperation('two', { ...run, expectedText: 'Hello', replacement: '' });
  assert.equal((await inspectPdfText(await applyPdfTextOperations(bytes, [first, second]), 0))[0].expectedText, '');
});
test('stale target, out-of-range run, overflow, invalid operation and disabled identity', async () => {
  const bytes = await fixture(); const [run] = await inspectPdfText(bytes, 0);
  const op = newPdfTextOperation('one', { ...run, replacement: 'Hi' });
  await assert.rejects(applyPdfTextOperations(bytes, [patchPdfTextOperation(op, { expectedText: 'Wrong' })]), isCode('STALE_TARGET'));
  await assert.rejects(applyPdfTextOperations(bytes, [patchPdfTextOperation(op, { runIndex: 99 })]), isCode('TARGET_NOT_FOUND'));
  await assert.rejects(applyPdfTextOperations(bytes, [patchPdfTextOperation(op, { replacement: 'This is definitely too long' })]), isCode('TEXT_OVERFLOW'));
  await assert.rejects(applyPdfTextOperations(bytes, [{ ...op, version: 9 } as never]), isCode('INVALID_OPERATION'));
  assert.throws(() => newPdfTextOperation('bad', { ...run, replacement: 'two\nlines' }), isCode('INVALID_OPERATION'));
  const identity = await applyPdfTextOperations(bytes, [{ ...op, enabled: false }]);
  assert.deepEqual(identity, bytes); assert.notEqual(identity, bytes);
});
test('literal escaping, octal, nested parentheses, odd hex and comments', async () => {
  const source = '% (fake) Tj\nBT /F1 12 Tf 1 0 0 1 0 0 Tm (A\\050B\\051\\040C) Tj ET';
  const bytes = await custom(source); const [run] = await inspectPdfText(bytes, 0);
  assert.equal(run.expectedText, 'A(B) C');
  const output = await applyPdfTextOperations(bytes, [newPdfTextOperation('literal', { ...run, replacement: '(Hi)' })]);
  assert.equal((await inspectPdfText(output, 0))[0].expectedText, '(Hi)');
  assert.deepEqual([...tokenize('<4>')[0].bytes!], [64]);
  assert.equal(new TextDecoder().decode(tokenize('(a(b)c)')[0].bytes!), 'a(b)c');
  assert.equal(new TextDecoder().decode(tokenize('(a\\\r\nb)')[0].bytes!), 'ab');
});
test('fail closed on complex content and unsupported font mappings', async () => {
  for (const content of [
    'BT /F1 12 Tf 1 0 0 1 0 0 Tm [(Hello) 12 (world)] TJ ET',
    'BT /F1 12 Tf 1 0 0 1 0 0 Tm (a) Tj (b) Tj ET',
    'BT /F1 12 Tf 1 0 0 1 0 0 Tm 2 Tc (a) Tj ET',
    'BT /F1 12 Tf 1 0 0 1 0 0 Tm 3 Tr (a) Tj ET',
    '/Fm1 Do', 'BI /W 1 ID data EI', 'BT /F1 12 Tf (a) Tj ET',
    'BT /F1 12 Tf 1 0 0 1 0 0 Tm (unterminated', 'q', 'Q',
  ]) await assert.rejects(inspectPdfText(await custom(content), 0), isCode('UNSUPPORTED_CONTENT'));
  for (const changes of [{ BaseFont: 'ABCDEF+Helvetica' }, { Encoding: { Type: 'Encoding', Differences: [] } }, { ToUnicode: 'Mapping' }, { FontDescriptor: {} }, { Widths: [500] }]) {
    await assert.rejects(inspectPdfText(await custom('BT /F1 12 Tf 1 0 0 1 0 0 Tm (a) Tj ET', changes), 0));
  }
});
test('ASCII-only StandardEncoding is honest about high bytes', async () => {
  const bytes = await custom('BT /F1 12 Tf 1 0 0 1 0 0 Tm (Hello) Tj ET', { Encoding: 'StandardEncoding' });
  const [run] = await inspectPdfText(bytes, 0);
  await assert.rejects(applyPdfTextOperations(bytes, [newPdfTextOperation('no', { ...run, replacement: 'é' })]), isCode('UNENCODABLE_TEXT'));
});
test('invalid PDF, missing page and cancellation', async () => {
  await assert.rejects(inspectPdfText(new Uint8Array([1, 2, 3]), 0), isCode('INVALID_PDF'));
  const bytes = await fixture(); await assert.rejects(inspectPdfText(bytes, -1), isCode('TARGET_NOT_FOUND'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(applyPdfTextOperations(bytes, [], { signal: controller.signal }), { name: 'AbortError' });
});
test('multipage exports preserve other pages and operation failures leave input untouched', async () => {
  const doc = await PDFDocument.load(await fixture());
  const font = await doc.embedFont(StandardFonts.Courier);
  doc.addPage([400, 200]).drawText('Second page', { x: 40, y: 90, font, size: 14 });
  const bytes = await doc.save(); const snapshot = bytes.slice(); const [run] = await inspectPdfText(bytes, 0);
  const good = newPdfTextOperation('good', { ...run, replacement: 'Hi' });
  const bad = patchPdfTextOperation(good, { expectedText: 'wrong' });
  await assert.rejects(applyPdfTextOperations(bytes, [good, bad]), isCode('STALE_TARGET'));
  assert.deepEqual(bytes, snapshot);
  const output = await applyPdfTextOperations(bytes, [good]);
  assert.equal((await inspectPdfText(output, 1))[0].expectedText, 'Second page');
});
test('any unsupported sibling stream blocks editing instead of guessing inherited state', async () => {
  const doc = await PDFDocument.load(await fixture()); const page = doc.getPage(0);
  const existing = page.node.Contents()!;
  const extra = doc.context.register(doc.context.flateStream('/Fm1 Do'));
  const array = doc.context.obj([]);
  if ('size' in existing) for (let i = 0; i < existing.size(); i++) array.push(existing.get(i));
  else array.push(doc.context.register(existing));
  array.push(extra); page.node.set(PDFName.of('Contents'), array);
  const bytes = await doc.save();
  await assert.rejects(applyPdfTextOperations(bytes, [newPdfTextOperation('no', { pageIndex: 0, streamIndex: 0, runIndex: 0, expectedText: 'Hello world', replacement: 'Hi' })]), isCode('UNSUPPORTED_CONTENT'));
});
