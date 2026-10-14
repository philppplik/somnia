import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {editSections,setSlideHidden,readHiddenSlides,setFirstSlideNum,readFirstSlideNum,setSlideFooter,setAllSlideFooters,readSlideFooter,setSlideSize,readSlideSize,setAllSlideBackgrounds,backgroundSummary,setSlideBackground,readSlideBackground,editLayoutBox,readLayoutBoxes,editMasterBox,readMaster,editTheme,readTheme,insertTable,editTable,readTable,setShapeStyle,readShapeStyle,setSlideNotes,groupShapes,ungroupShape,readSlideTransition,setSlideTransition,arrangeShapes,arrangedOrder,setShapesBounds,readSlideNotes,insertPicture,replacePicture,removePicture,fitImage,formatShapeText,addTextBox,removeTextBox,nextShapeId,setShapeBounds,boundsEditIssue,readDeckModel,moveSlide,reorderSlides,duplicateSlide,deleteSlide,newSlideFromLayout,readLayouts} from './deckPackage';
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
  assert.equal(boundsEditIssue({id:1,name:'',kind:'table',runCount:0,parentId:null,bounds:null,ph:null}),'notText');assert.equal(boundsEditIssue({id:1,name:'',kind:'group',runCount:0,parentId:null,bounds:null,ph:null}),'noBounds');
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
test('arrangedOrder moves selections to the ends or one step, skipping other selected shapes',()=>{
  const ids=[1,2,3,4,5],sel=(...n:number[])=>new Set(n);
  assert.deepEqual(arrangedOrder(ids,sel(2,4),'front'),[1,3,5,2,4]);
  assert.deepEqual(arrangedOrder(ids,sel(2,4),'back'),[2,4,1,3,5]);
  assert.deepEqual(arrangedOrder(ids,sel(2,3),'forward'),[1,4,2,3,5]);
  assert.deepEqual(arrangedOrder(ids,sel(3,4),'backward'),[1,3,4,2,5]);
  assert.deepEqual(arrangedOrder(ids,sel(5),'forward'),ids);
  assert.deepEqual(arrangedOrder(ids,sel(1),'backward'),ids);
  assert.deepEqual(arrangedOrder(ids,sel(1,2,3,4,5),'front'),ids);
});
test('arrangeShapes reorders whole elements, keeps everything else byte-identical, and fails closed',()=>{
  let b=deck(1,{picture:true});const sid=readDeckModel(b).slides[0].id;
  b=addTextBox(b,sid,'One');b=addTextBox(b,sid,'Two');
  const top=(x:Uint8Array)=>readDeckModel(x).slides[0].shapes.filter(s=>s.parentId===null).map(s=>s.id);
  const order=top(b);assert.ok(order.length>=4);
  const first=order[0],last=order[order.length-1];
  const front=arrangeShapes(b,sid,[first],'front');assert.deepEqual(top(front),[...order.slice(1),first]);
  assert.deepEqual(readDeckModel(front).runs.map(r=>r.text).sort(),readDeckModel(b).runs.map(r=>r.text).sort());
  const back=arrangeShapes(b,sid,[last],'back');assert.deepEqual(top(back),[last,...order.slice(0,-1)]);
  assert.equal(arrangeShapes(b,sid,[last],'front'),b,'already in front: same bytes');
  const rest=order.slice(1);assert.deepEqual(top(arrangeShapes(front,sid,[first],'backward')),[...rest.slice(0,-1),first,rest[rest.length-1]]);
  assert.throws(()=>arrangeShapes(b,sid,[],'front'),/between 1 and 50/);
  assert.throws(()=>arrangeShapes(b,sid,[first,first],'front'),/different shapes/);
  assert.throws(()=>arrangeShapes(b,sid,[99999],'front'),/no longer exists/);
  assert.throws(()=>arrangeShapes(b,999,[first],'front'),/Slide no longer exists/);
  assert.throws(()=>arrangeShapes(b,sid,[first],'sideways' as never),/Unknown arrange mode/);
});

test('slide transitions: set, change, clear, keep attributes, fail closed',()=>{
  const b=deck(2),sid=readDeckModel(b).slides[0].id;
  assert.deepEqual(readSlideTransition(b,sid),{transition:{kind:'none',dir:'l',speed:'med'},editable:true,other:false});
  assert.equal(setSlideTransition(b,sid,{kind:'none',dir:'l',speed:'med'}),b,'clearing nothing: same bytes');
  const p=setSlideTransition(b,sid,{kind:'push',dir:'r',speed:'fast'});
  assert.deepEqual(readSlideTransition(p,sid).transition,{kind:'push',dir:'r',speed:'fast'});
  assert.deepEqual(readSlideTransition(p,readDeckModel(b).slides[1].id).transition.kind,'none','other slides untouched');
  assert.deepEqual(readDeckModel(p).runs.map(r=>r.text),readDeckModel(b).runs.map(r=>r.text));
  const x=strFromU8(unzipSync(p)['ppt/slides/slide1.xml']);
  assert.ok(x.indexOf('<p:transition')>x.indexOf('</p:cSld>'));assert.equal((x.match(/<p:transition\b/g)??[]).length,1);
  const f=setSlideTransition(p,sid,{kind:'fade',dir:'l',speed:'slow'});assert.deepEqual(readSlideTransition(f,sid).transition.kind,'fade');
  assert.equal(setSlideTransition(f,sid,{kind:'fade',dir:'u',speed:'slow'}),f,'dir is irrelevant for fade');
  const c=setSlideTransition(f,sid,{kind:'none',dir:'l',speed:'med'});assert.ok(!/<p:transition/.test(strFromU8(unzipSync(c)['ppt/slides/slide1.xml'])));
  const adv=patchPart(b,'ppt/slides/slide1.xml',s=>s.replace('</p:cSld>','</p:cSld><p:transition spd="slow" advClick="0" advTm="3000"><p:wipe dir="u"/></p:transition>'));
  assert.deepEqual(readSlideTransition(adv,sid).transition,{kind:'wipe',dir:'u',speed:'slow'});
  const adv2=setSlideTransition(adv,sid,{kind:'cover',dir:'d',speed:'med'});
  assert.match(strFromU8(unzipSync(adv2)['ppt/slides/slide1.xml']),/<p:transition spd="med" advClick="0" advTm="3000"><p:cover dir="d"\/>/);
  const rich=patchPart(b,'ppt/slides/slide1.xml',s=>s.replace('</p:cSld>','</p:cSld><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="p14"><p:transition spd="med"><p14:vortex xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="med"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>'));
  const info=readSlideTransition(rich,sid);assert.equal(info.editable,false);assert.equal(info.transition.kind,'fade');
  assert.throws(()=>setSlideTransition(rich,sid,{kind:'push',dir:'l',speed:'med'}),/cannot be edited/);
  const snd=patchPart(b,'ppt/slides/slide1.xml',s=>s.replace('</p:cSld>','</p:cSld><p:transition><p:fade/><p:sndAc/></p:transition>'));
  assert.equal(readSlideTransition(snd,sid).editable,false);assert.throws(()=>setSlideTransition(snd,sid,{kind:'none',dir:'l',speed:'med'}),/cannot be edited/);
  assert.throws(()=>setSlideTransition(b,sid,{kind:'spin' as never,dir:'l',speed:'med'}),/Unknown transition/);
  assert.throws(()=>setSlideTransition(b,999,{kind:'fade',dir:'l',speed:'med'}),/no longer exists/);
});

test('layouts expose bounded placeholder frames for previews (own or inherited from the master)',()=>{
  const ls=readLayouts(deck(2));assert.ok(ls.length>0);
  for(const l of ls){assert.ok(l.boxes.length<=24);for(const b of l.boxes){assert.ok(b.w>0&&b.h>0);assert.ok(Number.isFinite(b.x)&&Number.isFinite(b.y));}}
  assert.ok(ls.some(l=>l.supported&&l.boxes.length>0),'at least one supported layout has a frame');
  assert.ok(ls.every(l=>l.boxes.length<=l.placeholders.length),'never more frames than placeholders');
  const corpus=readLayouts(readFileSync(fileURLToPath(new URL('../../../slides-engine/corpus/google-slides-effects-transitions-2026-05-08.pptx',import.meta.url))));
  assert.ok(corpus.some(l=>l.boxes.length>0),'real Google Slides deck gives frames');
});

