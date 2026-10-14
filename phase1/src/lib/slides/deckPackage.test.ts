import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {setShapesBounds,readSlideNotes,insertPicture,replacePicture,removePicture,fitImage,formatShapeText,addTextBox,removeTextBox,nextShapeId,setShapeBounds,boundsEditIssue,readDeckModel,moveSlide,reorderSlides,duplicateSlide,deleteSlide,newSlideFromLayout,readLayouts} from './deckPackage';
import {readRuns,makeEditedCopy} from './editCopy';
import {png,jpeg} from './imageFixtures';

const base=new Uint8Array(readFileSync(fileURLToPath(new URL('../../../slides-engine/fixtures/independent.pptx',import.meta.url))));
const slideXml=(title:string)=>strFromU8(unzipSync(base)['ppt/slides/slide1.xml']).replace('Somnia Documents Studio',title)
  +'';
/** Builds an n-slide deck from the committed 2-slide fixture: slide k carries text "Slide k". */
function deck(n:number,opts:{sections?:number[][];extraPart?:boolean;picture?:boolean}={}):Uint8Array{
  const zip=unzipSync(base);
  const types=strFromU8(zip['[Content_Types].xml']);
  let rels=strFromU8(zip['ppt/_rels/presentation.xml.rels']).replace(/<Relationship [^>]*slides\/slide\d+\.xml"\/>/g,'');
  let ids='',ct=types.replace(/<Override [^>]*\/ppt\/slides\/slide\d+\.xml"[^>]*\/>/g,'');
  for(let k=1;k<=n;k++){
    let xml=slideXml(`Slide ${k}`);
    if(opts.picture&&k===1)xml=xml.replace('</p:spTree>','<p:pic><p:nvPicPr><p:cNvPr id="9" name="Pic 1"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr/></p:pic></p:spTree>');
    zip[`ppt/slides/slide${k}.xml`]=strToU8(xml);
    zip[`ppt/slides/_rels/slide${k}.xml.rels`]=strToU8(strFromU8(zip['ppt/slides/_rels/slide1.xml.rels'])+(opts.picture&&k===1?'':''));
    rels=rels.replace('</Relationships>',`<Relationship Id="rId${100+k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${k}.xml"/></Relationships>`);
    ids+=`<p:sldId id="${255+k}" r:id="rId${100+k}"/>`;
    ct=ct.replace('</Types>',`<Override PartName="/ppt/slides/slide${k}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
  }
  let pres=strFromU8(zip['ppt/presentation.xml']).replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,`<p:sldIdLst>${ids}</p:sldIdLst>`);
  if(opts.sections){
    const sec=opts.sections.map((m,i)=>`<p14:section name="Sec ${i+1}" id="{0000000${i}-0000-0000-0000-000000000000}"><p14:sldIdLst>${m.map(k=>`<p14:sldId id="${255+k}"/>`).join('')}</p14:sldIdLst></p14:section>`).join('');
    pres=pres.replace('</p:presentation>',`<p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"><p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">${sec}</p14:sectionLst></p:ext></p:extLst></p:presentation>`);
  }
  zip['ppt/presentation.xml']=strToU8(pres);zip['ppt/_rels/presentation.xml.rels']=strToU8(rels);zip['[Content_Types].xml']=strToU8(ct);
  delete zip['ppt/slides/slide1.xml.rels'];
  if(opts.extraPart)zip['ppt/media/image1.png']=new Uint8Array([137,80,78,71,1,2,3,4,5,6,7,8]);
  return zipSync(zip);
}
const titles=(b:Uint8Array)=>readRuns(b).map(r=>r.text);
const ids=(b:Uint8Array)=>readDeckModel(b).slides.map(s=>s.id);

test('model exposes stable slide, shape and run ids',()=>{
  const m=readDeckModel(deck(3));
  assert.deepEqual(m.slides.map(s=>s.id),[256,257,258]);
  assert.deepEqual(m.slides[0].shapes.map(s=>[s.id,s.kind,s.runCount]),[[2,'text',1],[3,'text',1]]);
  assert.equal(m.runs[0].key,'256:2:0:0');
  assert.equal(m.runs.length,readRuns(deck(3)).length);
  assert.deepEqual(m.runs.map(r=>r.ordinal),[0,1,0,1,0,1]);
});
test('moving a slide keeps ids, reorders text and leaves other parts byte-equal',()=>{
  const src=deck(4,{extraPart:true}),out=moveSlide(src,258,0);
  assert.deepEqual(ids(out),[258,256,257,259]);
  assert.deepEqual(titles(out).filter((_,i)=>i%2===0),['Slide 3','Slide 1','Slide 2','Slide 4']);
  const a=unzipSync(src),b=unzipSync(out);
  assert.deepEqual(Object.keys(a),Object.keys(b));
  for(const k of Object.keys(a))if(k!=='ppt/presentation.xml')assert.deepEqual(b[k],a[k],k);
  assert.notEqual(strFromU8(b['ppt/presentation.xml']),strFromU8(a['ppt/presentation.xml']));
  assert.equal(strFromU8(b['ppt/presentation.xml']).replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,''),strFromU8(a['ppt/presentation.xml']).replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,''));
});
test('move then move back is identity on order; no-op returns same bytes',()=>{
  const src=deck(3);assert.equal(moveSlide(src,257,1),src);
  const there=moveSlide(src,256,2);assert.deepEqual(ids(there),[257,258,256]);
  assert.deepEqual(ids(moveSlide(there,256,0)),[256,257,258]);
});
test('reorderSlides applies a permutation and refuses non-permutations',()=>{
  const src=deck(3);assert.deepEqual(ids(reorderSlides(src,[258,257,256])),[258,257,256]);
  assert.throws(()=>reorderSlides(src,[256,256,257]),/permutation/);
  assert.throws(()=>reorderSlides(src,[256,257]),/permutation/);
  assert.throws(()=>reorderSlides(src,[256,257,999]),/permutation/);
});
test('edits still apply after a reorder (indexes follow the new order)',()=>{
  const out=moveSlide(deck(3),258,0);
  const run=readRuns(out).find(r=>r.text==='Slide 1')!;
  assert.equal(run.slide,1);
  const edited=makeEditedCopy(out,[{slide:run.slide,run:run.run,old:run.text,text:'Edited',part:run.part}]);
  assert.deepEqual(titles(edited).filter((_,i)=>i%2===0),['Slide 3','Edited','Slide 2']);
  assert.deepEqual(ids(edited),[258,256,257]);
});
test('rejects out-of-range, unknown and stale ids',()=>{
  const src=deck(3);
  assert.throws(()=>moveSlide(src,256,3),/out of range/);
  assert.throws(()=>moveSlide(src,256,-1),/out of range/);
  assert.throws(()=>moveSlide(src,256,1.5),/out of range/);
  assert.throws(()=>moveSlide(src,12345,0),/no longer exists/);
  const moved=moveSlide(src,256,2);
  assert.throws(()=>moveSlide(moved,999,0),/no longer exists/);
});
test('sections: moves inside a section rewrite member lists, cross-section moves are refused',()=>{
  const src=deck(4,{sections:[[1,2],[3,4]]});
  const out=moveSlide(src,257,0);
  const x=strFromU8(unzipSync(out)['ppt/presentation.xml']);
  assert.match(x,/<p14:sldIdLst><p14:sldId id="257"\/><p14:sldId id="256"\/><\/p14:sldIdLst>/);
  assert.deepEqual(readDeckModel(out).sections,[{name:'Sec 1',ids:[257,256]},{name:'Sec 2',ids:[258,259]}]);
  assert.throws(()=>moveSlide(src,256,3),/section boundary/);
  assert.throws(()=>moveSlide(src,258,0),/section boundary/);
});
test('malformed, locked and duplicate packages fail closed',()=>{
  assert.throws(()=>moveSlide(new Uint8Array([1,2,3]),256,0));
  const z=unzipSync(deck(2));
  const dupe=zipSync({...z,'ppt/presentation.xml':strToU8(strFromU8(z['ppt/presentation.xml']).replace('id="257"','id="256"'))});
  assert.throws(()=>readDeckModel(dupe),/duplicate/);
  const noList=zipSync({...z,'ppt/presentation.xml':strToU8(strFromU8(z['ppt/presentation.xml']).replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,''))});
  assert.throws(()=>moveSlide(noList,256,0),/slide list/);
  const junk=zipSync({...z,'ppt/presentation.xml':strToU8(strFromU8(z['ppt/presentation.xml']).replace('</p:sldIdLst>','<p:sldId id="1" r:id="rId9"/></p:sldIdLst>'))});
  assert.throws(()=>readDeckModel(junk),/invalid slide id/);
  const external=zipSync({...z,'ppt/_rels/presentation.xml.rels':strToU8(strFromU8(z['ppt/_rels/presentation.xml.rels']).replace('Target="slides/slide1.xml"','Target="http://x/slide1.xml" TargetMode="External"'))});
  assert.throws(()=>readDeckModel(external),/canonical internal/);
  const signed=zipSync({...z,'_xmlsignatures/sig1.xml':strToU8('<x/>')});
  assert.throws(()=>moveSlide(signed,256,1),/signed/);
  const nested=zipSync({...z,'ppt/slides/slide1.xml':strToU8('<p:sld><p:cSld><p:spTree><p:sp><a:t>x</a:t></p:spTree>')});
  assert.ok(readDeckModel(nested).slides[0].problems.length>0);
});
test('slides with unsupported structure stay readable but expose no runs',()=>{
  const z=unzipSync(deck(2));
  z['ppt/slides/slide2.xml']=strToU8(strFromU8(z['ppt/slides/slide2.xml']).replace('<a:t>','<a:t />x<a:t>'));
  const m=readDeckModel(zipSync(z));
  assert.ok(m.slides[1].problems.length);assert.equal(m.slides[0].problems.length,0);
  assert.ok(m.runs.every(r=>r.slideId===256));
});
test('picture and group shapes are listed read-only with a kind',()=>{
  const m=readDeckModel(deck(2,{picture:true}));
  assert.deepEqual(m.slides[0].shapes.map(s=>s.kind),['text','text','picture']);
  assert.equal(m.slides[0].shapes[2].id,9);
  const moved=moveSlide(deck(2,{picture:true}),257,0);
  assert.equal(readDeckModel(moved).slides[1].shapes[2].kind,'picture');
});
test('bounds: more than 200 slides is refused',()=>{
  assert.throws(()=>moveSlide(deck(201),256,0),/1-200/);
});
test('real corpus decks: reorder round-trips or fails closed, never corrupts',async()=>{
  const {readdirSync}=await import('node:fs');
  const dir=fileURLToPath(new URL('../../../slides-engine/corpus/',import.meta.url));
  let moved=0;
  for(const f of readdirSync(dir).filter(f=>f.endsWith('.pptx'))){
    const src=new Uint8Array(readFileSync(dir+f));
    let model;try{model=readDeckModel(src);}catch{continue;}
    if(model.slides.length<2)continue;
    const out=moveSlide(src,model.slides.at(-1)!.id,0);
    assert.deepEqual(readDeckModel(out).slides.map(s=>s.id),[model.slides.at(-1)!.id,...model.slides.slice(0,-1).map(s=>s.id)],f);
    moved++;
  }
  console.log('corpus decks reordered:',moved);
});

/* ---- P1: duplicate / delete / new slide ---- */
const RTN='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const parts=(b:Uint8Array)=>Object.keys(unzipSync(b)).sort();
const xmlOf=(b:Uint8Array,n:string)=>strFromU8(unzipSync(b)[n]);
/** Deck whose slide 1 (id 256) has notes + an image, slide 2 has the same image. */
function richDeck(extra:(z:Record<string,Uint8Array>)=>void=()=>{}):Uint8Array{
  const z=unzipSync(deck(3));
  z['ppt/media/image1.png']=new Uint8Array([137,80,78,71,1,2,3]);z['ppt/media/image2.png']=new Uint8Array([137,80,78,71,9,9,9]);
  z['ppt/notesSlides/notesSlide1.xml']=strToU8('<p:notes xmlns:a="a" xmlns:p="p"><a:t>note</a:t></p:notes>');
  z['ppt/notesSlides/_rels/notesSlide1.xml.rels']=strToU8(`<Relationships xmlns="r"><Relationship Id="rId1" Type="${RTN}slide" Target="../slides/slide1.xml"/></Relationships>`);
  const rel=(_n:number,extraRel='')=>strToU8(`<Relationships xmlns="r"><Relationship Id="rId1" Type="${RTN}slideLayout" Target="../slideLayouts/slideLayout3.xml"/>${extraRel}</Relationships>`);
  z['ppt/slides/_rels/slide1.xml.rels']=rel(1,`<Relationship Id="rId2" Type="${RTN}notesSlide" Target="../notesSlides/notesSlide1.xml"/><Relationship Id="rId3" Type="${RTN}image" Target="../media/image1.png"/><Relationship Id="rId4" Type="${RTN}image" Target="../media/image2.png"/>`);
  z['ppt/slides/_rels/slide2.xml.rels']=rel(2,`<Relationship Id="rId3" Type="${RTN}image" Target="../media/image2.png"/>`);
  z['[Content_Types].xml']=strToU8(strFromU8(z['[Content_Types].xml']).replace('</Types>','<Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/></Types>'));
  extra(z);return zipSync(z);
}
test('duplicate: new part, rels, override, same shape ids, placed after the source',()=>{
  const src=richDeck(),out=duplicateSlide(src,256);
  const m=readDeckModel(out);assert.deepEqual(m.slides.map(s=>s.id),[256,259,257,258]);
  assert.equal(m.slides[1].part,'ppt/slides/slide4.xml');
  assert.deepEqual(m.slides[1].shapes.map(s=>s.id),m.slides[0].shapes.map(s=>s.id));
  assert.match(xmlOf(out,'[Content_Types].xml'),/PartName="\/ppt\/slides\/slide4.xml" ContentType="[^"]*slide\+xml"/);
  assert.match(xmlOf(out,'ppt/_rels/presentation.xml.rels'),/Id="rId\d+"[^>]*Target="slides\/slide4.xml"/);
  assert.equal(titles(out).filter((_,i)=>i%2===0).join(),'Slide 1,Slide 1,Slide 2,Slide 3');
  // untouched parts stay byte-equal, shared media is not copied
  const a=unzipSync(src),b=unzipSync(out);for(const k of Object.keys(a))if(!['ppt/presentation.xml','ppt/_rels/presentation.xml.rels','[Content_Types].xml'].includes(k))assert.deepEqual(b[k],a[k],k);
  assert.deepEqual(parts(out).filter(p=>p.includes('media')),['ppt/media/image1.png','ppt/media/image2.png']);
});
test('duplicate clones the notes slide and points it at the copy',()=>{
  const out=duplicateSlide(richDeck(),256);
  assert.ok(parts(out).includes('ppt/notesSlides/notesSlide2.xml'));
  assert.match(xmlOf(out,'ppt/notesSlides/_rels/notesSlide2.xml.rels'),/Target="..\/slides\/slide4.xml"/);
  assert.match(xmlOf(out,'ppt/slides/_rels/slide4.xml.rels'),/notesSlides\/notesSlide2.xml/);
  assert.match(xmlOf(out,'ppt/notesSlides/_rels/notesSlide1.xml.rels'),/slides\/slide1.xml/);
  assert.match(xmlOf(out,'[Content_Types].xml'),/notesSlide2.xml/);
});
test('duplicate refuses linked content it cannot copy, shared notes, and the 200 cap',()=>{
  const chart=richDeck(z=>{z['ppt/slides/_rels/slide2.xml.rels']=strToU8(strFromU8(z['ppt/slides/_rels/slide2.xml.rels']).replace('</Relationships>',`<Relationship Id="rId9" Type="${RTN}chart" Target="../charts/chart1.xml"/></Relationships>`));});
  assert.throws(()=>duplicateSlide(chart,257),/linked content \(chart\)/);
  const shared=richDeck(z=>{z['ppt/notesSlides/_rels/notesSlide1.xml.rels']=strToU8(`<Relationships xmlns="r"><Relationship Id="rId1" Type="${RTN}slide" Target="../slides/slide2.xml"/></Relationships>`);});
  assert.throws(()=>duplicateSlide(shared,256),/does not belong/);
  assert.throws(()=>duplicateSlide(richDeck(),12345),/no longer exists/);
  assert.throws(()=>duplicateSlide(deck(200),256),/at most 200/);
});
test('duplicate and then move round-trips; duplicate keeps sections consistent',()=>{
  const out=duplicateSlide(deck(4,{sections:[[1,2],[3,4]]}),257);
  assert.deepEqual(readDeckModel(out).sections,[{name:'Sec 1',ids:[256,257,260]},{name:'Sec 2',ids:[258,259]}]);
  assert.deepEqual(ids(out),[256,257,260,258,259]);
});
test('delete removes the slide, its rels, override, notes and exclusive media only',()=>{
  const src=richDeck(),out=deleteSlide(src,256);
  assert.deepEqual(ids(out),[257,258]);
  const p=parts(out);
  for(const gone of ['ppt/slides/slide1.xml','ppt/slides/_rels/slide1.xml.rels','ppt/notesSlides/notesSlide1.xml','ppt/notesSlides/_rels/notesSlide1.xml.rels','ppt/media/image1.png'])assert.ok(!p.includes(gone),gone);
  assert.ok(p.includes('ppt/media/image2.png'),'shared media stays');
  assert.doesNotMatch(xmlOf(out,'[Content_Types].xml'),/slide1.xml|notesSlide1/);
  assert.doesNotMatch(xmlOf(out,'ppt/_rels/presentation.xml.rels'),/slides\/slide1.xml/);
  assert.equal(titles(out).filter((_,i)=>i%2===0).join(),'Slide 2,Slide 3');
});
test('delete refuses the last slide, unknown ids, custom shows and inbound slide links',()=>{
  const one=deleteSlide(deck(2),256);assert.throws(()=>deleteSlide(one,257),/at least one slide/);
  assert.throws(()=>deleteSlide(deck(3),999),/no longer exists/);
  const z=unzipSync(deck(3));
  z['ppt/presentation.xml']=strToU8(strFromU8(z['ppt/presentation.xml']).replace('</p:presentation>','<p:custShowLst><p:custShow name="a" id="0"><p:sldLst><p:sld r:id="rId101"/></p:sldLst></p:custShow></p:custShowLst></p:presentation>'));
  assert.throws(()=>deleteSlide(zipSync(z),256),/custom show/);
  const y=unzipSync(deck(3));
  y['ppt/slides/_rels/slide2.xml.rels']=strToU8(strFromU8(y['ppt/slides/_rels/slide2.xml.rels']).replace('</Relationships>',`<Relationship Id="rId9" Type="${RTN}slide" Target="slide1.xml"/></Relationships>`));
  assert.throws(()=>deleteSlide(zipSync(y),256),/links to this slide/);
});
test('delete keeps sections valid, and duplicate+delete is a no-op on order',()=>{
  const out=deleteSlide(deck(4,{sections:[[1,2],[3,4]]}),257);
  assert.deepEqual(readDeckModel(out).sections,[{name:'Sec 1',ids:[256]},{name:'Sec 2',ids:[258,259]}]);
  const d=duplicateSlide(deck(3),257);assert.deepEqual(ids(deleteSlide(d,259)),[256,257,258]);
});
test('layouts are listed with a support verdict; new slide builds editable placeholders',()=>{
  const src=deck(2),layouts=readLayouts(src);
  assert.ok(layouts.length>=5);assert.ok(layouts.some(l=>l.supported)&&layouts.some(l=>!l.supported));
  const title=layouts.find(l=>l.supported&&l.placeholders.includes('ctrTitle'))!;
  const out=newSlideFromLayout(src,title.part,256);
  const m=readDeckModel(out);assert.deepEqual(m.slides.map(s=>s.id),[256,258,257]);
  assert.ok(m.slides[1].shapes.length>=1);assert.ok(m.slides[1].shapes.every(s=>s.kind==='text'));
  assert.match(xmlOf(out,m.slides[1].part.replace('slides/','slides/_rels/')+'.rels'),new RegExp(title.part.split('/').pop()!));
  const run=readRuns(out).find(r=>r.slide===1)!;assert.equal(run.text,'');
  const edited=makeEditedCopy(out,[{slide:1,run:run.run,old:'',text:'Hello',part:run.part}]);
  assert.ok(titles(edited).includes('Hello'));
  assert.deepEqual(ids(newSlideFromLayout(src,title.part,null)).slice(-1),[258]);
});
test('new slide refuses unsupported layouts, stale layouts and the 200 cap',()=>{
  const src=deck(2),bad=readLayouts(src).find(l=>!l.supported)!;
  assert.throws(()=>newSlideFromLayout(src,bad.part,256),/cannot create yet/);
  assert.throws(()=>newSlideFromLayout(src,'ppt/slideLayouts/slideLayout99.xml',256),/no longer exists/);
  assert.throws(()=>newSlideFromLayout(src,readLayouts(src).find(l=>l.supported)!.part,999),/no longer exists/);
  assert.throws(()=>newSlideFromLayout(deck(200),readLayouts(deck(2)).find(l=>l.supported)!.part,256),/at most 200/);
});

const B2={x:594360,y:640080,w:7955279,h:914400};
const patchPart=(bytes:Uint8Array,part:string,fn:(x:string)=>string)=>{const z=unzipSync(bytes);z[part]=strToU8(fn(strFromU8(z[part])));return zipSync(z);};
test('setShapeBounds rewrites only the target off/ext and verifies on reopen',()=>{
  const src=deck(2),next={...B2,x:700000,y:50000,w:5000000,h:400000},out=setShapeBounds(src,256,2,B2,next);
  const m=readDeckModel(out),b=m.slides[0].shapes[0].bounds!;
  assert.deepEqual({x:b.x,y:b.y,w:b.w,h:b.h},next);
  assert.deepEqual(m.slides[0].shapes[1].bounds,readDeckModel(src).slides[0].shapes[1].bounds);
  assert.deepEqual(m.slides[1].shapes.map(s=>s.bounds),readDeckModel(src).slides[1].shapes.map(s=>s.bounds));
  assert.deepEqual(m.runs.map(r=>r.text),readDeckModel(src).runs.map(r=>r.text));
  const a=unzipSync(src),z=unzipSync(out);
  for(const n of Object.keys(a))if(n!=='ppt/slides/slide1.xml')assert.deepEqual(z[n],a[n],n);
  const x=strFromU8(a['ppt/slides/slide1.xml']),y=strFromU8(z['ppt/slides/slide1.xml']);
});
test('setShapeBounds: move then move back restores the original model; no-op returns the same bytes',()=>{
  const src=deck(2),there=setShapeBounds(src,257,3,{x:594360,y:2011680,w:7955279,h:914400},{x:1,y:2,w:300000,h:400000});
  const back=setShapeBounds(there,257,3,{x:1,y:2,w:300000,h:400000},{x:594360,y:2011680,w:7955279,h:914400});
  assert.deepEqual(readDeckModel(back).slides,readDeckModel(src).slides);
  assert.equal(setShapeBounds(src,256,2,B2,B2),src);
});
test('setShapeBounds refuses stale, malformed and out-of-range input without writing',()=>{
  const src=deck(2),go=(slide:number,shape:number,exp:typeof B2,next:Record<string,number>)=>()=>setShapeBounds(src,slide,shape,exp,next as typeof B2);
  assert.throws(go(256,2,{...B2,x:1},{...B2,x:5}),/changed since selection/);
  assert.throws(go(999,2,B2,B2),/Slide no longer exists/);
  assert.throws(go(256,77,B2,B2),/Shape no longer exists/);
  assert.throws(go(256,2,B2,{...B2,x:1.5}),/whole EMU/);
  assert.throws(go(256,2,B2,{...B2,x:NaN}),/whole EMU/);
  assert.throws(go(256,2,B2,{...B2,w:0}),/Size is out of range/);
  assert.throws(go(256,2,B2,{...B2,w:126999}),/Size is out of range/);
  assert.throws(go(256,2,B2,{...B2,w:9144000*3}),/Size is out of range/);
  assert.throws(go(256,2,B2,{...B2,x:9144001}),/outside the slide/);
  assert.throws(go(256,2,B2,{...B2,y:-B2.h-1}),/outside the slide/);
});
test('setShapeBounds refuses rotated, flipped, picture, group, inherited and geometry-less shapes',()=>{
  const rot=patchPart(deck(2),'ppt/slides/slide1.xml',x=>x.replace('<a:xfrm>','<a:xfrm rot="900000">'));
  assert.equal(readDeckModel(rot).slides[0].shapes[0].bounds?.rot,900000);
  assert.throws(()=>setShapeBounds(rot,256,2,{...B2},{...B2,x:5}),/\(rotated\)/);
  const flip=patchPart(deck(2),'ppt/slides/slide1.xml',x=>x.replace('<a:xfrm>','<a:xfrm flipH="1">'));
  assert.throws(()=>setShapeBounds(flip,256,2,{...B2},{...B2,x:5}),/\(flipped\)/);
  const pic=deck(2,{picture:true});assert.equal(boundsEditIssue(readDeckModel(pic).slides[0].shapes[2]),'noBounds');
  assert.throws(()=>setShapeBounds(pic,256,9,B2,B2),/cannot be moved or resized/);
  assert.equal(boundsEditIssue({id:1,name:'',kind:'group',runCount:0,parentId:null,bounds:null,ph:null}),'notText');
  assert.equal(boundsEditIssue({id:1,name:'',kind:'text',runCount:0,parentId:5,bounds:null,ph:null}),'nested');
  assert.equal(boundsEditIssue({id:1,name:'',kind:'text',runCount:0,parentId:null,bounds:{...B2,rot:0,flipH:false,flipV:false,source:'layout'},ph:null}),'inherited');
  const noXfrm=patchPart(deck(2),'ppt/slides/slide1.xml',x=>x.replace(/<a:xfrm>[\s\S]*?<\/a:xfrm>/,''));
  assert.throws(()=>setShapeBounds(noXfrm,256,2,B2,B2),/cannot be moved or resized \((noBounds|inherited)\)/);
});
test('setShapeBounds fails closed on malformed or locked packages',()=>{
  const bad=patchPart(deck(2),'ppt/slides/slide1.xml',x=>x.replace('</p:spTree>',''));
  assert.throws(()=>setShapeBounds(bad,256,2,B2,{...B2,x:5}));
  assert.throws(()=>setShapeBounds(new Uint8Array([1,2,3]),256,2,B2,B2));
  const signed=(()=>{const z=unzipSync(deck(2));z['_xmlsignatures/sig1.xml']=strToU8('<x/>');return zipSync(z);})();
  assert.throws(()=>setShapeBounds(signed,256,2,B2,{...B2,x:5}),/signed/i);
  const dupId=patchPart(deck(2),'ppt/slides/slide1.xml',x=>x.replace('id="3"','id="2"'));
  assert.throws(()=>setShapeBounds(dupId,256,2,B2,{...B2,x:5}),/unsupported structure/);
});
test('setShapeBounds on real corpus decks: moves text boxes with own geometry or fails closed',()=>{
  const dir=fileURLToPath(new URL('../../../slides-engine/corpus/',import.meta.url));let edited=0;
  for(const f of readdirSync(dir).filter(n=>n.endsWith('.pptx'))){
    const bytes=new Uint8Array(readFileSync(dir+f));let model;try{model=readDeckModel(bytes);}catch{continue;}
    for(const sl of model.slides){if(sl.problems.length)continue;
      for(const sh of sl.shapes){if(boundsEditIssue(sh))continue;const b=sh.bounds!,from={x:b.x,y:b.y,w:b.w,h:b.h};
        let out:Uint8Array;try{out=setShapeBounds(bytes,sl.id,sh.id,from,{...from,x:from.x+12700,w:from.w+12700});}catch(e){assert.match(String(e),/not in a supported form|unsupported|cannot/,`${f}`);continue;}
        const nb=readDeckModel(out).slides.find(s=>s.id===sl.id)!.shapes.find(s=>s.id===sh.id)!.bounds!;
        assert.equal(nb.x,from.x+12700,f);edited++;}}}
  assert.ok(edited>0);
});
const shapeOf=(b:Uint8Array,slide:number,id:number)=>readDeckModel(b).slides.find(s=>s.id===slide)!.shapes.find(s=>s.id===id)!;
test('model reports shared explicit run formatting, null when mixed or inherited',()=>{
  const m=readDeckModel(deck(2)).slides[0].shapes;
  assert.deepEqual(m[0].fmt,{bold:true,italic:null,sizePt:32,color:'281E5A'});
  assert.deepEqual(m[1].fmt,{bold:null,italic:null,sizePt:20,color:null});
});
test('formatShapeText sets bold, italic, size and colour on every run and nothing else',()=>{
  const src=deck(2),out=formatShapeText(src,256,3,{bold:true,italic:true,sizePt:44,color:'c62828'});
  assert.deepEqual(shapeOf(out,256,3).fmt,{bold:true,italic:true,sizePt:44,color:'C62828'});
  assert.deepEqual(shapeOf(out,256,2),shapeOf(src,256,2));
  assert.deepEqual(readDeckModel(out).slides[1].shapes,readDeckModel(src).slides[1].shapes);
  assert.deepEqual(readDeckModel(out).runs,readDeckModel(src).runs);
  const x=strFromU8(unzipSync(out)['ppt/slides/slide1.xml']);
  assert.match(x,/<a:rPr sz="4400"[^>]*>|<a:rPr [^>]*sz="4400"/);assert.match(x,/<a:latin typeface="Ubuntu"\/>/);
  assert.equal((x.match(/<a:solidFill>/g)??[]).length,2);
  const a=unzipSync(src),z=unzipSync(out);for(const n of Object.keys(a))if(n!=='ppt/slides/slide1.xml')assert.deepEqual(z[n],a[n],n);
});
test('formatShapeText replaces an existing fill, keeps a:ln first, creates rPr when absent, and is idempotent',()=>{
  const lnDeck=patchPart(deck(2),'ppt/slides/slide1.xml',x=>x.replace('<a:rPr sz="2000">','<a:rPr sz="2000"><a:ln w="9525"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln><a:gradFill><a:gsLst/></a:gradFill>'));
  const out=formatShapeText(lnDeck,256,3,{color:'00ff00'}),x=strFromU8(unzipSync(out)['ppt/slides/slide1.xml']);
  assert.match(x,/<a:ln w="9525"><a:solidFill><a:srgbClr val="FF0000"\/><\/a:solidFill><\/a:ln><a:solidFill><a:srgbClr val="00FF00"\/><\/a:solidFill>/);assert.doesNotMatch(x,/gradFill/);
  assert.equal(shapeOf(out,256,3).fmt?.color,'00FF00');
  const bare=patchPart(deck(2),'ppt/slides/slide1.xml',x=>x.replace(/<a:rPr sz="2000">.*?<\/a:rPr>/,''));
  assert.equal(shapeOf(formatShapeText(bare,256,3,{bold:true}),256,3).fmt?.bold,true);
  const once=formatShapeText(deck(2),256,3,{bold:true});assert.equal(formatShapeText(once,256,3,{bold:true}),once);
  assert.equal(shapeOf(formatShapeText(once,256,3,{bold:false}),256,3).fmt?.bold,false);
});
test('formatShapeText refuses bad input, other shape kinds and unsupported slides',()=>{
  const src=deck(2),bad=(f:object)=>()=>formatShapeText(src,256,2,f as never);
  assert.throws(bad({}),/Nothing to format/);assert.throws(bad({bold:1}),/on or off/);assert.throws(bad({sizePt:5}),/Size must be/);assert.throws(bad({sizePt:201}),/Size must be/);assert.throws(bad({sizePt:12.5}),/Size must be/);
  assert.throws(bad({color:'#fff'}),/six hex/);assert.throws(bad({color:'GG0000'}),/six hex/);assert.throws(bad({font:'x'}),/Nothing to format/);
  assert.throws(()=>formatShapeText(src,999,2,{bold:true}),/Slide no longer exists/);assert.throws(()=>formatShapeText(src,256,99,{bold:true}),/Shape no longer exists/);
  assert.throws(()=>formatShapeText(deck(2,{picture:true}),256,9,{bold:true}),/Only text boxes/);
  const broken=patchPart(deck(2),'ppt/slides/slide1.xml',x=>x.replace('</p:spTree>',''));assert.throws(()=>formatShapeText(broken,256,2,{bold:true}));
});
test('addTextBox appends a verified text box with the next id and is undone by removeTextBox',()=>{
  const src=deck(2),out=addTextBox(src,256,'Hello & <you>'),id=nextShapeId(readDeckModel(src).slides[0]);
  assert.equal(id,4);const sh=shapeOf(out,256,id);assert.equal(sh.kind,'text');assert.equal(sh.name,'TextBox 3');assert.equal(sh.bounds?.source,'slide');
  assert.equal(readDeckModel(out).runs.find(r=>r.shapeId===id)?.text,'Hello & <you>');
  assert.deepEqual(readDeckModel(out).slides[1],readDeckModel(src).slides[1]);
  const a=unzipSync(src),z=unzipSync(out);for(const n of Object.keys(a))if(n!=='ppt/slides/slide1.xml')assert.deepEqual(z[n],a[n],n);
  const back=removeTextBox(out,256,id);assert.deepEqual(readDeckModel(back).slides,readDeckModel(src).slides);assert.deepEqual(readDeckModel(back).runs,readDeckModel(src).runs);
  assert.ok(sh.bounds!.x>=0&&sh.bounds!.x+sh.bounds!.w<=readDeckModel(out).slideSize!.cx);
  const moved=setShapeBounds(out,256,id,{x:sh.bounds!.x,y:sh.bounds!.y,w:sh.bounds!.w,h:sh.bounds!.h},{x:1,y:1,w:300000,h:300000});assert.equal(shapeOf(moved,256,id).bounds?.x,1);
});
test('addTextBox inserts before a trailing extLst and refuses bad text, missing slides and the shape cap',()=>{
  const ext=patchPart(deck(2),'ppt/slides/slide1.xml',x=>x.replace('</p:spTree>','<p:extLst><p:ext uri="{x}"/></p:extLst></p:spTree>'));
  const out=addTextBox(ext,256,'x'),xml=strFromU8(unzipSync(out)['ppt/slides/slide1.xml']);assert.ok(xml.indexOf('TextBox 3')<xml.indexOf('<p:extLst>'));
  assert.throws(()=>addTextBox(deck(2),256,''),/invalid/);assert.throws(()=>addTextBox(deck(2),256,'a\u0000b'),/invalid/);assert.throws(()=>addTextBox(deck(2),256,'a'.repeat(16385)),/invalid/);
  assert.throws(()=>addTextBox(deck(2),999,'x'),/no longer exists/);
  const many=patchPart(deck(2),'ppt/slides/slide1.xml',x=>x.replace('</p:spTree>',Array.from({length:498},(_,i)=>`<p:sp><p:nvSpPr><p:cNvPr id="${10+i}" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp>`).join('')+'</p:spTree>'));
  assert.throws(()=>addTextBox(many,256,'x'),/at most 500/);
});
test('removeTextBox removes one text box, refuses referenced, missing and non-text shapes',()=>{
  const src=deck(2),out=removeTextBox(src,256,2);assert.deepEqual(readDeckModel(out).slides[0].shapes.map(s=>s.id),[3]);
  assert.equal(readDeckModel(out).runs.length,readDeckModel(src).runs.length-1);assert.deepEqual(readDeckModel(out).slides[1],readDeckModel(src).slides[1]);
  const anim=patchPart(deck(2),'ppt/slides/slide1.xml',x=>x.replace('</p:cSld>','</p:cSld><p:timing><p:tnLst><p:par><p:cTn id="1"><p:childTnLst><p:set><p:cBhvr><p:tgtEl><p:spTgt spid="3"/></p:tgtEl></p:cBhvr></p:set></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>'));
  assert.throws(()=>removeTextBox(anim,256,3),/referenced/);assert.equal(readDeckModel(removeTextBox(anim,256,2)).slides[0].shapes.length,1);
  assert.throws(()=>removeTextBox(src,256,99),/no longer exists/);assert.throws(()=>removeTextBox(src,999,2),/no longer exists/);
  assert.throws(()=>removeTextBox(deck(2,{picture:true}),256,9),/Only text boxes/);
});
const mediaNames=(b:Uint8Array)=>Object.keys(unzipSync(b)).filter(n=>n.startsWith('ppt/media/')).sort();
const relText=(b:Uint8Array,n='ppt/slides/_rels/slide1.xml.rels')=>strFromU8(unzipSync(b)[n]);
const lastShape=(b:Uint8Array,slide=256)=>readDeckModel(b).slides.find(s=>s.id===slide)!.shapes.at(-1)!;
test('insertPicture adds media, relationship, content type default and a centred picture',()=>{
  const src=deck(2),img=png(800,600),out=insertPicture(src,256,img,'Team <photo> "one"');
  const pic=lastShape(out);assert.equal(pic.kind,'picture');assert.equal(pic.id,4);assert.equal(pic.name,'Picture 3');assert.equal(pic.bounds?.source,'slide');
  const sz=readDeckModel(out).slideSize!;assert.ok(pic.bounds!.w<=sz.cx*0.6+1&&pic.bounds!.h<=sz.cy*0.6+1);
  assert.ok(Math.abs(pic.bounds!.x*2+pic.bounds!.w-sz.cx)<=1);assert.ok(Math.abs(pic.bounds!.w/pic.bounds!.h-800/600)<0.01);
  assert.deepEqual(unzipSync(out)['ppt/media/image1.png'],img);
  assert.match(relText(out),/Id="rId2" Type="[^"]*\/image" Target="..\/media\/image1.png"/);
  assert.match(strFromU8(unzipSync(out)['[Content_Types].xml']),/<Default Extension="png" ContentType="image\/png"\/>/);
  assert.match(strFromU8(unzipSync(out)['ppt/slides/slide1.xml']),/descr="Team &lt;photo&gt; &quot;one&quot;"/);
  assert.deepEqual(readDeckModel(out).slides[1],readDeckModel(src).slides[1]);assert.deepEqual(readDeckModel(out).runs,readDeckModel(src).runs);
  const a=unzipSync(src),z=unzipSync(out);for(const n of Object.keys(a))if(!['ppt/slides/slide1.xml','ppt/slides/_rels/slide1.xml.rels','[Content_Types].xml'].includes(n))assert.deepEqual(z[n],a[n],n);
  const j=insertPicture(out,256,jpeg(300,300),'');assert.deepEqual(mediaNames(j),['ppt/media/image1.jpeg','ppt/media/image1.png']);assert.match(strFromU8(unzipSync(j)['[Content_Types].xml']),/Extension="jpeg"/);
  const again=insertPicture(j,256,png(10,10),'x');assert.deepEqual(mediaNames(again).length,3);assert.equal((strFromU8(unzipSync(again)['[Content_Types].xml']).match(/Extension="png"/g)??[]).length,1);
});
test('insertPicture refuses bad images, alt text, missing slides, extreme ratios and conflicting content types',()=>{
  const src=deck(2),go=(img:Uint8Array,alt='a',slide=256)=>()=>insertPicture(src,slide,img,alt);
  assert.throws(go(new Uint8Array(30)),/Only PNG and JPEG/);assert.throws(go(png(0,5)),/size could not/);assert.throws(go(png(20000,5)),/larger than/);
  assert.throws(go(png(10,10),'a'.repeat(201)),/Alt text/);assert.throws(go(png(10,10),'a\nb'),/Alt text/);
  assert.throws(go(png(10,10),'a',999),/no longer exists/);assert.throws(go(png(16000,10)),/too extreme/);
  const clash=patchPart(src,'[Content_Types].xml',x=>x.replace('<Types ','<Types ').replace(/(<Types\b[^>]*>)/,'$1<Default Extension="PNG" ContentType="image/x-other"/>'));
  assert.throws(()=>insertPicture(clash,256,png(10,10),'a'),/different content type/);
  const noNs=patchPart(src,'ppt/slides/slide1.xml',x=>x.replace(/ xmlns:r="[^"]*"/,''));assert.throws(()=>insertPicture(noNs,256,png(10,10),'a'));
  const broken=patchPart(src,'ppt/slides/slide1.xml',x=>x.replace('</p:spTree>',''));assert.throws(()=>insertPicture(broken,256,png(10,10),'a'));
});
test('a picture can be moved and resized like a text box',()=>{
  const out=insertPicture(deck(2),256,png(400,300),'a'),pic=lastShape(out),b=pic.bounds!;
  const moved=setShapeBounds(out,256,pic.id,{x:b.x,y:b.y,w:b.w,h:b.h},{x:b.x+1000,y:b.y,w:b.w,h:b.h});assert.equal(lastShape(moved).bounds?.x,b.x+1000);
  assert.deepEqual(unzipSync(moved)['ppt/media/image1.png'],unzipSync(out)['ppt/media/image1.png']);
});
test('replacePicture swaps media, fits the old box, and frees media nothing else uses',()=>{
  const ins=insertPicture(deck(2),256,png(800,600),'a'),pic=lastShape(ins),old=pic.bounds!;
  const out=replacePicture(ins,256,pic.id,jpeg(600,600)),n=lastShape(out).bounds!;
  assert.deepEqual(mediaNames(out),['ppt/media/image1.jpeg']);assert.equal(n.w,n.h);assert.ok(n.h<=old.h&&n.w<=old.w);
  assert.ok(Math.abs((n.x*2+n.w)-(old.x*2+old.w))<=2&&Math.abs((n.y*2+n.h)-(old.y*2+old.h))<=2);
  assert.doesNotMatch(relText(out),/image1\.png/);assert.match(relText(out),/image1\.jpeg/);
  assert.equal(readDeckModel(out).slides[0].shapes.length,readDeckModel(ins).slides[0].shapes.length);
});
test('replacePicture and removePicture keep media another slide still uses',()=>{
  const ins=insertPicture(deck(2),256,png(100,100),'a'),dup=duplicateSlide(ins,256);
  const dupPic=readDeckModel(dup).slides[1].shapes.at(-1)!;assert.equal(dupPic.kind,'picture');
  const rep=replacePicture(dup,256,lastShape(dup).id,png(50,50));assert.ok(mediaNames(rep).includes('ppt/media/image1.png'));assert.equal(mediaNames(rep).length,2);
  const rem=removePicture(dup,256,lastShape(dup).id);assert.deepEqual(mediaNames(rem),['ppt/media/image1.png']);
  const dupId=readDeckModel(dup).slides[1].id;const rem2=removePicture(rem,dupId,dupPic.id);assert.deepEqual(mediaNames(rem2),[]);assert.deepEqual(readDeckModel(rem2).slides.map(s=>s.shapes.length),[2,2,2]);
});
test('removePicture undoes insertPicture on the model and refuses referenced, missing and non-picture shapes',()=>{
  const src=deck(2),ins=insertPicture(src,256,png(10,10),'a'),id=lastShape(ins).id,back=removePicture(ins,256,id);
  assert.deepEqual(readDeckModel(back).slides,readDeckModel(src).slides);assert.deepEqual(mediaNames(back),[]);
  assert.throws(()=>removePicture(ins,256,2),/Only pictures/);assert.throws(()=>removePicture(ins,256,77),/no longer exists/);assert.throws(()=>removePicture(ins,999,id),/no longer exists/);
  const anim=patchPart(ins,'ppt/slides/slide1.xml',x=>x.replace('</p:cSld>',`</p:cSld><p:timing><p:tnLst><p:par><p:cTn id="1"><p:childTnLst><p:set><p:cBhvr><p:tgtEl><p:spTgt spid="${id}"/></p:tgtEl></p:cBhvr></p:set></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`));
  assert.throws(()=>removePicture(anim,256,id),/referenced/);
});
test('replacePicture refuses cropped, linked, rotated and effect-bearing pictures',()=>{
  const ins=insertPicture(deck(2),256,png(100,100),'a'),id=lastShape(ins).id;
  const crop=patchPart(ins,'ppt/slides/slide1.xml',x=>x.replace('<a:stretch>','<a:srcRect l="1000"/><a:stretch>'));assert.throws(()=>replacePicture(crop,256,id,png(10,10)),/cropping/);
  const ext=patchPart(ins,'ppt/slides/slide1.xml',x=>x.replace(/<a:blip ([^>]*)\/>/,'<a:blip $1><a:extLst/></a:blip>'));assert.throws(()=>replacePicture(ext,256,id,png(10,10)),/cropping, effects/);
  const rot=patchPart(ins,'ppt/slides/slide1.xml',x=>x.replace(/(<p:pic>[\s\S]*?)<a:xfrm>/,'$1<a:xfrm rot="900000">'));assert.throws(()=>replacePicture(rot,256,id,png(10,10)),/\(rotated\)/);
  const link=patchPart(ins,'ppt/slides/_rels/slide1.xml.rels',x=>x.replace(/Target="..\/media\/image1.png"/,'Target="http://example.com/a.png" TargetMode="External"'));assert.throws(()=>replacePicture(link,256,id,png(10,10)),/linked/);
  assert.throws(()=>replacePicture(ins,256,2,png(10,10)),/Only pictures/);assert.throws(()=>replacePicture(ins,256,id,new Uint8Array(40)),/Only PNG/);
});
test('fitImage contains, centres, caps at native size and rejects extreme ratios',()=>{
  assert.deepEqual(fitImage({width:100,height:100},{x:0,y:0,w:9525000,h:9525000},true),{x:4286250,y:4286250,w:952500,h:952500});
  assert.deepEqual(fitImage({width:100,height:50},{x:1000,y:1000,w:2000000,h:2000000},false),{x:1000,y:1000+Math.round((2000000-1000000)/2),w:2000000,h:1000000});
  assert.throws(()=>fitImage({width:16000,height:10},{x:0,y:0,w:9000000,h:5000000},true),/too extreme/);
});
test('committed Rust importer fixtures match the generator (regenerate if the model changes)',()=>{
  const d=new URL('../../../slides-engine/fixtures/',import.meta.url),f=(n:string)=>new Uint8Array(readFileSync(fileURLToPath(new URL(n,d))));
  const orig=f('independent.pptx'),m=readDeckModel(orig).slides.map(s=>s.id);
  const layout=readLayouts(orig).find(l=>l.supported&&l.placeholders.includes('ctrTitle'))!;
  assert.deepEqual(f('reordered.pptx'),moveSlide(orig,m[1],0));
  assert.deepEqual(f('duplicated.pptx'),duplicateSlide(orig,m[0]));
  assert.deepEqual(f('deleted.pptx'),deleteSlide(orig,m[0]));
  assert.deepEqual(f('newslide.pptx'),newSlideFromLayout(orig,layout.part,m[0]));
});

test('readSlideNotes reads only the body placeholder, decodes entities and bounds output',()=>{
  const sp=(type:string,body:string)=>`<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr><p:txBody>${body}</p:txBody></p:sp>`;
  const notes=(body:string)=>richDeck(z=>{z['ppt/notesSlides/notesSlide1.xml']=strToU8(`<p:notes xmlns:a="a" xmlns:p="p">${sp('sldImg','<a:p><a:r><a:t>IMAGE</a:t></a:r></a:p>')}${body}${sp('sldNum','<a:p><a:r><a:t>7</a:t></a:r></a:p>')}</p:notes>`);});
  const b=notes(sp('body','<a:p><a:r><a:t>Say &amp; show</a:t></a:r><a:br/><a:r><a:t>twice</a:t></a:r></a:p><a:p><a:r><a:t>Second</a:t></a:r></a:p><a:p></a:p>'));
  assert.deepEqual(readSlideNotes(b,256),['Say & show\ntwice','Second']);
  assert.deepEqual(readSlideNotes(b,257),[]);
  assert.throws(()=>readSlideNotes(b,999),/Slide not found/);
  const long=notes(sp('body',`<a:p><a:r><a:t>${'x'.repeat(30000)}</a:t></a:r></a:p>`));assert.deepEqual(readSlideNotes(long,256),[]);
  const many=notes(sp('body','<a:p><a:r><a:t>l</a:t></a:r></a:p>'.repeat(500)));assert.equal(readSlideNotes(many,256).length,200);
  const evil=richDeck(z=>{z['ppt/slides/_rels/slide1.xml.rels']=strToU8(strFromU8(z['ppt/slides/_rels/slide1.xml.rels']).replace('../notesSlides/notesSlide1.xml','../../../etc/passwd'));});
  assert.deepEqual(readSlideNotes(evil,256),[]);
  assert.deepEqual(readSlideNotes(richDeck(),256),[]);
});
test('setShapesBounds applies every edit or none, and bounds the batch',()=>{
  const b=deck(1),m=readDeckModel(b),slide=m.slides[0];
  const boxes=slide.shapes.filter(s=>boundsEditIssue(s)===null);
  assert.ok(boxes.length>=1);
  const one=boxes[0],from=one.bounds!,to={x:from.x+12700,y:from.y,w:from.w,h:from.h};
  const out=setShapesBounds(b,slide.id,[{shapeId:one.id,expected:{x:from.x,y:from.y,w:from.w,h:from.h},next:to}]);
  assert.equal(readDeckModel(out).slides[0].shapes.find(s=>s.id===one.id)!.bounds!.x,to.x);
  assert.throws(()=>setShapesBounds(b,slide.id,[]),/between 1 and 50/);
  assert.throws(()=>setShapesBounds(b,slide.id,Array.from({length:51},()=>({shapeId:one.id,expected:to,next:to}))),/between 1 and 50/);
  assert.throws(()=>setShapesBounds(b,slide.id,[{shapeId:one.id,expected:to,next:to},{shapeId:one.id,expected:to,next:to}]),/once per action/);
  assert.throws(()=>setShapesBounds(b,slide.id,[{shapeId:one.id,expected:{x:from.x+1,y:from.y,w:from.w,h:from.h},next:to}]),/changed since selection/);
  assert.throws(()=>setShapesBounds(b,slide.id,[{shapeId:one.id,expected:{x:from.x,y:from.y,w:from.w,h:from.h},next:to},{shapeId:99999,expected:to,next:to}]),/no longer exists/);
});
