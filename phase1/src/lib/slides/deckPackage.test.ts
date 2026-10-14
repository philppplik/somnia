import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {readDeckModel,moveSlide,reorderSlides} from './deckPackage';
import {readRuns,makeEditedCopy} from './editCopy';

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
