/** Always-on sanity tests for the fixtures themselves. No SOMNIA_PDFLIB needed. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACROFORM_FIELDS, inspectPdf, looksLikePdf, makeAcroFormPdf, makeMultiPagePdf, makeTextPdf,
} from './fixtures';

test('makeTextPdf: valid single page PDF', async () => {
  const bytes = await makeTextPdf();
  assert.ok(looksLikePdf(bytes));
  assert.deepEqual(await inspectPdf(bytes), { pageCount: 1, fieldNames: [], hasAcroForm: false });
});

test('makeTextPdf: output is deterministic', async () => {
  assert.deepEqual(await makeTextPdf(), await makeTextPdf());
});

test('makeMultiPagePdf: page count matches and rejects bad counts', async () => {
  assert.equal((await inspectPdf(await makeMultiPagePdf(5))).pageCount, 5);
  await assert.rejects(() => makeMultiPagePdf(0), RangeError);
});

test('makeAcroFormPdf: has the four documented fields', async () => {
  const facts = await inspectPdf(await makeAcroFormPdf());
  assert.equal(facts.pageCount, 1);
  assert.ok(facts.hasAcroForm);
  assert.deepEqual(facts.fieldNames, Object.values(ACROFORM_FIELDS).sort());
});

test('text fixtures contain Standard-14 Helvetica text in the content stream', async () => {
  const raw = new TextDecoder('latin1').decode(await makeTextPdf({ pages: [['Hello PDF world']] }));
  assert.match(raw, /\/BaseFont \/Helvetica/);
});
