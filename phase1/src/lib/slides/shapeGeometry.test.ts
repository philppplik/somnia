import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {readDeckModel,readSlidePart,newSlideFromLayout,readLayouts,type ShapeRef} from './deckPackage';
import {hitTest,containsPoint,overlayRect,limitsOf,stepShape,selectableShapes,rotationDeg} from './shapeGeometry';

const fx=(n:string)=>new Uint8Array(readFileSync(fileURLToPath(new URL('../../../slides-engine/fixtures/'+n,import.meta.url))));
const base=fx('independent.pptx');
const sh=(id:number,x:number,y:number,w:number,h:number,extra:Partial<ShapeRef['bounds'] & object>={}):ShapeRef=>({id,name:'s'+id,kind:'text',runCount:0,parentId:null,ph:null,bounds:{x,y,w,h,rot:0,flipH:false,flipV:false,source:'slide',...extra}});
const size={cx:1000,cy:500};

test('model reads stored bounds in EMU from the real fixture',()=>{
  const m=readDeckModel(base);
  assert.deepEqual(m.slideSize,{cx:9144000,cy:5143500});
  const [a,b]=m.slides[0].shapes;
  assert.deepEqual(a.bounds,{x:594360,y:640080,w:7955279,h:914400,rot:0,flipH:false,flipV:false,source:'slide'});
  assert.equal(b.bounds!.y,2011680);
});
test('rotation and flips are read; invalid or non-integer geometry becomes null',()=>{
  const xml=(x:string)=>`<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="A"/><p:nvPr/></p:nvSpPr><p:spPr>${x}</p:spPr><p:txBody><a:p><a:r><a:t>x</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  const r=readSlidePart(xml('<a:xfrm rot="5400000" flipH="1"><a:off x="10" y="20"/><a:ext cx="300" cy="40"/></a:xfrm>'),9).shapes[0].bounds!;
  assert.deepEqual([r.rot,r.flipH,r.flipV,r.x,r.w],[5400000,true,false,10,300]);
  for(const bad of ['<a:xfrm><a:off x="1.5" y="2"/><a:ext cx="3" cy="4"/></a:xfrm>','<a:xfrm><a:off x="1" y="2"/><a:ext cx="-3" cy="4"/></a:xfrm>','<a:xfrm><a:off x="x" y="2"/><a:ext cx="3" cy="4"/></a:xfrm>','<a:xfrm><a:off x="1" y="2"/></a:xfrm>','<a:xfrm><a:off x="99999999999" y="2"/><a:ext cx="3" cy="4"/></a:xfrm>',''])
    assert.equal(readSlidePart(xml(bad),9).shapes[0].bounds,null,bad);
});
test('group children are nested and have no usable bounds; the group keeps its own',()=>{
  const xml='<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr><p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="G"/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="500" cy="300"/><a:chOff x="0" y="0"/><a:chExt cx="50" cy="30"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="6" name="C"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="5" y="5"/><a:ext cx="10" cy="10"/></a:xfrm></p:spPr></p:sp></p:grpSp></p:spTree></p:cSld></p:sld>';
  const s=readSlidePart(xml,1).shapes;
  assert.deepEqual(s.map(x=>[x.id,x.kind,x.parentId]),[[5,'group',null],[6,'other',5]]);
  assert.deepEqual(s[0].bounds&&[s[0].bounds.x,s[0].bounds.w],[100,500]);assert.equal(s[1].bounds,null);
  assert.deepEqual(selectableShapes(s).map(x=>x.id),[5]);
  assert.deepEqual(limitsOf(s[0]),['group']);assert.deepEqual(limitsOf(s[1]),['nested','noBounds']);
});
test('placeholders without an xfrm inherit display bounds from the layout',()=>{
  const layout=readLayouts(base).find(l=>l.supported&&l.placeholders.includes('ctrTitle'))!;
  const out=newSlideFromLayout(base,layout.part,256);
  const m=readDeckModel(out),added=m.slides[1].shapes;
  assert.ok(added.length>0);
  for(const s of added){assert.ok(s.bounds,s.name);assert.notEqual(s.bounds!.source,'slide');assert.ok(limitsOf(s).includes('inherited'));}
});
test('hit test: topmost wins, edges inclusive, outside and invalid points miss',()=>{
  const shapes=[sh(1,0,0,1000,500),sh(2,100,100,200,100)];
  assert.equal(hitTest(shapes,size,0.2,0.3)!.id,2);
  assert.equal(hitTest(shapes,size,0.9,0.9)!.id,1);
  assert.equal(hitTest(shapes,size,0.1,0.2)!.id,2);
  for(const [x,y] of [[NaN,0.5],[-0.01,0.5],[0.5,1.01],[Infinity,0]] as const)assert.equal(hitTest(shapes,size,x,y),null);
  assert.equal(hitTest(shapes,{cx:0,cy:500},0.5,0.5),null);
  assert.equal(hitTest([{...sh(3,0,0,10,10),bounds:null}],size,0.001,0.001),null);
});
test('hit test honours rotation (a 90 degree rotated wide shape becomes tall)',()=>{
  const b=sh(1,400,200,200,20,{rot:5400000}).bounds!;
  assert.equal(containsPoint(b,500,150),true);
  assert.equal(containsPoint(b,430,210),false);
  assert.equal(containsPoint(b,500,320),false);
  assert.equal(rotationDeg({rot:-5400000}),270);
});
test('nested shapes are never hit; groups are',()=>{
  const g={...sh(1,0,0,500,500),kind:'group' as const},c={...sh(2,0,0,500,500),parentId:1};
  assert.equal(hitTest([g,c],size,0.1,0.2)!.id,1);
});
test('overlay rect is slide-relative, so it survives zoom',()=>{
  const r=overlayRect(sh(1,100,50,200,100,{rot:2700000}).bounds!,size);
  assert.deepEqual([r.left,r.top,r.width,r.height,r.rotateDeg],[10,10,20,20,45]);
});
test('keyboard stepping cycles through top-level shapes and wraps',()=>{
  const s=[sh(1,0,0,1,1),{...sh(2,0,0,1,1),parentId:1},sh(3,0,0,1,1)];
  assert.equal(stepShape(s,null,1)!.id,1);assert.equal(stepShape(s,null,-1)!.id,3);
  assert.equal(stepShape(s,1,1)!.id,3);assert.equal(stepShape(s,3,1)!.id,1);assert.equal(stepShape(s,1,-1)!.id,3);
  assert.equal(stepShape([],null,1),null);assert.equal(stepShape(s,99,1)!.id,1);
});
test('limits report rotation, flips and inherited geometry',()=>{
  assert.deepEqual(limitsOf(sh(1,0,0,1,1)),[]);
  assert.deepEqual(limitsOf(sh(1,0,0,1,1,{rot:60000,flipV:true,source:'layout'})),['inherited','rotated','flipped']);
});
test('real corpus decks: every selectable shape with bounds lies on a finite slide-relative rect',()=>{
  const dir=fileURLToPath(new URL('../../../slides-engine/corpus/',import.meta.url));let seen=0,rotated=0;
  for(const f of readdirSync(dir).filter(f=>f.endsWith('.pptx'))){
    let m;try{m=readDeckModel(new Uint8Array(readFileSync(dir+f)));}catch{continue;}
    if(!m.slideSize)continue;
    for(const s of m.slides)for(const x of selectableShapes(s.shapes))if(x.bounds){const r=overlayRect(x.bounds,m.slideSize);assert.ok([r.left,r.top,r.width,r.height].every(Number.isFinite),f);seen++;if(r.rotateDeg)rotated++;}
  }
  assert.ok(seen>5);console.log('corpus shapes with bounds:',seen,'rotated:',rotated);
});
void zipSync;void unzipSync;void strFromU8;void strToU8;
