import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSlidesPdf,exportPdfName} from './exportPdf';
// Valid 1x1 transparent PNG.
const PNG=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));

test('exportPdfName derives a safe name',()=>{
  assert.equal(exportPdfName('quarterly review.pptx'),'quarterly_review.pdf');
  assert.equal(exportPdfName('deck'),'deck.pdf');
  assert.equal(exportPdfName('...'),'slides.pdf');
  assert.equal(exportPdfName('/tmp/a/b.pptx'),'b.pdf');
});

test('buildSlidesPdf writes one page per slide at the slide size',async()=>{
  const pdf=await buildSlidesPdf([PNG,PNG],720,405);
  assert.ok(pdf.length>200);
  assert.equal(pdf[0],0x25); // %PDF
  const {PDFDocument}=await import('pdf-lib');
  const loaded=await PDFDocument.load(pdf);
  assert.equal(loaded.getPageCount(),2);
  const size=loaded.getPage(0).getSize();
  assert.deepEqual(size,{width:720,height:405});
});

test('buildSlidesPdf refuses empty, oversized and non-PNG input',async()=>{
  await assert.rejects(()=>buildSlidesPdf([],720,405),/no slides/);
  await assert.rejects(()=>buildSlidesPdf([PNG],0,405),/not readable/);
  await assert.rejects(()=>buildSlidesPdf([Uint8Array.from([1,2,3,4,5,6,7,8,9])],720,405),/did not render as a PNG/);
});
