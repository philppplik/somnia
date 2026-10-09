/**
 * Golden tests for the PDF markup studio AS IT BEHAVES TODAY (checkout 1d014e1).
 *
 * Rule: these tests document current behavior, including behavior that looks questionable.
 * Questionable pins are tagged `OBSERVED-QUIRK`. They are not endorsements: when a swarm change
 * alters one of them on purpose, update the assertion in the same PR and say so in the PR text.
 * Run: npx tsx --test test/pdf-qa/*.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFArray } from 'pdf-lib';
import { applyPdfEdit, inspectPdf } from '../../src/lib/pdfedit/backend.ts';
import { exportAnnotatedPdf, listPdfAnnotations } from '../../src/lib/pdfannotate/export.ts';
import { readFormFields, fillForm, flattenForm, hasForm } from '../../src/lib/pdfforms/index.ts';
import { inspectPdfText } from '../../src/lib/pdftext/index.ts';
import { loadPdf, looksLikePdf } from '../../src/lib/pdfview/index.ts';
import { createPdfjsBackend } from '../../src/lib/pdfview/pdfjsBackend.ts';
import * as F from './fixtures.ts';

// Node < 24 lacks Promise.try, which pdf.js 6 uses (same shim as pdfjsBackend.test.ts).
if (!('try' in Promise)) (Promise as unknown as Record<string, unknown>).try = (f: () => unknown) => new Promise((r) => r(f()));
const pdfjs = createPdfjsBackend(undefined, () => import('pdfjs-dist/legacy/build/pdf.mjs') as never);

const hl = (page: number, contents = 'hl') => ({
  kind: 'highlight' as const, page, color: [1, 1, 0] as const, opacity: 0.4, contents, author: '',
  rects: [{ x: 10, y: 20, width: 80, height: 15 }],
});
const pageOrderByWidth = async (b: Uint8Array) => (await inspectPdf(b)).pages.map((p) => `${p.width}x${p.height}`);

describe('inspectPdf: summary of every fixture', () => {
  const expectations: Record<string, Partial<{ pages: number; encrypted: boolean; signed: boolean; xfa: boolean; fields: number; comments: number }>> = {
    'text-heavy': { pages: 5 }, 'image-heavy': { pages: 4 }, 'acroform': { pages: 1, fields: 6 }, 'multi-page': { pages: 12 },
    'existing-annotations': { pages: 1, comments: 2 }, 'unicode-meta': { pages: 1 }, 'blank': { pages: 1 },
    'encrypted-marker': { encrypted: true }, 'signed-marker': { signed: true }, 'xfa-marker': { xfa: true },
    'junk-prefixed': { pages: 1 },
  };
  for (const [name, want] of Object.entries(expectations)) {
    test(name, async () => {
      const info = await inspectPdf(await F.CORPUS[name]());
      if (want.pages !== undefined) assert.equal(info.pages.length, want.pages);
      assert.equal(info.encrypted, want.encrypted ?? false);
      assert.equal(info.signed, want.signed ?? false);
      assert.equal(info.xfa, want.xfa ?? false);
      if (want.fields !== undefined) assert.equal(info.designFields.length, want.fields);
      if (want.comments !== undefined) assert.equal(info.comments.length, want.comments);
    });
  }
  test('multi-page keeps per-page size and the rotated page', async () => {
    const info = await inspectPdf(await F.multiPage());
    assert.deepEqual(info.pages.map((p) => p.rotation), [0, 0, 90, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(info.pages.slice(0, 4).map((p) => [p.width, p.height]), [[612, 792], [595, 842], [792, 612], [200, 300]]);
  });
  test('OBSERVED-QUIRK: pdf-lib recovers truncated files silently; inspect reports fewer pages, no error', async () => {
    const half = await F.corrupted('truncated-half');
    const info = await inspectPdf(half);
    assert.equal(info.pages.length, 6); // source had 12. Silent partial load is a data-loss risk for save-over-original.
    assert.equal((await inspectPdf(await F.corrupted('truncated-tail'))).pages.length, 12);
    assert.equal((await inspectPdf(await F.corrupted('bad-startxref'))).pages.length, 12);
  });
  test('OBSERVED-QUIRK: a zero-page PDF loads as one blank page (pdf-lib adds a default page)', async () => {
    assert.equal((await inspectPdf(await F.corrupted('zero-pages'))).pages.length, 1);
  });
  for (const kind of ['garbage-header', 'empty', 'png-named-pdf', 'text-file'] as const) {
    test(`rejects ${kind} with a parse error`, async () => {
      await assert.rejects(async () => inspectPdf(await F.corrupted(kind)), /Failed to parse PDF document/);
    });
  }
  test('rejects >25 MB with a clear message', async () => {
    await assert.rejects(() => inspectPdf(new Uint8Array(25_000_001)), /25 MB/);
  });
});

describe('applyPdfEdit: view-only gates', () => {
  test('encrypted', async () => {
    await assert.rejects(async () => applyPdfEdit(await F.encryptedMarker(), { kind: 'rotate', page: 0 }), /Encrypted PDFs are view-only/);
  });
  test('signed', async () => {
    await assert.rejects(async () => applyPdfEdit(await F.signedMarker(), { kind: 'rotate', page: 0 }), /Signed PDFs are view-only/);
  });
  test('xfa', async () => {
    await assert.rejects(async () => applyPdfEdit(await F.xfaMarker(), { kind: 'rotate', page: 0 }), /XFA PDFs are view-only/);
  });
  test('gate runs before any operation kind (annotation, text, insert, delete)', async () => {
    const signed = await F.signedMarker();
    for (const op of [
      { kind: 'annotation', annotation: hl(0) }, { kind: 'text', page: 0, text: 'x', x: 1, y: 1, size: 10 },
      { kind: 'insert', data: await F.blank(), after: 0 }, { kind: 'delete', page: 0 },
    ] as const) await assert.rejects(() => applyPdfEdit(signed, op), /view-only/);
  });
  test('corrupt input is rejected, not edited', async () => {
    await assert.rejects(async () => applyPdfEdit(await F.corrupted('text-file'), { kind: 'rotate', page: 0 }));
  });
});

describe('applyPdfEdit: page operations', () => {
  test('rotate: +90 steps wrap at 360; rotated page 3 goes 90 -> 180', async () => {
    let b = await F.blank();
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) { b = await applyPdfEdit(b, { kind: 'rotate', page: 0 }); seen.push((await inspectPdf(b)).pages[0].rotation); }
    assert.deepEqual(seen, [90, 180, 270, 0]);
    const m = await applyPdfEdit(await F.multiPage(), { kind: 'rotate', page: 2 });
    assert.equal((await inspectPdf(m)).pages[2].rotation, 180);
  });
  test('invalid page indexes are rejected for every page op', async () => {
    const b = await F.multiPage();
    for (const page of [-1, 12, 1.5, Number.NaN]) {
      await assert.rejects(() => applyPdfEdit(b, { kind: 'rotate', page }), /Page does not exist/);
      await assert.rejects(() => applyPdfEdit(b, { kind: 'delete', page }), /Page does not exist/);
    }
    await assert.rejects(() => applyPdfEdit(b, { kind: 'move', from: 0, to: 12 }), /Page does not exist/);
    await assert.rejects(() => applyPdfEdit(b, { kind: 'move', from: -1, to: 0 }), /Page does not exist/);
  });
  test('delete removes exactly the target page and keeps order of the rest', async () => {
    const b = await F.multiPage();
    const before = await pageOrderByWidth(b);
    const out = await applyPdfEdit(b, { kind: 'delete', page: 1 });
    assert.deepEqual(await pageOrderByWidth(out), before.filter((_, i) => i !== 1));
  });
  test('delete refuses the last page', async () => {
    await assert.rejects(async () => applyPdfEdit(await F.blank(), { kind: 'delete', page: 0 }), /Keep at least one page/);
  });
  test('delete refuses a page that holds form widgets (even though deleting would be legal PDF)', async () => {
    await assert.rejects(async () => applyPdfEdit(await F.acroForm(), { kind: 'delete', page: 0 }), /Keep at least one page|form widgets/);
    // Two-page form doc: widget page protected, other page deletable.
    const d = await PDFDocument.load(await F.acroForm());
    d.addPage([200, 200]);
    const two = await d.save({ useObjectStreams: false });
    await assert.rejects(() => applyPdfEdit(two, { kind: 'delete', page: 0 }), /form widgets/);
    assert.equal((await inspectPdf(await applyPdfEdit(two, { kind: 'delete', page: 1 }))).pages.length, 1);
  });
  test('move: forward, backward and no-op keep the page set', async () => {
    const b = await F.multiPage();
    const before = await pageOrderByWidth(b);
    const fwd = await pageOrderByWidth(await applyPdfEdit(b, { kind: 'move', from: 0, to: 3 }));
    assert.deepEqual(fwd, [before[1], before[2], before[3], before[0], ...before.slice(4)]);
    const back = await pageOrderByWidth(await applyPdfEdit(b, { kind: 'move', from: 3, to: 0 }));
    assert.deepEqual(back, [before[3], before[0], before[1], before[2], ...before.slice(4)]);
    assert.deepEqual(await pageOrderByWidth(await applyPdfEdit(b, { kind: 'move', from: 5, to: 5 })), before);
  });
  test('move keeps rotation of the moved page', async () => {
    const out = await applyPdfEdit(await F.multiPage(), { kind: 'move', from: 2, to: 0 });
    assert.equal((await inspectPdf(out)).pages[0].rotation, 90);
  });
  test('input bytes are never mutated', async () => {
    const b = await F.multiPage();
    const copy = b.slice();
    await applyPdfEdit(b, { kind: 'rotate', page: 0 });
    await applyPdfEdit(b, { kind: 'delete', page: 0 });
    assert.deepEqual(b, copy);
  });
});

describe('applyPdfEdit: annotations', () => {
  test('highlight, underline, strikeout, note, ink all land as real /Annots with Contents', async () => {
    let b = await F.blank(300, 400);
    const ops = [
      hl(0, 'a-hl'),
      { ...hl(0, 'a-ul'), kind: 'underline' as const },
      { ...hl(0, 'a-so'), kind: 'strikeout' as const },
      { kind: 'note' as const, page: 0, color: [1, 0.8, 0] as const, opacity: 1, contents: 'a-note', author: 'QA', position: { x: 100, y: 300 } },
    ];
    for (const annotation of ops) b = await applyPdfEdit(b, { kind: 'annotation', annotation });
    const list = await listPdfAnnotations(b);
    assert.deepEqual(list.map((a) => [a.subtype, a.contents]), [
      ['Highlight', 'a-hl'], ['Underline', 'a-ul'], ['StrikeOut', 'a-so'], ['Text', 'a-note'],
    ]);
  });
  test('OBSERVED-QUIRK: ink is rejected by applyPdfEdit (creation allow-list) but exportAnnotatedPdf can write it', async () => {
    const ink = { kind: 'ink' as const, page: 0, color: [1, 0, 0] as const, opacity: 1, contents: 'a-ink', author: '', width: 2, strokes: [[{ x: 10, y: 10 }, { x: 50, y: 60 }]] };
    await assert.rejects(async () => applyPdfEdit(await F.blank(), { kind: 'annotation', annotation: ink }), /annotation creation type is not supported/);
    const r = await exportAnnotatedPdf(await F.blank(), [{ id: 'i', annotation: ink }]);
    assert.deepEqual((await listPdfAnnotations(r.bytes)).map((a) => a.subtype), ['Ink']);
  });
  test('annotation rect outside the crop box, tiny rects and empty note text are rejected', async () => {
    const b = await F.blank(); // 200x300
    const bad = (rect: { x: number; y: number; width: number; height: number }) => applyPdfEdit(b, { kind: 'annotation', annotation: { ...hl(0), rects: [rect] } });
    await assert.rejects(() => bad({ x: 190, y: 10, width: 50, height: 10 }), /fit inside the page crop box/);
    await assert.rejects(() => bad({ x: 10, y: 10, width: 1, height: 10 }), /fit inside the page crop box/);
    await assert.rejects(async () => applyPdfEdit(b, { kind: 'annotation', annotation: { kind: 'note', page: 0, color: [1, 1, 0], opacity: 1, contents: ' ', author: '', position: { x: 50, y: 100 } } }), /Write the text note/);
    await assert.rejects(async () => applyPdfEdit(b, { kind: 'annotation', annotation: { ...hl(0), opacity: 0.01 } }), /valid annotation color and opacity/);
  });
  test('existing annotations survive a new annotation, and survive rotate/move/text', async () => {
    let b = await F.withExistingAnnotations();
    b = await applyPdfEdit(b, { kind: 'annotation', annotation: hl(0, 'new') });
    b = await applyPdfEdit(b, { kind: 'rotate', page: 0 });
    b = await applyPdfEdit(b, { kind: 'text', page: 0, text: 'added', x: 10, y: 10, size: 12 });
    assert.deepEqual((await listPdfAnnotations(b)).map((a) => a.contents), ['pre-existing highlight', 'pre-existing note', 'new']);
  });
  test('annotation on a missing page is rejected', async () => {
    await assert.rejects(async () => applyPdfEdit(await F.blank(), { kind: 'annotation', annotation: hl(5) }));
  });
  test('exportAnnotatedPdf reports skipped annotations instead of throwing', async () => {
    const r = await exportAnnotatedPdf(await F.blank(), [{ id: 'x', annotation: hl(3) }]);
    assert.equal(r.written, 0);
    assert.equal(r.skipped.length, 1);
    assert.match(r.skipped[0].reason, /page 3 does not exist \(document has 1\)/);
  });
  test('exportAnnotatedPdf wraps unreadable input in a readable error', async () => {
    await assert.rejects(async () => exportAnnotatedPdf(await F.corrupted('text-file'), []), /Cannot read PDF/);
  });
  test('annotations are plain objects on the page: reopen in pdf-lib shows /Annots array length', async () => {
    const out = await applyPdfEdit(await F.blank(), { kind: 'annotation', annotation: hl(0) });
    const annots = (await PDFDocument.load(out)).getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    assert.equal(annots.size(), 1);
  });
});

describe('applyPdfEdit: text and insert', () => {
  test('text: validation messages', async () => {
    const b = await F.blank();
    await assert.rejects(() => applyPdfEdit(b, { kind: 'text', page: 0, text: '   ', x: 1, y: 1, size: 10 }), /Enter text first/);
    for (const size of [0, 0.5, 301, Number.NaN]) await assert.rejects(() => applyPdfEdit(b, { kind: 'text', page: 0, text: 'x', x: 1, y: 1, size }), /Invalid text position or size/);
    await assert.rejects(() => applyPdfEdit(b, { kind: 'text', page: 0, text: 'x', x: Number.POSITIVE_INFINITY, y: 1, size: 10 }), /Invalid text position or size/);
  });
  test('text: WinAnsi text works, non-WinAnsi text (CJK) is rejected by the standard font', async () => {
    const b = await F.blank();
    const ok = await applyPdfEdit(b, { kind: 'text', page: 0, text: 'Grüße €', x: 10, y: 10, size: 12 });
    assert.ok(ok.length > b.length);
    await assert.rejects(() => applyPdfEdit(b, { kind: 'text', page: 0, text: '日本語', x: 10, y: 10, size: 12 })); // OBSERVED-QUIRK: no font fallback, raw pdf-lib error
  });
  test('text can be drawn off-page without error (no bounds check)', async () => {
    const out = await applyPdfEdit(await F.blank(), { kind: 'text', page: 0, text: 'far', x: 9999, y: -500, size: 12 }); // OBSERVED-QUIRK
    assert.ok(out.length > 0);
  });
  test('insert: pages land after the requested index, in order', async () => {
    const out = await applyPdfEdit(await F.multiPage(), { kind: 'insert', data: await F.blank(111, 222), after: 1 });
    const sizes = await pageOrderByWidth(out);
    assert.equal(sizes.length, 13);
    assert.equal(sizes[2], '111x222');
  });
  test('insert: bad index, encrypted/signed/xfa source, form source are refused', async () => {
    const b = await F.blank();
    await assert.rejects(() => applyPdfEdit(b, { kind: 'insert', data: b, after: 1 }), /Page does not exist/);
    await assert.rejects(() => applyPdfEdit(b, { kind: 'insert', data: b, after: -1 }), /Page does not exist/);
    for (const mk of [F.encryptedMarker, F.signedMarker, F.xfaMarker]) await assert.rejects(async () => applyPdfEdit(b, { kind: 'insert', data: await mk(), after: 0 }), /Cannot combine/);
    await assert.rejects(async () => applyPdfEdit(b, { kind: 'insert', data: await F.acroForm(), after: 0 }), /Importing form fields is not supported/);
  });
  test('insert into a form document keeps the target document fields', async () => {
    const out = await applyPdfEdit(await F.acroForm(), { kind: 'insert', data: await F.blank(), after: 0 });
    assert.equal((await readFormFields(out)).length, 8);
  });
});

describe('pdfforms: read, fill, flatten', () => {
  test('readFormFields lists all 8 fields with kinds, options, read-only and maxLength', async () => {
    const fields = await readFormFields(await F.acroForm());
    const by = Object.fromEntries(fields.map((f) => [f.name, f]));
    assert.deepEqual(fields.map((f) => f.kind).sort(), ['checkbox', 'dropdown', 'optionlist', 'radio', 'text', 'text', 'text', 'text']);
    assert.equal(by[F.FORM_FIELDS.locked].readOnly, true);
    assert.equal(by[F.FORM_FIELDS.locked].value, 'A-12345');
    assert.equal((by[F.FORM_FIELDS.email] as { maxLength?: number }).maxLength, 40);
    assert.deepEqual((by[F.FORM_FIELDS.plan] as { options?: string[] }).options, ['free', 'pro']);
    assert.deepEqual((by[F.FORM_FIELDS.country] as { options?: string[] }).options, ['Germany', 'France', 'Spain']);
  });
  test('hasForm: true for acroform, false otherwise', async () => {
    assert.equal(await hasForm(await F.acroForm()), true);
    assert.equal(await hasForm(await F.textHeavy(1)), false);
  });
  test('fillForm sets values; read-only and unknown fields come back as per-field errors, others still applied', async () => {
    const r = await fillForm(await F.acroForm(), {
      [F.FORM_FIELDS.name]: 'Ada Lovelace', [F.FORM_FIELDS.agree]: true, [F.FORM_FIELDS.plan]: 'pro', [F.FORM_FIELDS.country]: 'France',
      [F.FORM_FIELDS.locked]: 'hack', nope: 'x',
    });
    assert.deepEqual(r.applied.sort(), [F.FORM_FIELDS.agree, F.FORM_FIELDS.country, F.FORM_FIELDS.name, F.FORM_FIELDS.plan].sort());
    assert.deepEqual(r.errors.map((e) => [e.field, e.code]).sort(), [['locked_id', 'read-only'], ['nope', 'not-found']]);
    const after = Object.fromEntries((await readFormFields(r.bytes)).map((f) => [f.name, f.value]));
    assert.equal(after[F.FORM_FIELDS.name], 'Ada Lovelace');
    assert.equal(after[F.FORM_FIELDS.agree], true);
    assert.equal(after[F.FORM_FIELDS.plan], 'pro');
    assert.equal(after[F.FORM_FIELDS.locked], 'A-12345');
  });
  test('fillForm: overrideReadOnly writes the locked field', async () => {
    const r = await fillForm(await F.acroForm(), { [F.FORM_FIELDS.locked]: 'B-1' }, { overrideReadOnly: true });
    assert.equal(r.errors.length, 0);
    assert.equal((await readFormFields(r.bytes)).find((f) => f.name === F.FORM_FIELDS.locked)?.value, 'B-1');
  });
  test('fillForm: non-WinAnsi text yields an encoding error for that field only', async () => {
    const r = await fillForm(await F.acroForm(), { [F.FORM_FIELDS.name]: '日本語', [F.FORM_FIELDS.email]: 'a@b.de' });
    assert.deepEqual(r.applied, [F.FORM_FIELDS.email]);
    assert.equal(r.errors[0].field, F.FORM_FIELDS.name);
  });
  test('fillForm with flatten removes all fields and keeps the page', async () => {
    const r = await fillForm(await F.acroForm(), { [F.FORM_FIELDS.name]: 'Flat' }, { flatten: true });
    assert.equal(r.flattened, true);
    assert.equal((await readFormFields(r.bytes)).length, 0);
    assert.equal((await inspectPdf(r.bytes)).pages.length, 1);
  });
  test('flattenForm on a doc without a form is a no-op that still returns a valid PDF', async () => {
    const out = await flattenForm(await F.blank());
    assert.equal((await inspectPdf(out)).pages.length, 1);
  });
  test('fillForm does not mutate its input', async () => {
    const b = await F.acroForm(); const copy = b.slice();
    await fillForm(b, { [F.FORM_FIELDS.name]: 'x' }, { flatten: true });
    assert.deepEqual(b, copy);
  });
});

describe('pdftext: fail-closed run inspection', () => {
  test('pdf-lib drawText output is inspectable: runs carry font and size', async () => {
    const runs = await inspectPdfText(await F.textHeavy(1), 0);
    assert.ok(runs.length >= 31); // title + 30 lines
    assert.ok(runs.every((r) => r.pageIndex === 0 && r.fontSize > 0));
    assert.ok(runs.some((r) => r.expectedText.startsWith(F.textMarker(1, 1))));
  });
  test('simple single-Tj text is inspectable', async () => {
    const runs = await inspectPdfText(await F.simpleTjText(), 0);
    assert.deepEqual(runs.map((r) => r.expectedText), ['Hello Somnia']);
  });
  test('fails closed on TJ arrays and on text inside form XObjects (UNSUPPORTED_CONTENT)', async () => {
    await assert.rejects(async () => inspectPdfText(await F.tjArrayText(), 0), { code: 'UNSUPPORTED_CONTENT' });
    await assert.rejects(async () => inspectPdfText(await F.formXObjectText(), 0), { code: 'UNSUPPORTED_CONTENT' });
  });
  test('page out of range -> TARGET_NOT_FOUND', async () => {
    await assert.rejects(() => inspectPdfText(F.textHeavy(1) as never, 5), () => true);
    await assert.rejects(async () => inspectPdfText(await F.textHeavy(1), 5), { code: 'TARGET_NOT_FOUND' });
  });
});

describe('geometry and limits (existing behavior)', () => {
  test('inspectPdf reports MediaBox size (not CropBox) and the four right-angle rotations', async () => {
    const info = await inspectPdf(await F.cropBoxRotations());
    assert.deepEqual(info.pages.map((p) => p.rotation), [0, 90, 180, 270]);
    // OBSERVED-QUIRK: pdf-lib getSize() is the MediaBox; UI code must apply CropBox itself (see fieldGeometry).
    assert.ok(info.pages.every((p) => p.width === 300 && p.height === 400));
  });
  test('annotation validation uses the CropBox: a rect inside MediaBox but outside CropBox is rejected', async () => {
    const b = await F.cropBoxRotations();
    await assert.rejects(() => applyPdfEdit(b, { kind: 'annotation', annotation: { ...hl(0), rects: [{ x: 10, y: 10, width: 20, height: 20 }] } }), /crop box/);
    const ok = await applyPdfEdit(b, { kind: 'annotation', annotation: { ...hl(0), rects: [{ x: 60, y: 60, width: 20, height: 20 }] } });
    assert.equal((await listPdfAnnotations(ok)).length, 1);
  });
  test('decompression-heavy file: small on disk, inspect and edit still return (no crash); timing recorded', async () => {
    const b = await F.decompressionHeavy(40);
    assert.ok(b.length < 200_000);
    const t0 = Date.now();
    assert.equal((await inspectPdf(b)).pages.length, 1);
    await applyPdfEdit(b, { kind: 'rotate', page: 0 });
    assert.ok(Date.now() - t0 < 15_000, 'should finish well inside the 20 s worker watchdog');
  });
  test('page cap: 2001-page document is refused by inspect (limit 2000)', async () => {
    const d = await PDFDocument.create();
    for (let i = 0; i < 2001; i++) d.addPage([10, 10]);
    await assert.rejects(async () => inspectPdf(await d.save({ useObjectStreams: false })), /2000 pages/);
  });
});

describe('pdfview load (pdf.js in Node): error codes for the corpus', () => {
  test('looksLikePdf: junk up to 1024 bytes allowed, beyond that rejected', async () => {
    assert.equal(looksLikePdf(await F.junkPrefixed(200)), true);
    assert.equal(looksLikePdf(await F.junkPrefixed(1100)), false);
    assert.equal(looksLikePdf(await F.corrupted('garbage-header')), false);
  });
  for (const kind of ['empty', 'text-file', 'png-named-pdf', 'garbage-header'] as const) {
    test(`${kind} -> not-pdf`, async () => {
      await assert.rejects(async () => loadPdf(pdfjs, await F.corrupted(kind)), { code: 'not-pdf' });
    });
  }
  test('valid fixtures open with the right page count', async () => {
    for (const [mk, n] of [[F.textHeavy, 5], [F.imageHeavy, 4], [F.multiPage, 12], [F.acroForm, 1]] as const) {
      const d = await loadPdf(pdfjs, await mk()); assert.equal(d.pageCount, n); await d.destroy();
    }
  });
  test('pdf.js text extraction sees the text markers', async () => {
    const d = await loadPdf(pdfjs, await F.textHeavy(2));
    assert.match(await (await d.getPage(2)).getText!(), new RegExp(F.textMarker(2, 7)));
    await d.destroy();
  });
  test('page sizes are reported per page', async () => {
    const d = await loadPdf(pdfjs, await F.multiPage());
    assert.deepEqual((await d.getPage(2)).size, { width: 595, height: 842 });
    await d.destroy();
  });
  test('OBSERVED-QUIRK: pdf-lib and pdf.js disagree on damaged files', async () => {
    // pdf-lib (edit path) recovers these; pdf.js (view path) refuses them. A file can be viewable-or-not independently of editable-or-not.
    for (const kind of ['truncated-tail', 'truncated-half'] as const) {
      const bytes = await F.corrupted(kind);
      assert.ok((await inspectPdf(bytes)).pages.length > 0);
      await assert.rejects(() => loadPdf(pdfjs, bytes), { code: 'invalid' });
    }
  });
  test('bad startxref: pdf.js reconstructs or fails with code invalid, never throws a raw error', async () => {
    const bytes = await F.corrupted('bad-startxref');
    try { const d = await loadPdf(pdfjs, bytes); assert.equal(d.pageCount, 12); await d.destroy(); }
    catch (e) { assert.equal((e as { code: string }).code, 'invalid'); }
  });
  test('huge MediaBox (14400pt) opens; reports size, does not render here', async () => {
    const d = await loadPdf(pdfjs, await F.corrupted('oversize-claim'));
    assert.deepEqual((await d.getPage(1)).size, { width: 14400, height: 14400 });
    await d.destroy();
  });
});
