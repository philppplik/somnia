import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  readFormFields, fillForm, flattenForm, hasForm, newFillOperation, patchFillOperation, setFlatten,
  parseFillOperation, applyFillOperations,
} from './index';

async function makeForm(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 500]);
  const form = doc.getForm();
  const t = form.createTextField('name'); t.addToPage(page, { x: 20, y: 440, width: 200, height: 20 });
  const m = form.createTextField('note'); m.enableMultiline(); m.setMaxLength(10); m.addToPage(page, { x: 20, y: 380, width: 200, height: 40 });
  const c = form.createCheckBox('agree'); c.addToPage(page, { x: 20, y: 340, width: 15, height: 15 });
  const r = form.createRadioGroup('size');
  r.addOptionToPage('S', page, { x: 20, y: 300, width: 15, height: 15 });
  r.addOptionToPage('M', page, { x: 60, y: 300, width: 15, height: 15 });
  const d = form.createDropdown('country'); d.addOptions(['DE', 'FR']); d.addToPage(page, { x: 20, y: 250, width: 100, height: 20 });
  const o = form.createOptionList('langs'); o.addOptions(['en', 'de', 'fr']); o.enableMultiselect(); o.addToPage(page, { x: 20, y: 160, width: 100, height: 60 });
  const ro = form.createTextField('locked'); ro.setText('x'); ro.enableReadOnly(); ro.addToPage(page, { x: 200, y: 340, width: 100, height: 20 });
  return doc.save();
}
const byName = (fs: Awaited<ReturnType<typeof readFormFields>>, n: string) => fs.find((f) => f.name === n)!;

test('reads all field kinds with metadata', async () => {
  const fs = await readFormFields(await makeForm());
  assert.equal(fs.length, 7);
  assert.equal(byName(fs, 'name').kind, 'text');
  assert.equal(byName(fs, 'note').multiline, true);
  assert.equal(byName(fs, 'note').maxLength, 10);
  assert.equal(byName(fs, 'agree').value, false);
  assert.deepEqual(byName(fs, 'size').options, ['S', 'M']);
  assert.equal(byName(fs, 'size').value, null);
  assert.deepEqual(byName(fs, 'country').options, ['DE', 'FR']);
  assert.equal(byName(fs, 'langs').multiSelect, true);
  assert.equal(byName(fs, 'locked').readOnly, true);
});

test('PDF without form yields no fields', async () => {
  const d = await PDFDocument.create(); d.addPage();
  assert.equal(await hasForm(await d.save()), false);
});

test('fills values, round-trips through a reload, leaves input untouched', async () => {
  const src = await makeForm();
  const copy = src.slice();
  const r = await fillForm(src, { name: 'Ada', agree: true, size: 'M', country: 'FR', langs: ['en', 'fr'] });
  assert.deepEqual(r.errors, []);
  assert.equal(r.applied.length, 5);
  assert.deepEqual(src, copy);
  const fs = await readFormFields(r.bytes);
  assert.equal(byName(fs, 'name').value, 'Ada');
  assert.equal(byName(fs, 'agree').value, true);
  assert.equal(byName(fs, 'size').value, 'M');
  assert.deepEqual(byName(fs, 'country').value, ['FR']);
  assert.deepEqual(byName(fs, 'langs').value, ['en', 'fr']);
});

test('uncheck, clear and null reset values', async () => {
  const a = await fillForm(await makeForm(), { name: 'x', agree: true, size: 'S' });
  const b = await fillForm(a.bytes, { name: null, agree: false, size: null });
  const fs = await readFormFields(b.bytes);
  assert.equal(byName(fs, 'name').value, '');
  assert.equal(byName(fs, 'agree').value, false);
  assert.equal(byName(fs, 'size').value, null);
});

test('errors are per field and do not block the rest', async () => {
  const r = await fillForm(await makeForm(), {
    name: 'ok', missing: 'x', agree: 'yes' as unknown as boolean, size: 'XL', country: 'US', note: 'way too long text', locked: 'no', langs: 'zz',
  });
  assert.deepEqual(r.applied, ['name']);
  const codes = Object.fromEntries(r.errors.map((e) => [e.field, e.code]));
  assert.deepEqual(codes, {
    missing: 'not-found', agree: 'type-mismatch', size: 'invalid-option', country: 'invalid-option',
    note: 'max-length', locked: 'read-only', langs: 'invalid-option',
  });
});

test('overrideReadOnly and addMissingOptions opt in', async () => {
  const r = await fillForm(await makeForm(), { locked: 'y', country: 'US' }, { overrideReadOnly: true, addMissingOptions: true });
  assert.deepEqual(r.errors, []);
  const fs = await readFormFields(r.bytes);
  assert.equal(byName(fs, 'locked').value, 'y');
  assert.deepEqual(byName(fs, 'country').value, ['US']);
});

test('single-select rejects multiple values', async () => {
  const r = await fillForm(await makeForm(), { country: ['DE', 'FR'] });
  assert.equal(r.errors[0].code, 'type-mismatch');
});

test('non-WinAnsi text is reported, not thrown', async () => {
  const r = await fillForm(await makeForm(), { name: '日本語' });
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'encoding');
});

test('flatten removes the form but keeps one page', async () => {
  const r = await fillForm(await makeForm(), { name: 'Ada', agree: true }, { flatten: true });
  assert.equal(r.flattened, true);
  assert.equal(await hasForm(r.bytes), false);
  assert.equal((await PDFDocument.load(r.bytes)).getPageCount(), 1);
  assert.equal(await hasForm(await flattenForm(await makeForm())), false);
});

test('operations are plain JSON and replay deterministically', async () => {
  let op = newFillOperation('op1', { name: 'Ada', agree: true });
  op = patchFillOperation(op, { size: 'S' });
  const json = JSON.parse(JSON.stringify(op));
  const parsed = parseFillOperation(json)!;
  assert.deepEqual(parsed, op);
  const src = await makeForm();
  const r = await applyFillOperations(src, [parsed, { ...setFlatten(newFillOperation('op2', {}), true) }]);
  assert.equal(r.flattened, true);
  assert.deepEqual(r.opResults.map((x) => x.id), ['op1', 'op2']);
  const r2 = await applyFillOperations(src, [{ ...parsed, enabled: false }]);
  assert.deepEqual(r2.applied, []);
  const r3 = await applyFillOperations(src, [parsed]);
  assert.equal(byName(await readFormFields(r3.bytes), 'name').value, 'Ada');
});

test('parseFillOperation rejects junk and future versions', () => {
  assert.equal(parseFillOperation(null), null);
  assert.equal(parseFillOperation({ type: 'other' }), null);
  assert.equal(parseFillOperation({ id: 'a', type: 'pdfforms.fill', version: 99, params: { values: {} } }), null);
  assert.equal(parseFillOperation({ id: 'a', type: 'pdfforms.fill', version: 1, params: { values: { a: 5 } } }), null);
});