test('group and ungroup keep children, move as a unit, and fail closed',()=>{
  let b=deck(2);const sid=readDeckModel(b).slides[0].id;
  b=addTextBox(b,sid,'One');b=addTextBox(b,sid,'Two');
  const m0=readDeckModel(b),boxes=m0.slides[0].shapes.filter(s=>!s.ph&&s.kind==='text'),ids=boxes.slice(-2).map(s=>s.id);
  assert.equal(ids.length,2);
  assert.throws(()=>groupShapes(b,sid,[ids[0]]),/between 2 and 50/);
  assert.throws(()=>groupShapes(b,sid,[ids[0],ids[0]]),/different shapes/);
  assert.throws(()=>groupShapes(b,sid,[ids[0],99999]),/no longer exists/);
  const ph=m0.slides[0].shapes.find(s=>s.ph);if(ph)assert.throws(()=>groupShapes(b,sid,[ids[0],ph.id]),/Placeholders|cannot be grouped/);
  const g=groupShapes(b,sid,ids),m1=readDeckModel(g),gs=m1.slides[0].shapes,grp=gs.find(s=>s.kind==='group')!;
  assert.ok(grp&&grp.parentId===null);assert.deepEqual(ids.map(i=>gs.find(s=>s.id===i)!.parentId),[grp.id,grp.id]);
  assert.deepEqual(m1.runs.map(r=>r.text),m0.runs.map(r=>r.text));
  const bs=ids.map(i=>m0.slides[0].shapes.find(s=>s.id===i)!.bounds!);
  assert.equal(grp.bounds!.x,Math.min(...bs.map(x=>x.x)));assert.equal(grp.bounds!.w,Math.max(...bs.map(x=>x.x+x.w))-grp.bounds!.x);
  assert.throws(()=>groupShapes(g,sid,[ids[0],ids[1]]),/cannot be grouped \(nested\)|no longer exists/);
  // plain ungroup restores the original shapes exactly
  const u=ungroupShape(g,sid,grp.id),m2=readDeckModel(u);
  assert.deepEqual(m2.slides[0].shapes.map(s=>[s.id,s.parentId,JSON.stringify(s.bounds)]),m0.slides[0].shapes.map(s=>[s.id,s.parentId,JSON.stringify(s.bounds)]));
  assert.throws(()=>ungroupShape(u,sid,ids[0]),/not a group/);
  // a group moves as a unit and its children keep their own coordinates
  const gb=grp.bounds!,to={x:gb.x+127000,y:gb.y+254000,w:gb.w,h:gb.h};
  const mv=setShapeBounds(g,sid,grp.id,{x:gb.x,y:gb.y,w:gb.w,h:gb.h},to),mvm=readDeckModel(mv).slides[0].shapes;
  assert.equal(mvm.find(s=>s.id===grp.id)!.bounds!.x,to.x);
  // ungrouping a moved (not resized) group applies the move to the children
  const mu=readDeckModel(ungroupShape(mv,sid,grp.id)).slides[0].shapes;
  assert.equal(mu.find(s=>s.id===ids[0])!.bounds!.x,bs[0].x+127000);
  assert.equal(mu.find(s=>s.id===ids[0])!.bounds!.y,bs[0].y+254000);
  // a resized group (children scaled by the renderer) is refused rather than changed
  const rs=setShapeBounds(g,sid,grp.id,{x:gb.x,y:gb.y,w:gb.w,h:gb.h},{x:gb.x,y:gb.y,w:gb.w+127000,h:gb.h});
  assert.throws(()=>ungroupShape(rs,sid,grp.id),/Resized groups/);
  const rot=patchPart(g,'ppt/slides/slide1.xml',x=>x.replace(/<p:grpSpPr><a:xfrm>/,'<p:grpSpPr><a:xfrm rot="900000">'));
  assert.throws(()=>ungroupShape(rot,sid,grp.id),/Rotated or flipped/);
});

