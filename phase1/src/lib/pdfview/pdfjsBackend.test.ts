import test from 'node:test';
import assert from 'node:assert/strict';
import { createPdfjsBackend } from './pdfjsBackend.ts';
// Node < 24 lacks Promise.try, which pdf.js 6 uses. The webview target must provide it (see docs).
if (!('try' in Promise)) (Promise as unknown as Record<string, unknown>).try = (f: () => unknown) => new Promise(r => r(f()));
const pdfjsBackend = createPdfjsBackend(undefined, () => import('pdfjs-dist/legacy/build/pdf.mjs') as never);
import { loadPdf } from './load.ts';
/** Smoke test against real pdf.js in Node: parse, page count, size, text. No canvas needed. */
function tinyPdf(pages: number): Uint8Array {
  const objs: string[] = [];
  const kids = Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(' ');
  objs.push('<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (let i = 0; i < pages; i++) {
    const stream = `BT /F1 24 Tf 20 100 Td (Page ${i + 1} hello) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let out = '%PDF-1.4\n'; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return new TextEncoder().encode(out);
}
test('real pdf.js: opens, counts pages, sizes, extracts text', async () => {
  const doc = await loadPdf(pdfjsBackend, tinyPdf(2));
  assert.equal(doc.pageCount, 2);
  const p = await doc.getPage(2);
  assert.deepEqual(p.size, { width: 300, height: 200 });
  assert.match(await p.getText!(), /Page 2 hello/);
  await doc.destroy();
});
test('real pdf.js: garbage with a PDF header maps to invalid', async () => {
  await assert.rejects(loadPdf(pdfjsBackend, new TextEncoder().encode('%PDF-1.4\nnot really')), (e: { code: string }) => e.code === 'invalid');
});
test('abort during deferred library import never opens an orphan worker',async()=>{let resolve!:(lib:never)=>void;let calls=0;const backend=createPdfjsBackend(undefined,()=>new Promise(r=>{resolve=r;}));const ac=new AbortController();const opened=backend.open(tinyPdf(1),{signal:ac.signal});ac.abort();resolve({getDocument:()=>{calls++;throw Error('should never be called');},GlobalWorkerOptions:{}} as never);await assert.rejects(opened,(e:{code:string})=>e.code==='aborted');assert.equal(calls,0);});
test('bundled asset urls are passed to getDocument',async()=>{
 let seen:Record<string,unknown>|null=null;
 const fakeDoc={numPages:0,getPage:()=>Promise.reject(new Error('no pages')),destroy:()=>Promise.resolve()};
 const lib={getDocument:(p:Record<string,unknown>)=>{seen=p;return {promise:Promise.resolve(fakeDoc),destroy:()=>Promise.resolve()};},GlobalWorkerOptions:{}} as never;
 const backend=createPdfjsBackend(undefined,()=>Promise.resolve(lib),{standardFontDataUrl:'https://x/pdfjs/standard_fonts/',cMapUrl:'https://x/pdfjs/cmaps/',wasmUrl:'https://x/pdfjs/wasm/',iccUrl:'https://x/pdfjs/iccs/'});
 await backend.open(tinyPdf(1));
 assert.equal(seen!.standardFontDataUrl,'https://x/pdfjs/standard_fonts/');
 assert.equal(seen!.cMapUrl,'https://x/pdfjs/cmaps/');assert.equal(seen!.cMapPacked,true);
 assert.equal(seen!.wasmUrl,'https://x/pdfjs/wasm/');assert.equal(seen!.iccUrl,'https://x/pdfjs/iccs/');
});
