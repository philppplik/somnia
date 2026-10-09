import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, PDFName, StandardFonts, degrees } from 'pdf-lib';
import { exportAnnotatedPdf } from '../../pdfannotate/export';
import { exportPdf } from './pipeline';
import { exportCapabilities } from './capabilities';
import { exportMessages } from './locales';
import type { RasterRenderer } from './types';
if (!('try' in Promise)) (Promise as unknown as Record<string, unknown>).try = (f: () => unknown) => new Promise(r => r(f()));
const artifacts = process.env.PDF_EXPORT_ARTIFACTS;
if (artifacts) mkdirSync(artifacts, { recursive:true });
async function fixture() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400,300]);
  page.drawText('Somnia PDF export', { x:30,y:245,size:24,font });
  page.drawText('Text, vectors and review marks', { x:30,y:200,size:16,font });
  page.drawRectangle({ x:30,y:30,width:120,height:60 });
  doc.addPage([240,320]).setRotation(degrees(90));
  doc.setTitle('Original title'); doc.setAuthor('Fixture author');
  const base = { page:0, color:[1,0.8,0] as const, opacity:0.6, contents:'Review comment', author:'Tester' };
  return (await exportAnnotatedPdf(await doc.save(), [
    { id:'h', annotation:{ ...base,kind:'highlight',rects:[{x:25,y:240,width:240,height:30}] } },
    { id:'u', annotation:{ ...base,kind:'underline',color:[0,0.2,1],rects:[{x:30,y:197,width:215,height:18}] } },
    { id:'s', annotation:{ ...base,kind:'strikeout',color:[1,0,0],rects:[{x:30,y:140,width:160,height:20}] } },
    { id:'n', annotation:{ ...base,kind:'note',position:{x:330,y:200},opacity:1 } },
    { id:'i', annotation:{ ...base,kind:'ink',color:[0.6,0,0.8],width:4,strokes:[[{x:200,y:50},{x:240,y:80},{x:280,y:45}]] } },
  ])).bytes;
}
async function render(bytes: Uint8Array, pageNumber=1) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data:bytes.slice(), useSystemFonts:true });
  try {
    const doc = await task.promise, page = await doc.getPage(pageNumber), viewport = page.getViewport({ scale:1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    await page.render({ canvas:canvas as never, viewport, background:'rgb(255,255,255)' }).promise;
    const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    return { canvas, pixels: new Uint8ClampedArray(pixels), viewport };
  } finally { await task.destroy(); }
}
const nodeRenderer: RasterRenderer = async function* (bytes) {
  const doc = await PDFDocument.load(bytes);
  for (let i=1;i<=doc.getPageCount();i++) {
    const r = await render(bytes,i);
    yield { jpeg:r.canvas.toBuffer('image/jpeg'), widthPt:r.viewport.width/1.5, heightPt:r.viewport.height/1.5 };
  }
};
test('print export flattens five kinds, preserves source, fonts, metadata and rotation; pdf.js pixel comparison',async()=>{
  const source = await fixture(), copy = source.slice();
  const result = await exportPdf(source,{ metadata:{title:'Export title',subject:'Print copy',keywords:['Somnia','PDF']} });
  assert.deepEqual(source,copy); assert.equal(result.flattened,5); assert.equal(result.rasterized,false);
  const parsed = await PDFDocument.load(result.bytes);
  assert.equal(parsed.getTitle(),'Export title'); assert.equal(parsed.getAuthor(),'Fixture author');
  assert.equal(parsed.getPage(1).getRotation().angle,90); assert.equal(parsed.getPage(0).node.Annots(),undefined);
  const before = await render(source), after = await render(result.bytes);
  assert.equal(before.pixels.length,after.pixels.length);
  let changed=0, ink=0, colored=0;
  for(let i=0;i<after.pixels.length;i+=4) {
    if(after.pixels[i]<240 || after.pixels[i+1]<240 || after.pixels[i+2]<240) ink++;
    if(Math.max(after.pixels[i],after.pixels[i+1],after.pixels[i+2])-Math.min(after.pixels[i],after.pixels[i+1],after.pixels[i+2])>30) colored++;
    if(Math.abs(before.pixels[i]-after.pixels[i])+Math.abs(before.pixels[i+1]-after.pixels[i+1])+Math.abs(before.pixels[i+2]-after.pixels[i+2])>40) changed++;
  }
  assert.ok(ink>10000); assert.ok(colored>5000); assert.ok(changed/(after.pixels.length/4)<0.02,`changed pixels ${changed}`);
  if(artifacts) { writeFileSync(`${artifacts}/print.png`,after.canvas.toBuffer('image/png')); writeFileSync(`${artifacts}/source.png`,before.canvas.toBuffer('image/png')); writeFileSync(`${artifacts}/print.pdf`,result.bytes); }
});
test('screen preset requires renderer, has no annotations, yields correctly rotated raster page and pixel sanity',async()=>{
  const source=await fixture();
  await assert.rejects(exportPdf(source,{preset:'screen'}),{code:'RENDERER_REQUIRED'});
  const out=await exportPdf(source,{preset:'screen',renderer:nodeRenderer,metadata:{title:'Screen copy'}});
  assert.equal(out.rasterized,true); assert.match(out.warnings.join(' '),/text search/);
  const doc=await PDFDocument.load(out.bytes); assert.equal(doc.getPageCount(),2);
  assert.deepEqual(doc.getPage(1).getSize(),{width:320,height:240});
  const image=await render(out.bytes); const print=await render((await exportPdf(source)).bytes);
  let delta=0; for(let i=0;i<image.pixels.length;i++) delta+=Math.abs(image.pixels[i]-print.pixels[i]);
  assert.ok(delta/image.pixels.length<8);
  if(artifacts) writeFileSync(`${artifacts}/screen.png`,image.canvas.toBuffer('image/png'));
});
test('missing appearances, encrypted/signature/XFA guards, malformed source, invalid options and Unicode fail closed',async()=>{
  const source=await fixture();
  const doc=await PDFDocument.load(source),annots=doc.getPage(0).node.Annots()!;
  annots.lookup(0, (await import('pdf-lib')).PDFDict).delete(PDFName.of('AP'));
  await assert.rejects(exportPdf(await doc.save()),{code:'UNSUPPORTED_ANNOTATION'});
  for(const kind of ['signature','xfa']) {
    const protectedDoc=await PDFDocument.load(source);
    if(kind==='signature') protectedDoc.catalog.set(PDFName.of('TestSignature'),protectedDoc.context.obj({Type:'Sig',ByteRange:[0,1,2,3]}));
    else protectedDoc.catalog.set(PDFName.of('AcroForm'),protectedDoc.context.obj({XFA:'fixture'}));
    await assert.rejects(exportPdf(await protectedDoc.save()),{code:'PROTECTED_PDF'});
  }
  await assert.rejects(exportPdf(new Uint8Array([1,2,3])),{code:'INVALID_PDF'});
  await assert.rejects(exportPdf(source,{quality:2}),{code:'INVALID_OPTIONS'});
  await assert.rejects(exportPdf(source,{text:[{page:0,text:'日本語',x:20,y:20,size:12}]}),{code:'UNSUPPORTED_FONT'});
  const ac=new AbortController(); ac.abort(); await assert.rejects(exportPdf(source,{signal:ac.signal}),{name:'AbortError'});
});
test('Standard-14 text additions remain extractable, fields flatten and links stay interactive',async()=>{
  const doc=await PDFDocument.create(); const page=doc.addPage([300,200]);
  const field=doc.getForm().createTextField('name'); field.setText('Form value'); field.addToPage(page,{x:30,y:30,width:120,height:25});
  doc.getForm().updateFieldAppearances();
  page.node.addAnnot(doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[10,10,50,20],A:{Type:'Action',S:'URI',URI:'https://example.com'}})));
  const out=await exportPdf(await doc.save(),{text:[{page:0,text:'Café export',x:25,y:130,size:18,font:'Times-Roman'}]});
  const parsed=await PDFDocument.load(out.bytes); assert.equal(parsed.catalog.has(PDFName.of('AcroForm')),false);
  assert.equal(out.preservedLinks,1); assert.equal(parsed.getPage(0).node.Annots()?.size(),1);
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'); const task=pdfjs.getDocument({data:out.bytes.slice(),useSystemFonts:true});
  try { const p=await (await task.promise).getPage(1); const tc=await p.getTextContent(); assert.match(tc.items.map(i=>'str' in i?i.str:'').join(' '),/Café export/); } finally {await task.destroy();}
});
test('five locale catalogs have matching keys and capability gates explain unavailable operations',()=>{
  for(const locale of Object.keys(exportMessages) as (keyof typeof exportMessages)[]) {
    assert.deepEqual(Object.keys(exportMessages[locale]),Object.keys(exportMessages.en));
    const caps=exportCapabilities({canvas:false},locale);
    assert.equal(caps.find(c=>c.id==='screen')!.enabled,false); assert.equal(caps.find(c=>c.id==='linearize')!.enabled,false);
    assert.ok(caps.every(c=>c.reason.length>10));
  }
  assert.equal(exportCapabilities({canvas:true,protectedDocument:true})[0].enabled,false);
});
test('appearance matrix, nonzero crop origin, rotated page and form widget rendering match pdf.js',async()=>{
  const {PDFDict}=await import('pdf-lib');
  const doc=await PDFDocument.create(),page=doc.addPage([400,300]);
  page.setCropBox(20,30,340,240);page.setRotation(degrees(90));
  const ap=doc.context.register(doc.context.stream('0 0.5 1 rg 0 0 20 10 re f',{
    Type:'XObject',Subtype:'Form',BBox:[0,0,20,10],Matrix:[0,1,-1,0,30,5],Resources:{},
  }));
  page.node.addAnnot(doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Stamp',Rect:[60,80,140,120],AP:{N:ap},F:4})));
  const field=doc.getForm().createTextField('visible');field.setText('Widget');field.addToPage(page,{x:170,y:170,width:100,height:25});
  doc.getForm().updateFieldAppearances();
  const source=await doc.save(),out=await exportPdf(source);
  const a=await render(source),b=await render(out.bytes);
  let changed=0;for(let i=0;i<a.pixels.length;i+=4)if(Math.abs(a.pixels[i]-b.pixels[i])+Math.abs(a.pixels[i+1]-b.pixels[i+1])+Math.abs(a.pixels[i+2]-b.pixels[i+2])>40)changed++;
  assert.ok(changed/(a.pixels.length/4)<0.01,`geometry mismatch: ${changed}`);
  const screen=await exportPdf(source,{preset:'screen',renderer:nodeRenderer});
  const raster=await PDFDocument.load(screen.bytes);assert.deepEqual(raster.getPage(0).getSize(),{width:240,height:340});
  if(artifacts)writeFileSync(`${artifacts}/geometry.png`,b.canvas.toBuffer('image/png'));
  // Missing selected appearance state must fail instead of guessing.
  const bad=await PDFDocument.load(source);const annot=bad.getPage(0).node.Annots()!.lookup(0,PDFDict);
  annot.set(PDFName.of('AP'),bad.context.obj({N:{On:ap}}));
  await assert.rejects(exportPdf(await bad.save()),{code:'UNSUPPORTED_ANNOTATION'});
});
test('metadata updates remove stale XMP; screen preserves source properties; renderer mismatch is rejected',async()=>{
  const doc=await PDFDocument.load(await fixture());
  doc.catalog.set(PDFName.of('Metadata'),doc.context.register(doc.context.stream('<x:xmpmeta>old title</x:xmpmeta>',{Type:'Metadata',Subtype:'XML'})));
  const source=await doc.save();
  const out=await exportPdf(source,{metadata:{title:'New title',creationDate:new Date('2026-10-09T12:00:00Z')}});
  const parsed=await PDFDocument.load(out.bytes);assert.equal(parsed.catalog.has(PDFName.of('Metadata')),false);
  assert.ok(out.warnings.some(w=>w.includes('XMP')));
  const screen=await exportPdf(source,{preset:'screen',renderer:nodeRenderer});
  assert.equal((await PDFDocument.load(screen.bytes)).getTitle(),'Original title');
  const empty:RasterRenderer=async function*(){};
  await assert.rejects(exportPdf(source,{preset:'screen',renderer:empty}),{code:'INVALID_OPTIONS'});
  await assert.rejects(exportPdf(source,{metadata:{creationDate:new Date('invalid')}}),{code:'INVALID_OPTIONS'});
});
