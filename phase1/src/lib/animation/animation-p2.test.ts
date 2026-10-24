import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocument,createComposition,findComp,validateDocument,type Property,type AnimationDocument} from './model';
import {applyEdit,applyEdits} from './edit';
import {evaluate,spatialPoint,arcParameter} from './interpolate';
import {speedAt,speedSamples,handlesOf} from './graph';
import {effectPrimitives} from './effects';
import {frameSvg,exportSequenceZip} from './exportFrames';
import {AnimationSession} from './session';
import {parseInterfaceSVG} from '../interface/vector';
import {prepareAnimationAsset} from './assets';
import {readJournal,writeJournal} from './recovery';
import {TICKS_PER_SECOND as sec} from './time';
const close=(a:number,b:number,tol=0.01)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const key=(t:number,v:number|readonly [number,number])=>({t,v,interp:'linear' as const,out:[0.33,0] as const,in:[0.67,1] as const});
const base=()=>applyEdit(createDocument('P2',createComposition({width:800,height:450})),{type:'layer.add',kind:'shape',id:'layer'});
const layer=(d:AnimationDocument)=>findComp(d)!.layers.find(l=>l.id==='layer')!;
const image=()=>({id:'asset-'+ 'a'.repeat(64),hash:'a'.repeat(64),mime:'image/png' as const,width:1,height:1,data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',sourceName:'fixture.png',sourceType:'png' as const,license:'user-provided-unverified' as const});
test('speed is signed units per second, clamps outside keys, hold jumps remain zero',()=>{
 const p:Property={type:'scalar',value:0,keys:[key(0,20),key(sec*2,-80)]};
 close(speedAt(p,0,sec),-50);assert.equal(speedAt(p,0,-1),0);assert.equal(speedAt(p,0,sec*2),0);
 const hold={...p,keys:[{...p.keys[0],interp:'hold' as const},p.keys[1]]};assert.equal(speedAt(hold,0,sec*2-1),0);
 assert.equal(speedSamples(p,0,0,sec,10000).length,501);
});
test('speed of an eased curve matches analytical smoothstep derivative',()=>{
 const p:Property={type:'scalar',value:0,keys:[{...key(0,0),interp:'bezier',out:[1/3,0]}, {...key(sec,100),in:[2/3,1]}]};
 close(speedAt(p,0,sec/2),150,0.1);assert.ok(speedAt(p,0,1)<0.1);
});
test('independent X/Y ease survives JSON and keeps untouched channel stable',()=>{
 let d=applyEdits(base(),[{type:'prop.animate',layer:'layer',prop:'position',on:true,t:0},{type:'prop.set',layer:'layer',prop:'position',value:[0,0],t:0},{type:'prop.set',layer:'layer',prop:'position',value:[100,100],t:sec}]);
 d=applyEdit(d,{type:'key.interp',layer:'layer',prop:'position',t:0,interp:'bezier',channel:0,out:[0.8,0]});
 d=applyEdit(d,{type:'key.interp',layer:'layer',prop:'position',t:sec,interp:'bezier',channel:0,in:[1,1]});
 const p=layer(d).transform.position,v=evaluate(p,sec/2) as [number,number];assert.ok(v[0]<v[1]-10);
 assert.deepEqual(evaluate(JSON.parse(JSON.stringify(p)),sec/2),v);
 close(handlesOf(p.keys,0,0)[0].x,0.8);close(handlesOf(p.keys,0,1)[0].x,0.33);
 assert.deepEqual(validateDocument(d),[]);
});
test('arc-length mode has near-uniform curved path distances, degenerate and endpoint cases are bounded',()=>{
 const a={...key(0,[0,0]),sOut:[0,400] as const},b={...key(sec,[100,0]),sIn:[0,0] as const};
 const p:Property={type:'vec2',value:[0,0],keys:[a,b],pathMode:'arcLength'};
 const values=Array.from({length:21},(_,i)=>evaluate(p,sec*i/20) as readonly [number,number]);
 const distances=values.slice(1).map((_,i)=>{let total=0,previous=values[i];for(let j=1;j<=64;j++){const v=evaluate(p,sec*(i+j/64)/20) as readonly [number,number];total+=Math.hypot(v[0]-previous[0],v[1]-previous[1]);previous=v;}return total;});
 // Measure travelled distance, not a chord across the curve's turn.
 assert.ok(Math.max(...distances)/Math.min(...distances)<1.01);
 assert.deepEqual(values[0],[0,0]);assert.deepEqual(values[20],[100,0]);
 assert.ok(Math.abs(arcParameter(a,b,0.5)-0.5)>0.1);
 assert.deepEqual(spatialPoint(a,b,1),[100,0]);
 const zero=key(0,[10,10]);close(arcParameter(zero,{...zero,t:sec},0.5),0.5);
});
test('effects preserve order, bypass, alpha and survive recovery plus undo',()=>{
 const s=new AnimationSession(null);s.open(base());
 s.dispatch({type:'layer.effects',layer:'layer',effects:[{id:'t',kind:'tint',enabled:true,amount:1,color:'#ff0000'},{id:'b',kind:'blur',enabled:true,amount:4,color:'#000000'}]});
 const primitives=effectPrimitives(layer(s.document!));assert.ok(primitives.indexOf('feColorMatrix')<primitives.indexOf('feGaussianBlur'));assert.ok(primitives.includes('0 0 0 1 0'));
 assert.ok(frameSvg(findComp(s.document!)!,0,true).includes('filter="url(#effect-0)"'));
 const memory=new Map<string,string>(),store={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>void memory.set(k,v),removeItem:(k:string)=>void memory.delete(k)};
 writeJournal({doc:s.document!,savedRevision:0,view:s.getState().view},store);assert.deepEqual(readJournal(store)?.doc,s.document);
 assert.ok(s.undo());assert.equal(layer(s.document!).effects,undefined);assert.ok(s.redo());
 s.dispatch({type:'layer.effects',layer:'layer',effects:layer(s.document!).effects!.map(e=>({...e,enabled:false}))});assert.equal(effectPrimitives(layer(s.document!)),'');
});
test('effect and source bounds, locked edits, invalid imports leave session untouched',()=>{
 const s=new AnimationSession(null);s.open(base());const before=s.document;
 for(const amount of [-1,65,Infinity,NaN])assert.throws(()=>s.dispatch({type:'layer.effects',layer:'layer',effects:[{id:'x',kind:'blur',enabled:true,amount,color:'#ffffff'}]}));
 assert.throws(()=>s.dispatch({type:'layer.update',layer:'layer',source:{width:Infinity}}));assert.equal(s.document,before);
 s.dispatch({type:'layer.update',layer:'layer',locked:true});assert.throws(()=>s.dispatch({type:'prop.pathMode',layer:'layer',mode:'arcLength'}));
 assert.throws(()=>s.dispatch({type:'layer.effects',layer:'layer',effects:[]}));
 assert.throws(()=>s.dispatch({type:'asset.import',asset:{...image(),data:'https://evil.invalid/asset'}}));
});
test('canonical images deduplicate, survive reopen, render embedded PNG only, broken asset refs reject',async()=>{
 let d=applyEdit(base(),{type:'asset.import',asset:image()});d=applyEdit(d,{type:'asset.import',asset:image()});assert.equal(d.assets.length,1);
 assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))),[]);
 const svg=frameSvg(findComp(d)!,0,false,d.assets);assert.ok(svg.includes('<image href="data:image/png;base64,'));assert.ok(!svg.includes('https://'));
 const seen:string[]=[];await exportSequenceZip({...findComp(d)!,workArea:{in:0,out:8000}},'P2',{assets:d.assets,rasterize:async svg=>{seen.push(svg);return new Uint8Array([1]);}});assert.ok(seen[0].includes('data:image/png;base64,'));
 const corrupt={...d,assets:[]};assert.ok(validateDocument(corrupt).some(e=>e.includes('missing asset')));assert.throws(()=>frameSvg(findComp(d)!,0));
 assert.throws(()=>applyEdit(base(),{type:'asset.import',asset:{...image(),width:10000}}));
});
test('SVG importer reuses strict Interface parser and rejects hostile/unsupported data before rasterisation',async()=>{
 for(const body of ['<script>alert(1)</script>','<foreignObject/>','<image href="https://evil.invalid/x"/>','<rect width="10" height="10" onclick="bad()"/>','<path d="M 0 0 C 1 1 2 2 3 3"/>']){
  const text=`<svg>${body}</svg>`;assert.throws(()=>parseInterfaceSVG(text));
  await assert.rejects(prepareAnimationAsset(new File([text],'bad.svg',{type:'image/svg+xml'})));
 }
 await assert.rejects(prepareAnimationAsset(new File(['x'.repeat(200001)],'large.svg')));
 assert.equal(parseInterfaceSVG('<svg width="100" height="100"><rect width="20" height="20" fill="#f00"/></svg>').shapes[0].fill,'#ff0000');
});
test('separate channel ease rejects spatial paths instead of silently changing meaning',()=>{
 let d=applyEdits(base(),[{type:'prop.animate',layer:'layer',prop:'position',on:true,t:0},{type:'prop.set',layer:'layer',prop:'position',value:[500,300],t:sec},{type:'key.spatial',layer:'layer',prop:'position',t:0,sOut:[0,100]}]);
 assert.throws(()=>applyEdit(d,{type:'key.interp',layer:'layer',prop:'position',t:0,interp:'bezier',channel:1,out:[0.4,0]}));
});
test('key clipboard retains independent channels and presets explicitly relink them',async()=>{
 const {copyKeys}=await import('./keyclip');let d=applyEdits(base(),[{type:'prop.animate',layer:'layer',prop:'position',on:true,t:0},{type:'prop.set',layer:'layer',prop:'position',value:[500,300],t:sec},{type:'key.interp',layer:'layer',prop:'position',t:0,interp:'bezier',channel:1,out:[0.9,0]}]);
 const clip=copyKeys(d,[{layer:'layer',prop:'position',t:0}]);d=applyEdit(d,{type:'keys.paste',layer:'layer',items:clip.items,t:sec*2});assert.deepEqual(layer(d).transform.position.keys[2].channelOut,layer(d).transform.position.keys[0].channelOut);
 assert.throws(()=>applyEdit(d,{type:'key.spatial',layer:'layer',prop:'position',t:0,sOut:[0,100]}));
 d=applyEdit(d,{type:'keys.interp',keys:[{layer:'layer',prop:'position',t:0}],interp:'linear'});assert.equal(layer(d).transform.position.keys[0].channelOut,undefined);
});
test('blur bounds grow by the sum of enabled three-sigma passes',async()=>{
 const {effectBounds}=await import('./effects');let d=applyEdit(base(),{type:'layer.effects',layer:'layer',effects:[{id:'a',kind:'blur',enabled:true,amount:10,color:'#ffffff'},{id:'b',kind:'blur',enabled:false,amount:64,color:'#ffffff'}]});assert.equal(effectBounds(layer(d)).x,-30);assert.equal(effectBounds(layer(d)).width,460);
 assert.ok(frameSvg(findComp(d)!,0).includes('filterUnits="userSpaceOnUse"'));
});