test('setSlideNotes edits an existing notes body, creates a page when a notes master exists, and fails closed',()=>{
  const corpus=new Uint8Array(readFileSync(fileURLToPath(new URL('../../../slides-engine/corpus/google-slides-effects-transitions-2026-05-08.pptx',import.meta.url))));
  const sid=readDeckModel(corpus).slides[0].id,m0=readDeckModel(corpus);
  assert.deepEqual(readSlideNotes(corpus,sid),[]);
  assert.equal(setSlideNotes(corpus,sid,[]),corpus,'nothing to clear: same bytes');
  const a=setSlideNotes(corpus,sid,['First <point> & more','','Second line\nwith break']);
  assert.deepEqual(readSlideNotes(a,sid),['First <point> & more','','Second line\nwith break']);
  assert.deepEqual(readDeckModel(a).slides.map(s=>s.shapes.length),m0.slides.map(s=>s.shapes.length));
  assert.equal(readDeckModel(a).runs.length,m0.runs.length);
  assert.equal(setSlideNotes(a,sid,['First <point> & more','','Second line\nwith break']),a,'unchanged: same bytes');
  const b=setSlideNotes(a,sid,['Only this']);assert.deepEqual(readSlideNotes(b,sid),['Only this']);
  assert.deepEqual(readSlideNotes(setSlideNotes(b,sid,[]),sid),[]);
  assert.deepEqual(readSlideNotes(a,m0.slides[1].id),[],'other slides untouched');
  // a slide without a notes page gets one (the deck has a notes master)
  const noPage=patchPart(corpus,'ppt/slides/_rels/slide1.xml.rels',x=>x.replace(/<Relationship [^>]*notesSlide"[^>]*\/>/,''));
  assert.deepEqual(readSlideNotes(noPage,sid),[]);
  const c=setSlideNotes(noPage,sid,['Created notes']);assert.deepEqual(readSlideNotes(c,sid),['Created notes']);
  const z=unzipSync(c);assert.ok(Object.keys(z).some(k=>/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(k)&&strFromU8(z[k]).includes('Created notes')));
  assert.equal(setSlideNotes(noPage,sid,[]),noPage,'no page and nothing to write: same bytes');
  // no notes master: refuse
  assert.throws(()=>setSlideNotes(deck(2),readDeckModel(deck(2)).slides[0].id,['x']),/no notes master/);
  // bounds and malformed input
  assert.throws(()=>setSlideNotes(corpus,sid,Array.from({length:201},()=>'x')),/at most 200/);
  assert.throws(()=>setSlideNotes(corpus,sid,['x'.repeat(20001)]),/at most 20000/);
  assert.throws(()=>setSlideNotes(corpus,sid,['bad\u0000char']),/unsupported characters/);
  assert.throws(()=>setSlideNotes(corpus,sid,[5 as never]),/must be text/);
  assert.throws(()=>setSlideNotes(corpus,999,['x']),/no longer exists/);
});

test('shape styling: fill, opacity, gradient, outline, shadow; fails closed',()=>{
  let b=deck(2);const sid=readDeckModel(b).slides[0].id;
  b=addTextBox(b,sid,'One');b=addTextBox(b,sid,'Two');
  const ids=readDeckModel(b).slides[0].shapes.filter(s=>!s.ph).slice(-2).map(s=>s.id),[a,c]=ids;
  const m0=readDeckModel(b);
  const s0=readShapeStyle(b,sid,a);assert.equal(s0.shadow,'none');assert.equal(s0.editable,true);assert.equal(s0.fillable,true);
  const f=setShapeStyle(b,sid,ids,{fill:{kind:'solid',color:'1F5FBF',alpha:60}});
  for(const id of ids)assert.deepEqual(readShapeStyle(f,sid,id).fill,{kind:'solid',color:'1F5FBF',alpha:60});
  assert.equal(JSON.stringify(readDeckModel(f).slides[0].shapes),JSON.stringify(m0.slides[0].shapes),'geometry and text untouched');
  assert.equal(setShapeStyle(f,sid,ids,{fill:{kind:'solid',color:'1F5FBF',alpha:60}}),f,'same style: same bytes');
  const g=setShapeStyle(f,sid,[a],{fill:{kind:'gradient',from:'1F5FBF',to:'C62828',angle:45,alpha:100}});
  assert.deepEqual(readShapeStyle(g,sid,a).fill,{kind:'gradient',color:'1F5FBF',to:'C62828',angle:45,alpha:100});
  assert.equal(readShapeStyle(g,sid,c).fill.kind,'solid','other shape untouched');
  const n=setShapeStyle(g,sid,[a],{fill:{kind:'none'}});assert.equal(readShapeStyle(n,sid,a).fill.kind,'none');
  const l=setShapeStyle(n,sid,[a],{line:{kind:'solid',color:'2E7D32',widthPt:2.5,dash:'dash'},shadow:true});
  assert.deepEqual(readShapeStyle(l,sid,a).line,{kind:'solid',color:'2E7D32',widthPt:2.5,dash:'dash'});assert.equal(readShapeStyle(l,sid,a).shadow,'outer');
  const x=strFromU8(unzipSync(l)['ppt/slides/slide1.xml']);
  assert.ok(x.indexOf('</a:prstGeom>')<x.indexOf('<a:noFill/><a:ln w="31750"'),'schema order: geom, fill, ln');assert.ok(x.indexOf('<a:ln w="31750"')<x.indexOf('<a:effectLst>'));
  const off=setShapeStyle(l,sid,[a],{shadow:false,line:{kind:'none'}});assert.equal(readShapeStyle(off,sid,a).shadow,'none');assert.equal(readShapeStyle(off,sid,a).line.kind,'none');
  // an existing outline keeps its other settings (arrowheads)
  const keep=patchPart(l,'ppt/slides/slide1.xml',s=>s.replace(/(<a:ln w="31750"[^>]*>[\s\S]*?)<\/a:ln>/,'$1<a:headEnd type="triangle"/></a:ln>'));
  const k2=setShapeStyle(keep,sid,[a],{line:{kind:'solid',color:'C62828',widthPt:1,dash:'dot'}});
  assert.match(strFromU8(unzipSync(k2)['ppt/slides/slide1.xml']),/<a:ln w="12700"><a:solidFill><a:srgbClr val="C62828"\/><\/a:solidFill><a:prstDash val="sysDot"\/><a:headEnd type="triangle"\/><\/a:ln>/);
  // fail closed
  const blip=patchPart(b,'ppt/slides/slide1.xml',s=>s.replace(new RegExp(`(<p:cNvPr id="${a}"[\\s\\S]*?<a:prstGeom[^>]*>[\\s\\S]*?</a:prstGeom>)`),'$1<a:pattFill prst="dkUpDiag"/>'));
  assert.equal(readShapeStyle(blip,sid,a).editable,false);assert.throws(()=>setShapeStyle(blip,sid,[a],{fill:{kind:'none'}}),/cannot be edited/);
  assert.equal(readShapeStyle(blip,sid,a).fill.kind,'other');
  const dag=patchPart(b,'ppt/slides/slide1.xml',s=>s.replace(new RegExp(`(<p:cNvPr id="${a}"[\\s\\S]*?</a:prstGeom>)`),'$1<a:effectDag/>'));
  assert.throws(()=>setShapeStyle(dag,sid,[a],{shadow:true}),/cannot be edited/);
  assert.throws(()=>setShapeStyle(b,sid,[a],{fill:{kind:'solid',color:'zz',alpha:100}}),/6-digit/);
  assert.throws(()=>setShapeStyle(b,sid,[a],{fill:{kind:'solid',color:'1F5FBF',alpha:0}}),/Opacity/);
  assert.throws(()=>setShapeStyle(b,sid,[a],{fill:{kind:'gradient',from:'1F5FBF',to:'C62828',angle:360,alpha:100}}),/angle/);
  assert.throws(()=>setShapeStyle(b,sid,[a],{line:{kind:'solid',color:'1F5FBF',widthPt:0,dash:'solid'}}),/width/);
  assert.throws(()=>setShapeStyle(b,sid,[a],{line:{kind:'solid',color:'1F5FBF',widthPt:21,dash:'solid'}}),/width/);
  assert.throws(()=>setShapeStyle(b,sid,[a],{}),/Nothing to change/);
  assert.throws(()=>setShapeStyle(b,sid,[],{shadow:true}),/between 1 and 50/);
  assert.throws(()=>setShapeStyle(b,sid,[a,a],{shadow:true}),/different shapes/);
  assert.throws(()=>setShapeStyle(b,sid,[99999],{shadow:true}),/no longer exists/);
  assert.throws(()=>setShapeStyle(b,999,[a],{shadow:true}),/no longer exists/);
  // pictures: outline and shadow yes, fill no
  const pic=deck(2,{picture:true}),pid=readDeckModel(pic).slides[0].shapes.find(s=>s.kind==='picture')!.id;
  assert.equal(readShapeStyle(pic,readDeckModel(pic).slides[0].id,pid).fillable,false);
  const pl=setShapeStyle(pic,readDeckModel(pic).slides[0].id,[pid],{line:{kind:'solid',color:'000000',widthPt:1,dash:'solid'},shadow:true});
  assert.equal(readShapeStyle(pl,readDeckModel(pl).slides[0].id,pid).shadow,'outer');
  assert.throws(()=>setShapeStyle(pic,readDeckModel(pic).slides[0].id,[pid],{fill:{kind:'none'}}),/Pictures cannot be filled/);
});

const tcXml=(t:string,extra='')=>`<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="l"/>${t?`<a:r><a:rPr lang="en-US" b="1"/><a:t>${t}</a:t></a:r>`:'<a:endParaRPr lang="en-US"/>'}</a:p></a:txBody>${extra||'<a:tcPr/>'}</a:tc>`;
function tableDeck(opts:{merged?:boolean;fld?:boolean}={}):{b:Uint8Array;sid:number;tid:number}{
  const base2=deck(2),sid=readDeckModel(base2).slides[0].id;
  const rows=[['A1','B1','C1'],['A2','B&amp;2','C2']].map((r,i)=>`<a:tr h="370840">${r.map((x,j)=>tcXml(x,i===0&&j===0?'<a:tcPr marL="91440"><a:lnL w="12700"><a:noFill/></a:lnL></a:tcPr>':'')).join('')}<a:extLst><a:ext uri="{0D108BD9-81ED-4DB2-BD59-A6C34878D82A}"/></a:extLst></a:tr>`).join('');
  let frame=`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="40" name="Table 39"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="914400" y="914400"/><a:ext cx="3000000" cy="741680"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid><a:gridCol w="1000000"/><a:gridCol w="1000000"/><a:gridCol w="1000000"/></a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  if(opts.merged)frame=frame.replace('<a:tc>','<a:tc gridSpan="2">');
  if(opts.fld)frame=frame.replace('<a:r><a:rPr lang="en-US" b="1"/><a:t>A1</a:t></a:r>','<a:fld id="{1}" type="slidenum"><a:t>1</a:t></a:fld>');
  const b=patchPart(base2,'ppt/slides/slide1.xml',x=>x.replace('</p:spTree>',frame+'</p:spTree>'));
  return {b,sid,tid:40};
}
test('table editing: read, cell text, rows, columns, header, fill',()=>{
  const {b,sid,tid}=tableDeck(),r=readTable(b,sid,tid);
  assert.equal(r.editable,true);assert.deepEqual([r.rows,r.cols,r.header],[2,3,true]);assert.equal(r.cells[1][1],'B&2');
  assert.equal(readDeckModel(b).slides[0].shapes.find(s=>s.id===tid)!.kind,'table');
  const e=editTable(b,sid,tid,{kind:'cell',row:0,col:1,text:'New <x> & "y"\nsecond'});
  assert.equal(readTable(e,sid,tid).cells[0][1],'New <x> & "y"\nsecond');
  const xml=strFromU8(unzipSync(e)['ppt/slides/slide1.xml']);assert.ok(xml.includes('<a:rPr lang="en-US" b="1"/><a:t>New &lt;x&gt; &amp; "y"</a:t>'),'run format kept');assert.ok(xml.includes('<a:pPr algn="l"/>'));
  assert.equal(editTable(e,sid,tid,{kind:'cell',row:0,col:1,text:'New <x> & "y"\nsecond'}),e,'no-op returns same bytes');
  const empty=editTable(e,sid,tid,{kind:'cell',row:1,col:0,text:''});assert.equal(readTable(empty,sid,tid).cells[1][0],'');
  const typed=editTable(empty,sid,tid,{kind:'cell',row:1,col:0,text:'back'});assert.ok(strFromU8(unzipSync(typed)['ppt/slides/slide1.xml']).includes('lang="en-US"'));
  // rows
  const ir=editTable(b,sid,tid,{kind:'insertRow',at:1});let t=readTable(ir,sid,tid);assert.equal(t.rows,3);assert.deepEqual(t.cells[1],['','','']);assert.equal(t.cells[2][0],'A2');
  assert.equal(readDeckModel(ir).slides[0].shapes.find(s=>s.id===tid)!.bounds!.h,741680+370840);
  const end=editTable(b,sid,tid,{kind:'insertRow',at:2});assert.equal(readTable(end,sid,tid).cells[2][0],'');
  const rr=editTable(ir,sid,tid,{kind:'removeRow',at:1});assert.deepEqual(readTable(rr,sid,tid).cells,r.cells);assert.equal(readDeckModel(rr).slides[0].shapes.find(s=>s.id===tid)!.bounds!.h,741680);
  // columns keep total width
  const ic=editTable(b,sid,tid,{kind:'insertCol',at:1});t=readTable(ic,sid,tid);assert.equal(t.cols,4);assert.deepEqual(t.cells[0],['A1','','B1','C1']);
  const widths=(x:Uint8Array)=>[...strFromU8(unzipSync(x)['ppt/slides/slide1.xml']).matchAll(/<a:gridCol w="(\d+)"/g)].map(m=>Number(m[1]));
  assert.equal(widths(ic).reduce((a,c)=>a+c,0),3000000);assert.equal(widths(ic).length,4);
  const rc=editTable(ic,sid,tid,{kind:'removeCol',at:1});assert.deepEqual(readTable(rc,sid,tid).cells,r.cells);assert.equal(widths(rc).reduce((a,c)=>a+c,0),3000000);
  assert.equal(readTable(editTable(b,sid,tid,{kind:'removeCol',at:0}),sid,tid).cells[0][0],'B1');
  // header + fill
  const h=editTable(b,sid,tid,{kind:'header',on:false});assert.equal(readTable(h,sid,tid).header,false);assert.equal(readTable(editTable(h,sid,tid,{kind:'header',on:true}),sid,tid).header,true);
  const f=editTable(b,sid,tid,{kind:'fill',scope:'row',row:0,col:0,fill:{kind:'solid',color:'1F5FBF'}});t=readTable(f,sid,tid);
  assert.deepEqual(t.fills,[['1F5FBF','1F5FBF','1F5FBF'],[null,null,null]]);
  const fx=strFromU8(unzipSync(f)['ppt/slides/slide1.xml']);assert.ok(fx.includes('<a:tcPr marL="91440"><a:lnL w="12700"><a:noFill/></a:lnL><a:solidFill><a:srgbClr val="1F5FBF"/></a:solidFill></a:tcPr>'),'fill after borders, attrs kept');
  const col=editTable(f,sid,tid,{kind:'fill',scope:'column',row:0,col:2,fill:{kind:'none'}});assert.deepEqual(readTable(col,sid,tid).fills.map(r=>r[2]),[null,null]);
  assert.equal(editTable(b,sid,tid,{kind:'fill',scope:'table',row:0,col:0,fill:{kind:'none'}}),b,'noFill on unfilled is a no-op');
  // other parts untouched
  assert.deepEqual(Object.keys(unzipSync(f)).sort(),Object.keys(unzipSync(b)).sort());
});
test('table editing fails closed and validates bounds',()=>{
  const {b,sid,tid}=tableDeck();
  for(const bad of [{merged:true},{fld:true}]){const t=tableDeck(bad);assert.equal(readTable(t.b,t.sid,t.tid).editable,false);assert.throws(()=>editTable(t.b,t.sid,t.tid,{kind:'cell',row:1,col:1,text:'x'}),/merge|unsupported/i);}
  assert.throws(()=>editTable(b,sid,tid,{kind:'cell',row:5,col:0,text:'x'}),/no longer exists/);
  assert.throws(()=>editTable(b,sid,tid,{kind:'cell',row:0,col:0,text:'x'.repeat(2001)}),/invalid/);
  assert.throws(()=>editTable(b,sid,tid,{kind:'cell',row:0,col:0,text:'a\u0001'}),/invalid/);
  assert.throws(()=>editTable(b,sid,tid,{kind:'insertRow',at:3}),/position/);
  assert.throws(()=>editTable(b,sid,tid,{kind:'insertCol',at:-1}),/position/);
  assert.throws(()=>editTable(b,sid,tid,{kind:'removeRow',at:2}),/no longer exists/);
  assert.throws(()=>editTable(b,sid,tid,{kind:'fill',scope:'cell',row:0,col:0,fill:{kind:'solid',color:'red'}}),/6-digit/);
  assert.throws(()=>editTable(b,sid,tid,{kind:'fill',scope:'galaxy' as 'cell',row:0,col:0,fill:{kind:'none'}}),/scope/);
  assert.throws(()=>editTable(b,sid,999,{kind:'header',on:false}),/no longer exists|not a table/);
  assert.throws(()=>editTable(b,sid,tid+1000,{kind:'header',on:false}),/no longer exists|not a table/);
  const one=editTable(editTable(b,sid,tid,{kind:'removeRow',at:0}),sid,tid,{kind:'removeCol',at:0});
  assert.throws(()=>editTable(editTable(one,sid,tid,{kind:'removeCol',at:0}),sid,tid,{kind:'removeCol',at:0}),/at least one column/);
  assert.throws(()=>editTable(one,sid,tid,{kind:'removeRow',at:0}),/at least one row/);
  let big=b;for(let i=0;i<48;i++)big=editTable(big,sid,tid,{kind:'insertRow',at:0});assert.equal(readTable(big,sid,tid).rows,50);
  assert.throws(()=>editTable(big,sid,tid,{kind:'insertRow',at:0}),/at most 50 rows/);
  const gradient=patchPart(b,'ppt/slides/slide1.xml',x=>x.replace('<a:tcPr/>','<a:tcPr><a:gradFill/></a:tcPr>'));
  assert.throws(()=>editTable(gradient,sid,tid,{kind:'fill',scope:'table',row:0,col:0,fill:{kind:'none'}}),/does not change/);
  const textShape=readDeckModel(deck(2)).slides[0];assert.throws(()=>editTable(deck(2),textShape.id,textShape.shapes[0].id,{kind:'header',on:true}),/not a table/);
});

test('insertTable adds a plain bordered table that the editor can then edit',()=>{
  const b0=deck(2),sid=readDeckModel(b0).slides[0].id,b=insertTable(b0,sid,3,4);
  const shapes=readDeckModel(b).slides[0].shapes,t=shapes.at(-1)!;
  assert.equal(t.kind,'table');assert.equal(shapes.length,readDeckModel(b0).slides[0].shapes.length+1);
  const info=readTable(b,sid,t.id);assert.deepEqual([info.rows,info.cols,info.editable,info.header,info.merged.length],[3,4,true,false,0]);
  assert.ok(info.cells.every(r=>r.every(x=>x==='')));
  const xml=strFromU8(unzipSync(b)['ppt/slides/slide1.xml']);assert.ok(!xml.includes('tableStyleId'));assert.ok(xml.includes('<a:lnL w="12700"'));
  assert.equal(readTable(editTable(b,sid,t.id,{kind:'cell',row:2,col:3,text:'ok'}),sid,t.id).cells[2][3],'ok');
  const two=insertTable(b,sid,1,1);assert.equal(readDeckModel(two).slides[0].shapes.filter(s=>s.kind==='table').length,2);
  assert.notEqual(readDeckModel(two).slides[0].shapes.at(-1)!.id,t.id);
  for(const [r,c] of [[0,1],[51,1],[1,0],[1,21],[1.5,2],[NaN,2]])assert.throws(()=>insertTable(b0,sid,r,c),/needs 1 to 50 rows/);
  assert.throws(()=>insertTable(b0,999,2,2),/no longer exists/);
  assert.deepEqual(Object.keys(unzipSync(b)).sort(),Object.keys(unzipSync(b0)).sort());
  assert.equal(readDeckModel(insertTable(b0,sid,50,20)).slides[0].shapes.at(-1)!.kind,'table');
});
test('table merge, split, row height and column width',()=>{
  const {b,sid,tid}=tableDeck(),r0=readTable(b,sid,tid);
  const m=editTable(b,sid,tid,{kind:'merge',row:0,col:0,rowSpan:2,colSpan:2});let t=readTable(m,sid,tid);
  assert.deepEqual(t.merged,[{row:0,col:0,rowSpan:2,colSpan:2}]);assert.deepEqual(t.covered,[[false,true,false],[true,true,false]]);
  assert.equal(t.cells[0][0],'A1\nB1\nA2\nB&2');assert.deepEqual([t.cells[0][1],t.cells[1][0],t.cells[1][1]],['','','']);assert.equal(t.cells[0][2],'C1');
  const xml=strFromU8(unzipSync(m)['ppt/slides/slide1.xml']);assert.match(xml,/gridSpan="2" rowSpan="2"/);assert.equal((xml.match(/hMerge="1"/g)??[]).length,2);assert.equal((xml.match(/vMerge="1"/g)??[]).length,2);
  assert.throws(()=>editTable(m,sid,tid,{kind:'cell',row:0,col:1,text:'x'}),/merged-away/);
  assert.equal(readTable(editTable(m,sid,tid,{kind:'cell',row:0,col:0,text:'only'}),sid,tid).cells[0][0],'only');
  assert.throws(()=>editTable(m,sid,tid,{kind:'insertRow',at:0}),/Split merged cells/);
  assert.throws(()=>editTable(m,sid,tid,{kind:'removeCol',at:2}),/Split merged cells/);
  assert.throws(()=>editTable(m,sid,tid,{kind:'merge',row:1,col:1,rowSpan:1,colSpan:2}),/Split merged cells/);
  const f=editTable(m,sid,tid,{kind:'fill',scope:'table',row:0,col:0,fill:{kind:'solid',color:'C62828'}});assert.equal(readTable(f,sid,tid).fills.flat().every(x=>x==='C62828'),true);
  const sp=editTable(m,sid,tid,{kind:'split',row:0,col:0});t=readTable(sp,sid,tid);assert.deepEqual([t.merged.length,t.covered.flat().some(Boolean)],[0,false]);assert.equal(t.cells[0][0],'A1\nB1\nA2\nB&2');
  assert.ok(!/gridSpan|rowSpan|hMerge|vMerge/.test(strFromU8(unzipSync(sp)['ppt/slides/slide1.xml'])));
  const row=editTable(b,sid,tid,{kind:'merge',row:1,col:0,rowSpan:1,colSpan:3});assert.deepEqual(readTable(row,sid,tid).merged,[{row:1,col:0,rowSpan:1,colSpan:3}]);
  assert.equal(readTable(editTable(row,sid,tid,{kind:'split',row:1,col:0}),sid,tid).merged.length,0);
  for(const bad of [{row:0,col:0,rowSpan:1,colSpan:1},{row:0,col:0,rowSpan:3,colSpan:1},{row:0,col:2,rowSpan:1,colSpan:2},{row:-1,col:0,rowSpan:1,colSpan:2},{row:0,col:0,rowSpan:0,colSpan:2}])assert.throws(()=>editTable(b,sid,tid,{kind:'merge',...bad}),/range is invalid/);
  assert.throws(()=>editTable(b,sid,tid,{kind:'split',row:0,col:0}),/not merged/);
  assert.throws(()=>editTable(b,sid,tid,{kind:'split',row:9,col:0}),/no longer exists/);
  const long=patchPart(b,'ppt/slides/slide1.xml',x=>x.replace('<a:t>A1</a:t>',`<a:t>${'x'.repeat(1500)}</a:t>`).replace('<a:t>B1</a:t>',`<a:t>${'y'.repeat(1500)}</a:t>`));
  assert.throws(()=>editTable(long,sid,tid,{kind:'merge',row:0,col:0,rowSpan:1,colSpan:2}),/too long/);
  // inconsistent merge fails closed
  const bad=patchPart(b,'ppt/slides/slide1.xml',x=>x.replace('<a:tc>','<a:tc hMerge="1">'));assert.equal(readTable(bad,sid,tid).editable,false);
  // sizes
  const rh=editTable(b,sid,tid,{kind:'rowHeight',at:1,heightPt:50});t=readTable(rh,sid,tid);assert.deepEqual(t.rowH,[370840,635000]);
  assert.equal(readDeckModel(rh).slides[0].shapes.find(s=>s.id===tid)!.bounds!.h,741680+635000-370840);
  assert.equal(editTable(rh,sid,tid,{kind:'rowHeight',at:1,heightPt:50}),rh);
  const cw=editTable(b,sid,tid,{kind:'colWidth',at:2,widthPt:200});t=readTable(cw,sid,tid);assert.deepEqual(t.colW,[1000000,1000000,2540000]);
  assert.equal(readDeckModel(cw).slides[0].shapes.find(s=>s.id===tid)!.bounds!.w,3000000+1540000);
  for(const [at,h] of [[0,7],[0,501],[0,NaN],[5,20]])assert.throws(()=>editTable(b,sid,tid,{kind:'rowHeight',at,heightPt:h}),/Row/);
  for(const [at,w] of [[0,19],[0,1501],[0,Infinity],[9,100]])assert.throws(()=>editTable(b,sid,tid,{kind:'colWidth',at,widthPt:w}),/Column/);
  assert.deepEqual(Object.keys(unzipSync(m)).sort(),Object.keys(unzipSync(b)).sort());void r0;
});

test('theme: read, edit color and font, one part changes',()=>{
  const b=deck(2),t0=readTheme(b);assert.equal(t0.editable,true);assert.equal(t0.colors.accent1,'4F81BD');assert.equal(t0.colors.dk1,'000000');assert.equal(t0.major,'Calibri');
  const c=editTheme(b,{kind:'color',slot:'accent1',color:'112233'});assert.equal(readTheme(c).colors.accent1,'112233');assert.equal(readTheme(c).colors.accent2,t0.colors.accent2);
  const d=editTheme(c,{kind:'color',slot:'dk1',color:'0A0B0C'});assert.equal(readTheme(d).colors.dk1,'0A0B0C');
  const f=editTheme(d,{kind:'font',role:'minor',name:'Georgia'});assert.equal(readTheme(f).minor,'Georgia');assert.equal(readTheme(f).major,'Calibri');
  assert.deepEqual(titles(f),titles(b));
  const za=unzipSync(b),zb=unzipSync(f);for(const k of Object.keys(za))if(k!=='ppt/theme/theme1.xml')assert.equal(za[k].length,zb[k].length,k);
});
test('theme: bounded inputs and fail-closed structure',()=>{
  const b=deck(1);
  for(const bad of ['','<b>','a&b','x'.repeat(65),' pad','a"b'])assert.throws(()=>editTheme(b,{kind:'font',role:'major',name:bad}));
  for(const bad of ['abcdef','12345','1234567','#112233','11223G'])assert.throws(()=>editTheme(b,{kind:'color',slot:'accent1',color:bad}));
  assert.throws(()=>editTheme(b,{kind:'color',slot:'bogus' as never,color:'112233'}));
  const z=unzipSync(b);z['ppt/theme/theme1.xml']=strToU8(strFromU8(z['ppt/theme/theme1.xml']).replace('<a:accent2><a:srgbClr val="C0504D"/></a:accent2>','<a:accent2><a:schemeClr val="accent1"/></a:accent2>'));
  const odd=zipSync(z);assert.equal(readTheme(odd).editable,false);assert.throws(()=>editTheme(odd,{kind:'color',slot:'accent1',color:'112233'}));
  const z2=unzipSync(b);z2['ppt/slideMasters/_rels/slideMaster1.xml.rels']=strToU8(strFromU8(z2['ppt/slideMasters/_rels/slideMaster1.xml.rels']).replace(/<Relationship [^>]*relationships\/theme"[^>]*\/>/,''));
  assert.equal(readTheme(zipSync(z2)).editable,false);
});

test('master: read placeholders and move one, master part only',()=>{
  const b=deck(2),m=readMaster(b);assert.equal(m.editable,true);const title=m.placeholders.find(p=>p.type==='title')!;assert.deepEqual(title.box,{x:457200,y:274638,w:8229600,h:1143000});
  const next={...title.box,x:500000,w:8000000},c=editMasterBox(b,title.id,title.box,next);
  const after=readMaster(c).placeholders;assert.deepEqual(after.find(p=>p.id===title.id)!.box,next);
  for(const p of m.placeholders)if(p.id!==title.id)assert.deepEqual(after.find(q=>q.id===p.id)!.box,p.box);
  assert.deepEqual(titles(c),titles(b));
  const za=unzipSync(b),zc=unzipSync(c);for(const k of Object.keys(za))if(k!=='ppt/slideMasters/slideMaster1.xml')assert.equal(za[k].length,zc[k].length,k);
  assert.equal(editMasterBox(c,title.id,next,next),c);
});
test('master: stale, bounds and fail-closed structure',()=>{
  const b=deck(1),title=readMaster(b).placeholders.find(p=>p.type==='title')!;
  assert.throws(()=>editMasterBox(b,title.id,{...title.box,x:1},title.box),/changed since/);
  assert.throws(()=>editMasterBox(b,999,title.box,title.box),/no longer exists/);
  assert.throws(()=>editMasterBox(b,title.id,title.box,{...title.box,w:100}),/out of range/);
  assert.throws(()=>editMasterBox(b,title.id,title.box,{...title.box,x:1e9}),/outside/);
  assert.throws(()=>editMasterBox(b,title.id,title.box,{...title.box,x:1.5}),/whole EMU/);
  const z=unzipSync(b);z['ppt/slideMasters/slideMaster1.xml']=strToU8(strFromU8(z['ppt/slideMasters/slideMaster1.xml']).replace('<a:xfrm><a:off x="457200" y="274638"/>','<a:xfrm rot="90"><a:off x="457200" y="274638"/>'));
  const odd=zipSync(z);assert.equal(readMaster(odd).placeholders.some(p=>p.id===title.id),false);assert.throws(()=>editMasterBox(odd,title.id,title.box,title.box),/no longer exists/);
});

test('layout: read explicit placeholder boxes and move one, that layout part only',()=>{
  const b=deck(2),info=readLayoutBoxes(b);assert.equal(info.editable,true);
  const l=info.layouts.find(x=>x.name==='Title Slide')!,ph=l.placeholders[0];assert.ok(ph);
  const next={...ph.box,y:ph.box.y+100000},c=editLayoutBox(b,l.part,ph.id,ph.box,next);
  const after=readLayoutBoxes(c),al=after.layouts.find(x=>x.part===l.part)!;assert.deepEqual(al.placeholders.find(p=>p.id===ph.id)!.box,next);
  for(const o of info.layouts)if(o.part!==l.part)assert.deepEqual(after.layouts.find(x=>x.part===o.part)!.placeholders,o.placeholders);
  assert.deepEqual(readMaster(c),readMaster(b));assert.deepEqual(titles(c),titles(b));
  const za=unzipSync(b),zc=unzipSync(c);for(const k of Object.keys(za))if(k!==l.part)assert.equal(za[k].length,zc[k].length,k);
  assert.equal(editLayoutBox(c,l.part,ph.id,next,next),c);
});
test('layout: stale, unknown part, bounds',()=>{
  const b=deck(1),l=readLayoutBoxes(b).layouts[0],ph=l.placeholders[0];
  assert.throws(()=>editLayoutBox(b,l.part,ph.id,{...ph.box,x:ph.box.x+1},ph.box),/changed since/);
  assert.throws(()=>editLayoutBox(b,'ppt/slideLayouts/slideLayout99.xml',ph.id,ph.box,ph.box),/no longer exists/);
  assert.throws(()=>editLayoutBox(b,'ppt/slides/slide1.xml',ph.id,ph.box,ph.box),/no longer exists/);
  assert.throws(()=>editLayoutBox(b,l.part,9999,ph.box,ph.box),/no longer exists/);
  assert.throws(()=>editLayoutBox(b,l.part,ph.id,ph.box,{...ph.box,h:5}),/out of range/);
  assert.throws(()=>editLayoutBox(b,l.part,ph.id,ph.box,{...ph.box,y:-5e9}),/outside/);
});

test('background: inherit to solid to solid to inherit, slide part only',()=>{
  const b=deck(2),sid=ids(b)[0];assert.deepEqual(readSlideBackground(b,sid),{kind:'inherit'});
  const c=setSlideBackground(b,sid,{kind:'solid',color:'1F5FBF'});assert.deepEqual(readSlideBackground(c,sid),{kind:'solid',color:'1F5FBF'});assert.deepEqual(readSlideBackground(c,ids(b)[1]),{kind:'inherit'});
  const d=setSlideBackground(c,sid,{kind:'solid',color:'AABBCC'});assert.deepEqual(readSlideBackground(d,sid),{kind:'solid',color:'AABBCC'});assert.equal(setSlideBackground(d,sid,{kind:'solid',color:'AABBCC'}),d);
  const e=setSlideBackground(d,sid,{kind:'inherit'});assert.deepEqual(readSlideBackground(e,sid),{kind:'inherit'});assert.equal(setSlideBackground(e,sid,{kind:'inherit'}),e);
  assert.deepEqual(titles(e),titles(b));
  const za=unzipSync(b),zc=unzipSync(c),part=readDeckModel(b).slides[0].part;for(const k of Object.keys(za))if(k!==part)assert.equal(za[k].length,zc[k].length,k);
});
test('background: bounds and unsupported backgrounds are never overwritten',()=>{
  const b=deck(1),sid=ids(b)[0];
  for(const bad of ['abcdef','12345','1234567','#112233','11223G'])assert.throws(()=>setSlideBackground(b,sid,{kind:'solid',color:bad}));
  assert.throws(()=>setSlideBackground(b,sid,{kind:'other'}));assert.throws(()=>setSlideBackground(b,9999,{kind:'inherit'}),/no longer exists/);
  const z=unzipSync(b),part=readDeckModel(b).slides[0].part;
  z[part]=strToU8(strFromU8(z[part]).replace(/<p:cSld\b([^>]*)>/,'<p:cSld$1><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>'));
  const odd=zipSync(z);assert.deepEqual(readSlideBackground(odd,sid),{kind:'other'});
  assert.throws(()=>setSlideBackground(odd,sid,{kind:'solid',color:'112233'}),/cannot be edited/);assert.throws(()=>setSlideBackground(odd,sid,{kind:'inherit'}),/cannot be edited/);
});

test('background all: one pass over every slide, refuses decks with unsupported backgrounds',()=>{
  const b=deck(3),sid=ids(b);
  const one=setSlideBackground(b,sid[1],{kind:'solid',color:'AABBCC'});
  const c=setAllSlideBackgrounds(one,{kind:'solid',color:'1F5FBF'});
  for(const id of sid)assert.deepEqual(readSlideBackground(c,id),{kind:'solid',color:'1F5FBF'});
  assert.deepEqual(backgroundSummary(c),{total:3,inherit:0,solid:3,other:0});
  assert.equal(setAllSlideBackgrounds(c,{kind:'solid',color:'1F5FBF'}),c);
  const d=setAllSlideBackgrounds(c,{kind:'inherit'});assert.deepEqual(backgroundSummary(d),{total:3,inherit:3,solid:0,other:0});assert.deepEqual(titles(d),titles(b));
  assert.throws(()=>setAllSlideBackgrounds(b,{kind:'solid',color:'nope'}));
  const z=unzipSync(b),part=readDeckModel(b).slides[1].part;
  z[part]=strToU8(strFromU8(z[part]).replace(/<p:cSld\b([^>]*)>/,'<p:cSld$1><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>'));
  const odd=zipSync(z);assert.equal(backgroundSummary(odd).other,1);assert.throws(()=>setAllSlideBackgrounds(odd,{kind:'solid',color:'112233'}),/cannot be edited/);
  assert.deepEqual(readSlideBackground(odd,sid[0]),{kind:'inherit'});
});

test('slide size: fit and center content uniformly, text and ids unchanged',()=>{
  const b=deck(2),was=readSlideSize(b),m0=readDeckModel(b);
  const c=setSlideSize(b,9144000,6858000),s=readSlideSize(c);assert.deepEqual(s,{cx:9144000,cy:6858000});
  const k=Math.min(9144000/was.cx,6858000/was.cy),dx=Math.round((9144000-was.cx*k)/2),dy=Math.round((6858000-was.cy*k)/2),m1=readDeckModel(c);
  for(const sh of m0.slides[0].shapes)if(sh.bounds&&sh.parentId===null){const n=m1.slides[0].shapes.find(x=>x.id===sh.id)!.bounds!;assert.equal(n.x,Math.round(sh.bounds.x*k)+dx);assert.equal(n.w,Math.round(sh.bounds.w*k));assert.equal(n.h,Math.round(sh.bounds.h*k));}
  assert.deepEqual(titles(c),titles(b));assert.deepEqual(ids(c),ids(b));assert.equal(setSlideSize(c,9144000,6858000),c);
  const back=setSlideSize(c,was.cx,was.cy);assert.deepEqual(readSlideSize(back),was);
});
test('slide size: bounds and fail-closed structure',()=>{
  const b=deck(1);
  for(const [x,y] of [[0,6858000],[1000,1000],[1.5,6858000],[60000000,6858000],[12192000,NaN]])assert.throws(()=>setSlideSize(b,x,y),/out of range/);
  const z=unzipSync(b),part=readDeckModel(b).slides[0].part;
  z[part]=strToU8(strFromU8(z[part]).replace('</p:spTree>','<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="40" name="T"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></p:xfrm></p:graphicFrame></p:spTree>'));
  assert.throws(()=>setSlideSize(zipSync(z),9144000,6858000),/graphic frames/);
  const z2=unzipSync(b);z2[part]=strToU8(strFromU8(z2[part]).replace('</p:spTree>','<p:sp><p:nvSpPr><p:cNvPr id="41" name="X"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="1.5" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr></p:sp></p:spTree>'));
  assert.throws(()=>setSlideSize(zipSync(z2),9144000,6858000));
});

test('footer: add, change, remove slide number and footer on one slide only',()=>{
  const b=deck(2),sid=ids(b),f0=readSlideFooter(b,sid[0]);assert.deepEqual(f0,{editable:true,problem:'',number:false,footer:null,date:null,canNumber:true,canFooter:true,canDate:true});
  const c=setSlideFooter(b,sid[0],{number:true,footer:'Q3 <review> & plan'});
  assert.deepEqual(readSlideFooter(c,sid[0]),{...f0,number:true,footer:'Q3 <review> & plan'});assert.equal(readSlideFooter(c,sid[1]).number,false);
  const m0=readDeckModel(b).slides[0].shapes.length,m1=readDeckModel(c).slides[0].shapes.length;assert.equal(m1,m0+2);
  const d=setSlideFooter(c,sid[0],{number:true,footer:'Changed'});assert.equal(readSlideFooter(d,sid[0]).footer,'Changed');assert.equal(readDeckModel(d).slides[0].shapes.length,m1);
  assert.equal(setSlideFooter(d,sid[0],{number:true,footer:'Changed'}),d);
  const e=setSlideFooter(d,sid[0],{number:false,footer:null});assert.equal(readDeckModel(e).slides[0].shapes.length,m0);assert.deepEqual(readSlideFooter(e,sid[0]),f0);
  const za=unzipSync(b),zc=unzipSync(c),part=readDeckModel(b).slides[0].part;for(const k of Object.keys(za))if(k!==part)assert.equal(za[k].length,zc[k].length,k);
});
test('footer: all slides in one pass; bounds and unsupported content refused',()=>{
  const b=deck(3),sid=ids(b),c=setAllSlideFooters(b,{number:true,footer:'Deck'});
  for(const id of sid)assert.deepEqual([readSlideFooter(c,id).number,readSlideFooter(c,id).footer],[true,'Deck']);
  const d=setAllSlideFooters(c,{number:false,footer:null});for(const id of sid)assert.equal(readSlideFooter(d,id).number,false);
  for(const bad of ['',' pad','a\nb','x'.repeat(201),'\u0001'])assert.throws(()=>setSlideFooter(b,sid[0],{number:false,footer:bad}));
  assert.throws(()=>setSlideFooter(b,9999,{number:true,footer:null}),/no longer exists/);
  const z=unzipSync(b),part=readDeckModel(b).slides[0].part;
  z[part]=strToU8(strFromU8(z[part]).replace('</p:spTree>','<p:sp><p:nvSpPr><p:cNvPr id="50" name="F"/><p:cNvSpPr/><p:nvPr><p:ph type="ftr" idx="11"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>a</a:t></a:r></a:p><a:p><a:r><a:t>b</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>'));
  const odd=zipSync(z);assert.equal(readSlideFooter(odd,sid[0]).editable,false);assert.throws(()=>setSlideFooter(odd,sid[0],{number:true,footer:null}),/unsupported/);assert.throws(()=>setAllSlideFooters(odd,{number:true,footer:null}));
  const z2=unzipSync(b);const lay=Object.keys(z2).filter(k=>/slideLayouts\/slideLayout\d+\.xml$/.test(k));for(const k of lay)z2[k]=strToU8(strFromU8(z2[k]).replace(/<p:ph\b[^>]*type="(?:sldNum|ftr)"[^>]*\/>/g,'<p:ph type="body" idx="99"/>'));
  const none=zipSync(z2);assert.equal(readSlideFooter(none,sid[0]).canNumber,false);assert.throws(()=>setSlideFooter(none,sid[0],{number:true,footer:null}),/no slide number placeholder/);
  assert.throws(()=>setSlideFooter(none,sid[0],{number:false,footer:'x'}),/no footer placeholder/);assert.equal(setSlideFooter(none,sid[0],{number:false,footer:null}),none);
});

test('firstSlideNum: read default, set, change, restore and refuse bad input without touching other parts',()=>{
  const b=deck(2),m0=readDeckModel(b);assert.equal(readFirstSlideNum(b),1);
  const c=setFirstSlideNum(b,7);assert.equal(readFirstSlideNum(c),7);assert.deepEqual(readDeckModel(c).slides.map(s=>s.id),m0.slides.map(s=>s.id));
  const d=setFirstSlideNum(c,0);assert.equal(readFirstSlideNum(d),0);assert.equal(setFirstSlideNum(d,0),d);
  assert.equal(readFirstSlideNum(setFirstSlideNum(d,9999)),9999);
  for(const bad of [-1,10000,1.5,NaN])assert.throws(()=>setFirstSlideNum(b,bad),/whole number/);
  const z=unzipSync(c);z['ppt/presentation.xml']=strToU8(strFromU8(z['ppt/presentation.xml']).replace(/firstSlideNum="7"/,'firstSlideNum="abc"'));
  const odd=zipSync(z);assert.throws(()=>readFirstSlideNum(odd),/not readable/);assert.throws(()=>setFirstSlideNum(odd,3),/not readable/);
});

test('date placeholder: add, change, remove, leave alone when omitted, refuse unsupported and bad text',()=>{
  const b=deck(2),sid=ids(b),m0=readDeckModel(b).slides[0].shapes.length;
  const c=setSlideFooter(b,sid[0],{number:false,footer:null,date:'14 Oct 2026 & <co>'});assert.equal(readSlideFooter(c,sid[0]).date,'14 Oct 2026 & <co>');assert.equal(readSlideFooter(c,sid[1]).date,null);assert.equal(readDeckModel(c).slides[0].shapes.length,m0+1);
  const d=setSlideFooter(c,sid[0],{number:true,footer:'F'});assert.equal(readSlideFooter(d,sid[0]).date,'14 Oct 2026 & <co>');
  assert.equal(setSlideFooter(d,sid[0],{number:true,footer:'F',date:'14 Oct 2026 & <co>'}),d);
  const e=setSlideFooter(d,sid[0],{number:true,footer:'F',date:'Later'});assert.equal(readSlideFooter(e,sid[0]).date,'Later');
  const f=setSlideFooter(e,sid[0],{number:false,footer:null,date:null});assert.deepEqual(readSlideFooter(f,sid[0]),readSlideFooter(b,sid[0]));
  const all=setAllSlideFooters(b,{number:false,footer:null,date:'Q4'});assert.deepEqual(sid.map(i=>readSlideFooter(all,i).date),['Q4','Q4']);
  assert.throws(()=>setSlideFooter(b,sid[0],{number:false,footer:null,date:' pad '}),/Date text|padded/);assert.throws(()=>setSlideFooter(b,sid[0],{number:false,footer:null,date:'x'.repeat(201)}));
  const z=unzipSync(c),part=Object.keys(z).find(k=>/slides\/slide\d+\.xml$/.test(k)&&strFromU8(z[k]).includes('Date Placeholder'))!;
  z[part]=strToU8(strFromU8(z[part]).replace(/<a:r>(\s*<a:rPr[^>]*\/>)?\s*<a:t>14 Oct[^<]*<\/a:t>\s*<\/a:r>/,'<a:fld id="{1}" type="datetime1"><a:t>1</a:t></a:fld>'));
  const odd=zipSync(z);assert.equal(readSlideFooter(odd,sid[0]).editable,false);assert.throws(()=>setSlideFooter(odd,sid[0],{number:true,footer:null}),/unsupported/);
});

test('hide slide: set, restore, no-op, other slides and parts untouched, malformed refused',()=>{
  const b=deck(2),sid=ids(b);assert.deepEqual(readHiddenSlides(b),[false,false]);
  const c=setSlideHidden(b,sid[1],true);assert.deepEqual(readHiddenSlides(c),[false,true]);assert.equal(setSlideHidden(c,sid[1],true),c);assert.deepEqual(readDeckModel(c).slides.map(s=>s.id),sid);
  const d=setSlideHidden(c,sid[0],true);assert.deepEqual(readHiddenSlides(d),[true,true]);
  const e=setSlideHidden(d,sid[1],false);assert.deepEqual(readHiddenSlides(e),[true,false]);
  assert.deepEqual(readHiddenSlides(setSlideHidden(e,sid[0],false)),[false,false]);assert.equal(setSlideHidden(b,sid[0],false),b);
  assert.throws(()=>setSlideHidden(b,99999,true),/no longer exists/);assert.throws(()=>setSlideHidden(b,sid[0],'x' as unknown as boolean));
  const z=unzipSync(c),part=Object.keys(z).find(k=>/slides\/slide\d+\.xml$/.test(k)&&/\sshow="0"/.test(strFromU8(z[k])))!;
  z[part]=strToU8(strFromU8(z[part]).replace('show="0"','show="maybe"'));const odd=zipSync(z);assert.throws(()=>readHiddenSlides(odd),/not readable/);assert.throws(()=>setSlideHidden(odd,sid[0],true),/not readable/);
});

test('sections: create from none, split, rename, merge up/down; order and other parts untouched; bad input refused',()=>{
  const b=deck(4),sid=ids(b),names=(x:Uint8Array)=>readDeckModel(x).sections?.map(s=>s.name),grp=(x:Uint8Array)=>readDeckModel(x).sections?.map(s=>s.ids.length);
  assert.equal(readDeckModel(b).sections,null);
  assert.throws(()=>editSections(b,{kind:'rename',index:0,name:'A'}),/no sections/);assert.throws(()=>editSections(b,{kind:'remove',index:0}),/no sections/);
  const one=editSections(b,{kind:'add',slideId:sid[0],name:'All & <in>'});assert.deepEqual(names(one),['All & <in>']);assert.deepEqual(grp(one),[4]);
  const two=editSections(b,{kind:'add',slideId:sid[2],name:'Part 2'});assert.deepEqual(names(two),['Default Section','Part 2']);assert.deepEqual(grp(two),[2,2]);assert.deepEqual(ids(two),sid);
  const three=editSections(two,{kind:'add',slideId:sid[1],name:'Mid'});assert.deepEqual(names(three),['Default Section','Mid','Part 2']);assert.deepEqual(grp(three),[1,1,2]);
  assert.throws(()=>editSections(three,{kind:'add',slideId:sid[1],name:'Again'}),/already starts/);assert.throws(()=>editSections(three,{kind:'add',slideId:99999,name:'X'}),/no longer exists/);
  const ren=editSections(three,{kind:'rename',index:1,name:'Middle "q"'});assert.deepEqual(names(ren),['Default Section','Middle "q"','Part 2']);assert.equal(editSections(ren,{kind:'rename',index:1,name:'Middle "q"'}),ren);
  const m1=editSections(ren,{kind:'remove',index:1});assert.deepEqual(names(m1),['Default Section','Part 2']);assert.deepEqual(grp(m1),[2,2]);
  const m0=editSections(ren,{kind:'remove',index:0});assert.deepEqual(names(m0),['Middle "q"','Part 2']);assert.deepEqual(grp(m0),[2,2]);
  assert.throws(()=>editSections(one,{kind:'remove',index:0}),/last section/);assert.throws(()=>editSections(ren,{kind:'remove',index:9}),/no longer exists/);assert.throws(()=>editSections(ren,{kind:'rename',index:9,name:'x'}),/no longer exists/);
  for(const bad of ['',' pad ','x'.repeat(81),'a\nb'])assert.throws(()=>editSections(b,{kind:'add',slideId:sid[0],name:bad}));
  assert.deepEqual(titles(ren),titles(b));
  const withSec=deck(3,{sections:[[1],[2,3]]});assert.deepEqual(names(editSections(withSec,{kind:'add',slideId:ids(withSec)[2],name:'Tail'})),['Sec 1','Sec 2','Tail']);
  const gap=deck(3,{sections:[[1],[3]]});assert.throws(()=>editSections(gap,{kind:'rename',index:0,name:'Z'}),/cover the slides/);
});
