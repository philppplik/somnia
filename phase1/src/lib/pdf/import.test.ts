import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, DOMMatrix, Path2D, ImageData } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import { importPdf } from './import.ts';
import { createImportFixture } from './fixtures.ts';
import { decodePath, multiply } from './geometry.ts';
import { PdfImportError, type PdfImportOptions } from './types.ts';
Object.assign(globalThis,{DOMMatrix,Path2D,ImageData});
if(!('try' in Promise))(Promise as unknown as Record<string,unknown>).try=(f:()=>unknown)=>new Promise(r=>r(f()));
const library=()=>import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as Promise<typeof import('pdfjs-dist')>;
const options: PdfImportOptions={canvasFactory:(w,h)=>createCanvas(w,h) as unknown as HTMLCanvasElement};
test('generated PDF: positioned text, paths, decoded image, thumbnails and original bytes',async()=>{
  const bytes=await createImportFixture(),original=bytes.slice();
  const progress:number[]=[];
  const result=await importPdf(bytes,{...options,onProgress:n=>progress.push(n)},library);
  assert.deepEqual(bytes,original);assert.deepEqual(progress,[1,2]);assert.equal(result.readOnly,true);
  assert.equal(result.pages.length,2);
  const p=result.pages[0];assert.equal(p.width,400);assert.equal(p.height,300);
  const text=p.text.find(t=>t.text==='Somnia PDF import')!;
  assert.ok(text);assert.equal(text.transform[4],30);assert.equal(text.transform[5],50);assert.equal(text.fontSize,24);
  const rect=p.vectors.find(v=>Math.abs(v.bounds.width-120)<0.1)!;
  assert.ok(rect);assert.equal(rect.bounds.x,30);assert.equal(rect.bounds.y,90);assert.equal(rect.bounds.height,60);assert.equal(rect.fill,'#3366cc');
  assert.ok(p.vectors.some(v=>v.commands.some(c=>c.kind==='cubic')));
  assert.equal(p.images.length,1);
  const image=p.images[0];assert.equal(image.pixelWidth,2);assert.equal(image.pixelHeight,1);
  assert.deepEqual(image.bounds,{x:220,y:190,width:120,height:60});assert.match(image.dataUrl,/^data:image\/png;base64,/);
  assert.deepEqual(image.quad,[[220,190],[340,190],[340,250],[220,250]]);
  assert.equal(p.thumbnail?.width,180);assert.equal(p.thumbnail?.height,135);
  assert.match(p.thumbnail!.dataUrl,/^data:image\/png;base64,/);
  const rotated=result.pages[1];assert.equal(rotated.rotation,90);assert.equal(rotated.width,350);assert.equal(rotated.height,250);
  assert.deepEqual(rotated.sourceBounds,[10,20,260,370]);
  assert.ok(rotated.text[0].bounds.x>=0);assert.ok(rotated.text[0].bounds.y>=0);
  const rotatedRect=rotated.vectors.find(v=>v.bounds.width===45)!;
  assert.deepEqual(rotatedRect.bounds,{x:80,y:50,width:45,height:90});
  // Entire import model is JSON serializable and remains usable after PDF.js cleanup.
  assert.deepEqual(JSON.parse(JSON.stringify(result)),result);
});
test('blank pages import without invented content',async()=>{
  const doc=await PDFDocument.create();doc.addPage([100,120]);
  const r=await importPdf(await doc.save(),{...options,thumbnails:false},library);
  assert.equal(r.pages[0].text.length,0);assert.equal(r.pages[0].vectors.length,0);assert.equal(r.pages[0].images.length,0);assert.equal(r.pages[0].thumbnail,null);
});
test('invalid files and limits produce typed failures',async()=>{
  await assert.rejects(importPdf(new Uint8Array([1,2])),(e:PdfImportError)=>e.code==='invalid');
  const bytes=await createImportFixture();
  await assert.rejects(importPdf(bytes,{maxBytes:10},library),(e:PdfImportError)=>e.code==='limit');
  await assert.rejects(importPdf(bytes,{maxPages:1},library),(e:PdfImportError)=>e.code==='limit');
  await assert.rejects(importPdf(bytes,{...options,maxObjectsPerPage:1},library),(e:PdfImportError)=>e.code==='limit');
  await assert.rejects(importPdf(bytes,{thumbnailMaxSize:Infinity},library),(e:PdfImportError)=>e.code==='limit');
  await assert.rejects(importPdf(new TextEncoder().encode('%PDF-1.4\ninvalid'),{},library),(e:PdfImportError)=>e.code==='invalid');
});
test('abort before and during library loading does not create a worker',async()=>{
  const ac=new AbortController();ac.abort();
  await assert.rejects(importPdf(await createImportFixture(),{signal:ac.signal},library),(e:PdfImportError)=>e.code==='aborted');
  const bc=new AbortController();let calls=0;
  await assert.rejects(importPdf(await createImportFixture(),{signal:bc.signal},async()=>{bc.abort();return {getDocument:()=>{calls++;}} as never;}),(e:PdfImportError)=>e.code==='aborted');
  assert.equal(calls,0);
});
test('pixel budget skips oversized images explicitly, but keeps page thumbnails',async()=>{
  const result=await importPdf(await createImportFixture(),{...options,maxImagePixels:1},library);
  assert.equal(result.pages[0].images.length,0);assert.ok(result.pages[0].diagnostics.some(d=>d.code==='image-limit'));
  assert.ok(result.pages[0].thumbnail);
});
test('geometry composes affine transforms and retains quadratic/cubic commands',()=>{
  assert.deepEqual(multiply([1,0,0,-1,0,300],[2,0,0,3,10,20]),[2,0,0,-3,10,280]);
  const path=decodePath([0,0,0,3,2,4,6,8,2,1,2,3,4,5,6,4],[1,0,0,-1,0,10]);
  assert.equal(path[1].kind,'quadratic');assert.equal(path[2].kind,'cubic');assert.equal(path[3].kind,'close');
  assert.throws(()=>decodePath([0,1],[1,0,0,1,0,0]));
});
test('library failure, password failure and abort destroy loading task',async()=>{
  const bytes=await createImportFixture();
  await assert.rejects(importPdf(bytes,{},async()=>{throw Error('missing module');}),(e:PdfImportError)=>e.code==='unavailable');
  let destroyed=0;
  const passwordLibrary=async()=>({getDocument:()=>({promise:Promise.reject(Object.assign(new Error('password'),{name:'PasswordException'})),destroy:async()=>{destroyed++;}})}) as never;
  await assert.rejects(importPdf(bytes,{},passwordLibrary),(e:PdfImportError)=>e.code==='password');
  assert.equal(destroyed,1);
  const ac=new AbortController();let started!:()=>void;
  const ready=new Promise<void>(r=>{started=r;});
  let reject!: (reason:Error)=>void;
  const pending=new Promise<never>((_,r)=>{reject=r;});
  const abortLibrary=async()=>({getDocument:()=>{started();return {promise:pending,destroy:async()=>{destroyed++;reject(Error('destroyed'));}};}}) as never;
  const importPromise=importPdf(bytes,{signal:ac.signal},abortLibrary);await ready;ac.abort();
  await assert.rejects(importPromise,(e:PdfImportError)=>e.code==='aborted');assert.ok(destroyed>=2);
});
test('abort from page progress leaves no partial result',async()=>{
  const ac=new AbortController();
  await assert.rejects(importPdf(await createImportFixture(),{...options,signal:ac.signal,onProgress:()=>ac.abort()},library),(e:PdfImportError)=>e.code==='aborted');
});
test('headless extraction keeps geometry when canvas rendering is unavailable',async()=>{
  const r=await importPdf(await createImportFixture(),{canvasFactory:()=>{throw Error('no canvas');}},library);
  assert.ok(r.pages[0].text.length);assert.ok(r.pages[0].vectors.length);
  assert.equal(r.pages[0].thumbnail,null);
  assert.ok(r.pages[0].diagnostics.some(d=>d.code==='thumbnail-unavailable'));
  assert.ok(r.pages[0].diagnostics.some(d=>d.code==='image-unavailable'));
});
test('repeated image placements preserve each affine transform and clipping is reported',async()=>{
  const {rgb,clip,endPath,pushGraphicsState,popGraphicsState,rectangle}=await import('pdf-lib');
  const doc=await PDFDocument.create(),p=doc.addPage([200,200]);
  const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8DwHwQBEfgD/XhT7a4AAAAASUVORK5CYII='),c=>c.charCodeAt(0));
  const img=await doc.embedPng(png);
  p.drawImage(img,{x:10,y:10,width:20,height:20});p.drawImage(img,{x:50,y:50,width:40,height:30});
  p.pushOperators(pushGraphicsState(),rectangle(0,0,10,10),clip(),endPath());
  p.drawRectangle({x:0,y:0,width:100,height:100,color:rgb(1,0,0)});p.pushOperators(popGraphicsState());
  const r=await importPdf(await doc.save(),options,library);
  assert.equal(r.pages[0].images.length,2);
  assert.deepEqual(r.pages[0].images.map(i=>i.bounds),[{x:10,y:170,width:20,height:20},{x:50,y:120,width:40,height:30}]);
  assert.ok(r.pages[0].diagnostics.some(d=>d.code==='clipping'));
});
test('revision guard rejects reopened tabs and stale edits',async()=>{
  const {isCurrentPdfImport}=await import('./revision.ts');
  const source={documentId:'doc-a',revision:2,sourceHash:'sha-a'};
  const result={source,model:{schemaVersion:1 as const,pages:[],readOnly:true as const}};
  assert.equal(isCurrentPdfImport(result,{...source}),true);
  assert.equal(isCurrentPdfImport(result,{...source,revision:3}),false);
  assert.equal(isCurrentPdfImport(result,{...source,documentId:'doc-b'}),false);
  assert.equal(isCurrentPdfImport(result,{...source,sourceHash:'sha-b'}),false);
  assert.equal(isCurrentPdfImport(result,null),false);
});
