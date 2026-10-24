import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';
import {buildPngZip,exportEntryName,exportScale,exportZipName,EXPORT_MAX_PX,EXPORT_MAX_SLIDES,EXPORT_MAX_BYTES} from './exportPng';

const png=(n:number,fill=0)=>{const b=new Uint8Array(Math.max(n,8));b.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);b.fill(fill,8);return b;};
test('export scale puts the longer side at the limit and rejects unreadable sizes',()=>{
  assert.equal(exportScale(960,540),EXPORT_MAX_PX/960);assert.equal(exportScale(540,960),EXPORT_MAX_PX/960);
  for(const [w,h] of [[0,540],[960,0],[-1,5],[NaN,5],[5,Infinity]])assert.throws(()=>exportScale(w,h),/not readable/);
});
test('entry names are zero padded to the slide count and bounded',()=>{
  assert.equal(exportEntryName(0,3),'slide-01.png');assert.equal(exportEntryName(2,3),'slide-03.png');
  assert.equal(exportEntryName(9,120),'slide-010.png');assert.equal(exportEntryName(119,120),'slide-120.png');
  for(const [i,c] of [[-1,3],[3,3],[1.5,3],[0,0]])assert.throws(()=>exportEntryName(i,c),/out of range/);
});
test('archive name is derived from the file name and never unsafe',()=>{
  assert.equal(exportZipName('Q3 Plan.pptx'),'Q3_Plan-png.zip');assert.equal(exportZipName('/a/b/Deck.PPTX'),'Deck-png.zip');
  assert.equal(exportZipName('..\\..\\evil/../x.pptx'),'x-png.zip');assert.equal(exportZipName('///'),'slides-png.zip');assert.equal(exportZipName('Übersicht 2026.pptx'),'Übersicht_2026-png.zip');
  assert.ok(!/[\\/]/.test(exportZipName('a/b\\c')));assert.ok(exportZipName('x'.repeat(500)).length<=90);
});
test('zip holds every slide image in order, byte for byte',()=>{
  const a=png(100,1),b=png(50,2),zip=buildPngZip([a,b]),files=unzipSync(zip);
  assert.deepEqual(Object.keys(files),['slide-01.png','slide-02.png']);assert.deepEqual(files['slide-01.png'],a);assert.deepEqual(files['slide-02.png'],b);
});
test('zip refuses nothing, too many slides, non-PNG data and oversized totals',()=>{
  assert.throws(()=>buildPngZip([]),/no slides/);
  assert.throws(()=>buildPngZip(Array.from({length:EXPORT_MAX_SLIDES+1},()=>png(8))),/At most/);
  assert.throws(()=>buildPngZip([png(10),new Uint8Array([1,2,3,4,5,6,7,8,9])]),/Slide 2 did not render/);
  assert.throws(()=>buildPngZip([new Uint8Array(3)]),/Slide 1 did not render/);
  const big=png(EXPORT_MAX_BYTES/2+16);assert.throws(()=>buildPngZip([big,big]),/too large/);
});
