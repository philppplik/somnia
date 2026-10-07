import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPdf, looksLikePdf } from './load.ts';
import { createPageCache } from './pageCache.ts';
import { PdfLoadError, type PdfBackend, type PdfDocumentHandle, type PdfPageHandle } from './types.ts';
const bytes = (s: string) => new TextEncoder().encode(s);
const fakePage = (n: number, log: string[]): PdfPageHandle => ({
  number: n, size: { width: 100, height: 100 }, render: () => ({ promise: Promise.resolve(), cancel() {} }), cleanup: () => { log.push(`cleanup${n}`); },
});
const fakeDoc = (pages: number, log: string[] = []): PdfDocumentHandle => ({
  pageCount: pages, getPage: async n => fakePage(n, log), destroy: async () => { log.push('destroy'); },
});
test('looksLikePdf: header, leading junk, rejects others', () => {
  assert.ok(looksLikePdf(bytes('%PDF-1.7\n')));
  assert.ok(looksLikePdf(bytes('junk\n%PDF-1.4')));
  assert.ok(!looksLikePdf(bytes('<html>')));
  assert.ok(!looksLikePdf(new Uint8Array(0)));
  assert.ok(!looksLikePdf(bytes(' '.repeat(1100) + '%PDF-1.4')));
});
test('loadPdf validation errors never reach the backend', async () => {
  let calls = 0; const be: PdfBackend = { open: async () => { calls++; return fakeDoc(1); } };
  await assert.rejects(loadPdf(be, bytes('nope')), (e: PdfLoadError) => e.code === 'not-pdf');
  await assert.rejects(loadPdf(be, bytes('%PDF-1.4'), { maxBytes: 3 }), (e: PdfLoadError) => e.code === 'too-large');
  const ac = new AbortController(); ac.abort();
  await assert.rejects(loadPdf(be, bytes('%PDF-1.4'), { signal: ac.signal }), (e: PdfLoadError) => e.code === 'aborted');
  assert.equal(calls, 0);
});
test('loadPdf maps backend failures', async () => {
  const mk = (name: string): PdfBackend => ({ open: async () => { throw Object.assign(new Error('x'), { name }); } });
  await assert.rejects(loadPdf(mk('PasswordException'), bytes('%PDF-1.4')), (e: PdfLoadError) => e.code === 'password');
  await assert.rejects(loadPdf(mk('InvalidPDFException'), bytes('%PDF-1.4')), (e: PdfLoadError) => e.code === 'invalid');
});
test('loadPdf rejects empty documents and destroys them', async () => {
  const log: string[] = [];
  await assert.rejects(loadPdf({ open: async () => fakeDoc(0, log) }, bytes('%PDF-1.4')), (e: PdfLoadError) => e.code === 'invalid');
  assert.deepEqual(log, ['destroy']);
});
test('loadPdf destroys when aborted mid-open', async () => {
  const log: string[] = []; const ac = new AbortController();
  const be: PdfBackend = { open: async () => { ac.abort(); return fakeDoc(2, log); } };
  await assert.rejects(loadPdf(be, bytes('%PDF-1.4'), { signal: ac.signal }), (e: PdfLoadError) => e.code === 'aborted');
  assert.deepEqual(log, ['destroy']);
});
test('page cache: LRU eviction cleans up, concurrent gets share', async () => {
  const log: string[] = []; let loads = 0;
  const doc: PdfDocumentHandle = { pageCount: 9, destroy: async () => {}, getPage: async n => { loads++; return fakePage(n, log); } };
  const c = createPageCache(doc, 2);
  const [a, b] = await Promise.all([c.get(1), c.get(1)]);
  assert.equal(a, b); assert.equal(loads, 1);
  await c.get(2); await c.get(1); await c.get(3); // evicts 2
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(log, ['cleanup2']);
  c.clear(); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(log.sort(), ['cleanup1', 'cleanup2', 'cleanup3']);
});
test('page cache: failed load is not cached', async () => {
  let n = 0; const doc: PdfDocumentHandle = { pageCount: 1, destroy: async () => {}, getPage: async () => { if (n++ === 0) throw new Error('boom'); return fakePage(1, []); } };
  const c = createPageCache(doc);
  await assert.rejects(c.get(1)); await new Promise(r => setTimeout(r, 0));
  assert.equal((await c.get(1)).number, 1);
});
