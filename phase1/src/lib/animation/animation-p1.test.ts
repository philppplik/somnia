import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {applyEdit,applyEdits,EditError,type Edit} from './edit';
import {createComposition,createDocument,findComp,findLayer,validateDocument,type AnimationDocument,type KeyRef} from './model';
import {evaluate,samplePath,spatialPoint,hasSpatial} from './interpolate';
import {AnimationSession,setAnimationSession} from './session';
import {copyKeys,ClipError,getKeyClip,setKeyClip,pastedRefs} from './keyclip';
import {clickSelect,marqueeSelect,pruneSelection,sameKey,shiftSelection,allKeysOf,rectsOverlap} from './selection';
import {playbackAt,workAreaFrames} from './playback';
import {handlesOf,handleToEase,valueRange,curveSamples,niceStep,EASE_PRESETS} from './graph';
import {canvasRasterize,exportFramePng,exportSequenceZip,ExportError,frameSvg,frameFileName,sequencePlan,exportSlug,MAX_FRAMES} from './exportFrames';
import {exportCurrentFrame,exportWorkAreaSequence,exportState,resetExport} from './exportJob';
import {animationCommandSpecs} from './commands';
import {defaultView,readJournal,writeJournal,RECOVERY_KEY,type KeyValueStore} from './recovery';
import {frameToTick,TICKS_PER_SECOND} from './time';
const fps={num:30,den:1};
const f=(n:number)=>frameToTick(n,fps);
const base=():AnimationDocument=>{
 let d=createDocument('t',createComposition({fps,duration:TICKS_PER_SECOND*2}));
 d=applyEdit(d,{type:'layer.add',kind:'shape',id:'L1'});
 return d;
};
const layer=(d:AnimationDocument,id='L1')=>findLayer(findComp(d),id)!;
/** position keys at frames 0,10,20 and opacity keys at 0,10 */
const keyed=():AnimationDocument=>{
 let d=base();
 d=applyEdits(d,[{type:'prop.animate',layer:'L1',prop:'position',on:true,t:0},{type:'prop.set',layer:'L1',prop:'position',value:[100,100],t:0},{type:'prop.set',layer:'L1',prop:'position',value:[400,300],t:f(10)},{type:'prop.set',layer:'L1',prop:'position',value:[800,100],t:f(20)},
  {type:'prop.animate',layer:'L1',prop:'opacity',on:true,t:0},{type:'prop.set',layer:'L1',prop:'opacity',value:50,t:f(10)}]);
 return d;
};
const ref=(prop:KeyRef['prop'],t:number,l='L1'):KeyRef=>({layer:l,prop,t});
const code=(fn:()=>unknown)=>{try{fn();return null;}catch(e){return e instanceof EditError?e.code:'other';}};
const memStore=():KeyValueStore&{data:Map<string,string>}=>{const data=new Map<string,string>();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>void data.set(k,v),removeItem:k=>void data.delete(k)};};

test('prop.set on an existing key keeps its ease handles and spatial tangents',()=>{
 let d=keyed();
 d=applyEdits(d,[{type:'key.interp',layer:'L1',prop:'position',t:f(10),interp:'bezier',out:[0.1,0.2],in:[0.9,0.8]},{type:'key.spatial',layer:'L1',prop:'position',t:f(10),sIn:[-30,0],sOut:[30,0]}]);
 d=applyEdit(d,{type:'prop.set',layer:'L1',prop:'position',value:[420,310],t:f(10)});
 const k=layer(d).transform.position.keys[1];
 assert.deepEqual(k.v,[420,310]);assert.deepEqual(k.out,[0.1,0.2]);assert.deepEqual(k.in,[0.9,0.8]);assert.deepEqual(k.sOut,[30,0]);
});

test('spatial: zero tangents stay straight, tangents bend the path and keep exact end points',()=>{
 const d=keyed();const p=layer(d).transform.position;
 assert.equal(p.keys.some((k,i)=>i<2&&hasSpatial(k,p.keys[i+1])),false);
 const lin=applyEdit(d,{type:'key.interp',layer:'L1',prop:'position',t:0,interp:'linear'});
 assert.deepEqual(evaluate(layer(lin).transform.position,f(5)),[250,200]);
 const bent=applyEdit(lin,{type:'key.spatial',layer:'L1',prop:'position',t:0,sOut:[0,200]});
 const bp=layer(bent).transform.position;
 assert.deepEqual(evaluate(bp,0),[100,100]);assert.deepEqual(evaluate(bp,f(10)),[400,300]);
 const mid=evaluate(bp,f(5)) as [number,number];
 assert.notDeepEqual(mid,[250,200]);assert.ok(mid[1]>200,'path bulges toward the tangent');
 assert.deepEqual(spatialPoint(bp.keys[0],bp.keys[1],0),[100,100]);
 assert.deepEqual(spatialPoint(bp.keys[0],bp.keys[1],1),[400,300]);
 assert.equal(validateDocument(bent).length,0);
});
test('spatial: samplePath covers every key and is empty for scalars',()=>{
 const d=applyEdit(keyed(),{type:'keys.spatial',keys:[ref('position',f(10))],mode:'smooth'});
 const path=samplePath(layer(d).transform.position,10);
 assert.deepEqual(path[0],[100,100]);assert.deepEqual(path[path.length-1],[800,100]);
 assert.ok(path.length>=2+10);
 assert.deepEqual(samplePath(layer(d).transform.opacity),[]);
});
test('spatial tangents are only allowed on vec2 position keys',()=>{
 const d=keyed();
 assert.equal(code(()=>applyEdit(d,{type:'key.spatial',layer:'L1',prop:'opacity',t:0,sOut:[1,1]})),'invalid');
 assert.equal(code(()=>applyEdit(d,{type:'key.spatial',layer:'L1',prop:'position',t:0,sOut:[NaN,1]})),'invalid');
 assert.equal(code(()=>applyEdit(d,{type:'key.spatial',layer:'L1',prop:'position',t:f(3),sOut:[1,1]})),'missing');
 const bad=JSON.parse(JSON.stringify(d));bad.compositions[0].layers[0].transform.opacity.keys[0].sOut=[1,1];
 assert.ok(validateDocument(bad).some(m=>m.includes('spatial')));
});
test('keys.spatial smooth then straighten',()=>{
 let d=applyEdit(keyed(),{type:'keys.spatial',keys:[ref('position',0),ref('position',f(10)),ref('position',f(20))],mode:'smooth'});
 const k=layer(d).transform.position.keys;
 assert.deepEqual(k[1].sOut,[(800-100)/6,(100-100)/6]);assert.deepEqual(k[1].sIn,[-(800-100)/6,-0]);
 assert.deepEqual(k[0].sOut,[(400-100)/3,(300-100)/3]);assert.deepEqual(k[0].sIn,[0,0]);
 d=applyEdit(d,{type:'keys.spatial',keys:[ref('position',f(10))],mode:'straight'});
 assert.equal(layer(d).transform.position.keys[1].sOut,undefined);
 assert.equal(code(()=>applyEdit(d,{type:'keys.spatial',keys:[ref('opacity',0)],mode:'smooth'})),'invalid');
});

test('keys.move shifts a multi-property selection by whole frames as one edit',()=>{
 const d=keyed();
 const m=applyEdit(d,{type:'keys.move',keys:[ref('position',f(10)),ref('position',f(20)),ref('opacity',f(10))],delta:f(5)+7});
 assert.deepEqual(layer(m).transform.position.keys.map(k=>k.t),[0,f(15),f(25)]);
 assert.deepEqual(layer(m).transform.opacity.keys.map(k=>k.t),[0,f(15)]);
 assert.equal(m.revision,d.revision+1);assert.equal(validateDocument(m).length,0);
});
test('keys.move rejects collisions and out-of-range moves and leaves the document untouched',()=>{
 const d=keyed();
 assert.equal(code(()=>applyEdit(d,{type:'keys.move',keys:[ref('position',f(10))],delta:f(10)})),'collision');
 const r=applyEdit(d,{type:'keys.move',keys:[ref('position',f(10))],delta:f(10),replace:true});
 assert.deepEqual(layer(r).transform.position.keys.map(k=>k.t),[0,f(20)]);
 assert.equal(code(()=>applyEdit(d,{type:'keys.move',keys:[ref('position',f(20))],delta:f(60)})),'invalid');
 assert.equal(code(()=>applyEdit(d,{type:'keys.move',keys:[ref('position',0)],delta:-f(1)})),'invalid');
 assert.equal(code(()=>applyEdit(d,{type:'keys.move',keys:[ref('position',f(3))],delta:f(1)})),'missing');
 assert.equal(code(()=>applyEdit(d,{type:'keys.move',keys:[],delta:f(1)})),'invalid');
 assert.equal(applyEdit(d,{type:'keys.move',keys:[ref('position',f(10))],delta:3}),d,'sub-frame delta is a no-op');
 const locked=applyEdit(d,{type:'layer.update',layer:'L1',locked:true});
 assert.equal(code(()=>applyEdit(locked,{type:'keys.move',keys:[ref('position',f(10))],delta:f(1)})),'locked');
 assert.equal(JSON.stringify(layer(d).transform.position.keys.map(k=>k.t)),JSON.stringify([0,f(10),f(20)]));
});
test('keys.move failing in a later group does not apply the earlier group',()=>{
 const d=keyed();
 assert.equal(code(()=>applyEdit(d,{type:'keys.move',keys:[ref('opacity',f(10)),ref('position',f(20))],delta:f(55)})),'invalid');
});
test('keys.remove deletes a selection and falls back to the first value when a property empties',()=>{
 const d=keyed();
 const r=applyEdit(d,{type:'keys.remove',keys:[ref('position',f(10)),ref('opacity',0),ref('opacity',f(10))]});
 assert.deepEqual(layer(r).transform.position.keys.map(k=>k.t),[0,f(20)]);
 assert.equal(layer(r).transform.opacity.keys.length,0);assert.equal(layer(r).transform.opacity.value,100);
 assert.equal(validateDocument(r).length,0);
});
test('keys.interp applies ease presets to many keys at once',()=>{
 const d=applyEdit(keyed(),{type:'keys.interp',keys:[ref('position',0),ref('position',f(10))],...EASE_PRESETS.easeIn});
 for(const k of layer(d).transform.position.keys.slice(0,2)){assert.equal(k.interp,'bezier');assert.deepEqual(k.out,[0.42,0]);assert.deepEqual(k.in,[1,1]);}
 assert.deepEqual(layer(d).transform.position.keys[2].out,[0.33,0]);
 const h=applyEdit(d,{type:'keys.interp',keys:[ref('position',0)],interp:'hold'});
 assert.deepEqual(evaluate(layer(h).transform.position,f(5)),[100,100]);
 assert.equal(code(()=>applyEdit(d,{type:'keys.interp',keys:[ref('position',0)]})),'invalid');
 assert.equal(code(()=>applyEdit(d,{type:'keys.interp',keys:[ref('position',0)],out:[2,0]})),'invalid');
});

test('copy and paste keep relative timing, ease and tangents, and replace keys at the target',()=>{
 let d=applyEdit(keyed(),{type:'key.spatial',layer:'L1',prop:'position',t:f(10),sOut:[5,6]});
 d=applyEdit(d,{type:'key.interp',layer:'L1',prop:'position',t:f(10),interp:'bezier',out:[0.2,0.1],in:[0.8,0.9]});
 const clip=copyKeys(d,[ref('position',f(10)),ref('opacity',f(10)),ref('position',0)]);
 assert.equal(clip.span,f(10));assert.deepEqual(clip.items.map(i=>[i.prop,i.dt]),[['position',0],['opacity',f(10)],['position',f(10)]]);
 const p=applyEdit(d,{type:'keys.paste',layer:'L1',items:clip.items,t:f(40)});
 const pos=layer(p).transform.position.keys;
 assert.deepEqual(pos.map(k=>k.t),[0,f(10),f(20),f(40),f(50)]);
 const copied=pos.find(k=>k.t===f(50))!;
 assert.deepEqual(copied.v,[400,300]);assert.deepEqual(copied.out,[0.2,0.1]);assert.deepEqual(copied.sOut,[5,6]);
 assert.deepEqual(pastedRefs('L1',clip,f(40),fps).map(r=>r.t).sort((a,b)=>a-b),[f(40),f(50),f(50)]);
 const over=applyEdit(p,{type:'keys.paste',layer:'L1',items:clip.items,t:f(10)});
 assert.equal(layer(over).transform.position.keys.filter(k=>k.t===f(10)).length,1);
 assert.equal(validateDocument(over).length,0);
});
test('paste fails whole when a key would leave the composition; copy needs one layer',()=>{
 let d=keyed();const clip=copyKeys(d,[ref('position',0),ref('position',f(20))]);
 assert.equal(code(()=>applyEdit(d,{type:'keys.paste',layer:'L1',items:clip.items,t:f(50)})),'invalid');
 assert.equal(code(()=>applyEdit(d,{type:'keys.paste',layer:'L1',items:[],t:0})),'invalid');
 d=applyEdit(d,{type:'layer.add',kind:'solid',id:'L2'});
 d=applyEdits(d,[{type:'prop.animate',layer:'L2',prop:'opacity',on:true,t:0}]);
 assert.throws(()=>copyKeys(d,[ref('position',0),ref('opacity',0,'L2')]),ClipError);
 assert.throws(()=>copyKeys(d,[ref('position',f(3))]),ClipError);
 const c2=copyKeys(d,[ref('opacity',0,'L2')]);
 const pasted=applyEdit(d,{type:'keys.paste',layer:'L1',items:c2.items,t:f(4)});
 assert.ok(layer(pasted).transform.opacity.keys.some(k=>k.t===f(4)),'paste targets another layer');
});
test('clipboard store holds the last copy',()=>{setKeyClip(null);assert.equal(getKeyClip(),null);const c=copyKeys(keyed(),[ref('position',0)]);setKeyClip(c);assert.equal(getKeyClip(),c);setKeyClip(null);});

test('work area: set, validate, clamp on duration change',()=>{
 const d=base();
 const w=applyEdit(d,{type:'workarea.set',in:f(10)+3,out:f(40)});
 assert.deepEqual(findComp(w)!.workArea,{in:f(10),out:f(40)});
 assert.equal(code(()=>applyEdit(d,{type:'workarea.set',in:f(10),out:f(10)})),'invalid');
 assert.equal(code(()=>applyEdit(d,{type:'workarea.set',in:-f(1),out:f(10)})),'invalid');
 assert.equal(code(()=>applyEdit(d,{type:'workarea.set',in:0,out:TICKS_PER_SECOND*3})),'invalid');
 assert.equal(applyEdit(d,{type:'workarea.set',in:0,out:TICKS_PER_SECOND*2}),d);
 const shorter=applyEdit(w,{type:'comp.update',settings:{duration:f(30)}});
 assert.deepEqual(findComp(shorter)!.workArea,{in:f(10),out:f(30)});assert.equal(validateDocument(shorter).length,0);
 const bad=JSON.parse(JSON.stringify(w));bad.compositions[0].workArea={in:5,out:2};
 assert.ok(validateDocument(bad).some(m=>m.includes('work area')));
});
test('playback stays in the work area, loops or ends',()=>{
 const area={in:f(10),out:f(20)};
 assert.deepEqual(workAreaFrames(area,fps),{first:10,last:19,count:10});
 assert.equal(playbackAt(f(12),0,area,fps,true).tick,f(12));
 assert.equal(playbackAt(f(12),1000/30*3+1,area,fps,true).tick,f(15));
 assert.equal(playbackAt(f(12),1000/30*8+1,area,fps,true).tick,f(10),'wraps past the out point');
 assert.equal(playbackAt(f(0),0,area,fps,true).tick,f(10),'starting outside jumps to the in point');
 const end=playbackAt(f(12),1000,area,fps,false);assert.deepEqual(end,{tick:f(19),ended:true});
 assert.deepEqual(playbackAt(f(19),0,area,fps,false),{tick:f(10),ended:false},'restart from the in point at the end');
 assert.equal(playbackAt(f(12),1000/30*2+1,area,fps,false).ended,false);
 assert.equal(playbackAt(f(5),50,{in:f(5),out:f(6)},fps,true).tick,f(5),'one-frame work area');
});

test('graph: handle positions and inverse mapping round trip',()=>{
 const keys=layer(keyed()).transform.position.keys;
 const k1=applyEdit(keyed(),{type:'key.interp',layer:'L1',prop:'position',t:f(10),interp:'bezier',out:[0.25,0.5],in:[0.75,0.25]});
 const ks=layer(k1).transform.position.keys;
 const hs=handlesOf(ks,1,0);
 assert.deepEqual(hs.map(h=>h.kind).sort(),['in','out']);
 const out=hs.find(h=>h.kind==='out')!,inn=hs.find(h=>h.kind==='in')!;
 assert.equal(out.t,f(10)+0.25*(f(20)-f(10)));assert.equal(out.v,400+0.5*(800-400));
 assert.equal(inn.t,0+0.75*f(10));assert.equal(inn.v,100+0.25*(400-100));
 assert.deepEqual(handleToEase(ks,1,'out',out.t,out.v,0),[0.25,0.5]);
 assert.deepEqual(handleToEase(ks,1,'in',inn.t,inn.v,0),[0.75,0.25]);
 assert.deepEqual(handleToEase(ks,1,'out',f(100),1e6,0),[1,3],'clamped to x 0..1 and y -2..3');
 assert.deepEqual(handleToEase(ks,1,'out',f(5),-1e6,0),[0,-2]);
 const y=handlesOf(ks,1,1);assert.equal(y.find(h=>h.kind==='out')!.v,300+0.5*(100-300));
 const flat=layer(applyEdits(keyed(),[{type:'prop.set',layer:'L1',prop:'position',value:[800,300],t:f(10)}])).transform.position.keys;
 assert.equal(handleToEase(flat,1,'out',f(15),999,0)[1],flat[1].out[1],'flat segment keeps its y');
 assert.equal(keys.length,3);
});
test('graph: no handles for linear or hold segments, none at the open ends',()=>{
 const d=applyEdit(keyed(),{type:'keys.interp',keys:[ref('position',0)],interp:'linear'});
 const ks=layer(d).transform.position.keys;
 assert.deepEqual(handlesOf(ks,0,0),[]);
 assert.deepEqual(handlesOf(ks,1,0).map(h=>h.kind),['out']);
 assert.deepEqual(handlesOf(ks,2,0).map(h=>h.kind),['in']);
});
test('graph: range, samples and grid step',()=>{
 const p=layer(keyed()).transform.position;
 const r=valueRange(p.keys,0);assert.ok(r.min<100&&r.max>800);
 assert.deepEqual(valueRange([],0),{min:0,max:1});
 const flat=valueRange([{...p.keys[0],v:[5,5]}],1);assert.ok(flat.max>flat.min);
 const s=curveSamples(p,0,0,f(20),4);assert.equal(s.length,5);assert.equal(s[0].v,100);assert.equal(s[4].v,800);
 assert.equal(niceStep(100,5),20);assert.equal(niceStep(7,5),2);assert.ok(niceStep(0,5)>0);
});

test('selection helpers',()=>{
 const a=ref('position',0),b=ref('position',f(10)),c=ref('opacity',0);
 assert.deepEqual(clickSelect([a,b],c,false),[c]);
 assert.deepEqual(clickSelect([a],c,true),[a,c]);
 assert.deepEqual(clickSelect([a,c],c,true),[a]);
 assert.deepEqual(clickSelect([a,b],a,false),[a],'plain click on a selected key of a group selects only it');
 assert.deepEqual(marqueeSelect([a],[b,c],true),[a,b,c]);assert.deepEqual(marqueeSelect([a],[b],false),[b]);
 assert.deepEqual(marqueeSelect([a],[a,b],true),[a,b]);
 assert.deepEqual(shiftSelection([a],5),[{...a,t:5}]);
 assert.ok(sameKey(a,{...a}));assert.ok(!sameKey(a,b));
 const d=keyed();
 assert.deepEqual(pruneSelection(d,[a,b,ref('position',f(3)),ref('opacity',f(10),'nope')]),[a,b]);
 assert.deepEqual(pruneSelection(null,[a]),[]);
 assert.equal(allKeysOf(d,'L1').length,5);assert.deepEqual(allKeysOf(d,'zzz'),[]);
 assert.ok(rectsOverlap({l:0,t:0,r:10,b:10},{l:10,t:10,r:20,b:20}));assert.ok(!rectsOverlap({l:0,t:0,r:9,b:10},{l:10,t:0,r:20,b:10}));
});

test('session: a multi-key drag is one undo step and cancel restores',()=>{
 const s=new AnimationSession(null);s.open(keyed());
 const keys=[ref('position',f(10)),ref('opacity',f(10))];
 s.previewEdits([{type:'keys.move',keys,delta:f(2)}]);s.previewEdits([{type:'keys.move',keys,delta:f(4)}]);
 assert.equal(s.getState().canUndo,false);
 assert.ok(s.commitPreview());
 assert.deepEqual(layer(s.document!).transform.opacity.keys.map(k=>k.t),[0,f(14)]);
 assert.ok(s.undo());assert.deepEqual(layer(s.document!).transform.opacity.keys.map(k=>k.t),[0,f(10)]);assert.equal(s.getState().canUndo,false);
 s.previewEdits([{type:'keys.move',keys,delta:f(2)}]);s.cancelPreview();
 assert.deepEqual(layer(s.visible!).transform.opacity.keys.map(k=>k.t),[0,f(10)]);
});
test('session: selectKeys mirrors the primary key; view survives the recovery journal',()=>{
 const store=memStore();const s=new AnimationSession(store);s.open(keyed());
 s.selectKeys([ref('position',0),ref('opacity',f(10))]);s.setView({loop:false,graph:true,graphChannel:1});
 assert.deepEqual(s.getState().view.selectedKey,{prop:'opacity',t:f(10)});
 s.dispatch({type:'workarea.set',in:f(5),out:f(15)});
 const j=readJournal(store)!;assert.equal(j.view.selectedKeys.length,2);assert.equal(j.view.loop,false);assert.equal(findComp(j.doc)!.workArea.in,f(5));
 s.selectKeys([]);assert.equal(s.getState().view.selectedKey,null);
 const old=JSON.parse(store.data.get(RECOVERY_KEY)!);delete old.view.selectedKeys;delete old.view.loop;store.data.set(RECOVERY_KEY,JSON.stringify(old));
 const j2=readJournal(store)!;assert.deepEqual(j2.view.selectedKeys,[]);assert.equal(j2.view.loop,true);
 assert.deepEqual(Object.keys(defaultView()).sort(),Object.keys(j2.view).sort());
 assert.ok(writeJournal({savedRevision:0,doc:keyed(),view:defaultView()},store));
});

const specOf=(id:string)=>animationCommandSpecs().find(s=>s.id===id)!;
const call=(id:string,p:unknown)=>(specOf(id).run as unknown as (p:unknown,c?:unknown)=>unknown)(p);
test('commands: selection driven key commands run through the session',()=>{
 const s=new AnimationSession(null);setAnimationSession(s);s.open(keyed());s.setView({selectedLayer:'L1'});setKeyClip(null);
 assert.equal((specOf('animation.keys.delete').enabled as unknown as ()=>boolean)(),false);
 call('animation.keys.selectAll',undefined);assert.equal(s.getState().view.selectedKeys.length,5);
 s.selectKeys([ref('position',f(10)),ref('opacity',f(10))]);
 call('animation.keys.copy',{});assert.equal(getKeyClip()!.items.length,2);
 call('animation.keys.ease',{preset:'easeOut'});assert.deepEqual(layer(s.document!).transform.position.keys[1].out,[0,0]);
 call('animation.keys.nudge',{ticks:f(3)});
 assert.deepEqual(s.getState().view.selectedKeys.map(k=>k.t),[f(13),f(13)]);
 call('animation.keys.cut',{});
 assert.deepEqual(layer(s.document!).transform.position.keys.map(k=>k.t),[0,f(20)]);assert.deepEqual(s.getState().view.selectedKeys,[]);
 s.setView({playhead:f(30)});call('animation.keys.paste',undefined);
 assert.deepEqual(layer(s.document!).transform.position.keys.map(k=>k.t),[0,f(20),f(30)]);assert.equal(s.getState().view.selectedKeys.length,2);
 call('animation.keys.smooth',{});assert.ok(layer(s.document!).transform.position.keys[2].sIn);
 call('animation.keys.straighten',{});assert.equal(layer(s.document!).transform.position.keys[2].sIn,undefined);
 call('animation.keys.delete',undefined);assert.equal(layer(s.document!).transform.opacity.keys.length,1,'pasted opacity key removed with the selection');assert.deepEqual(layer(s.document!).transform.position.keys.map(k=>k.t),[0,f(20)]);
 s.setView({playhead:f(8)});call('animation.workarea.in',{});s.setView({playhead:f(12)});call('animation.workarea.out',{});assert.deepEqual(findComp(s.document!)!.workArea,{in:f(8),out:f(12)});
});
test('commands: work area, loop, graph toggles and expected errors',()=>{
 const s=new AnimationSession(null);setAnimationSession(s);s.open(base());
 s.setView({playhead:f(10)});call('animation.workarea.in',{});assert.equal(findComp(s.document!)!.workArea.in,f(10));
 s.setView({playhead:f(5)});assert.throws(()=>call('animation.workarea.out',{}),(e:Error&{expected?:boolean})=>e instanceof EditError&&(e as {expected?:boolean}).expected===true);
 call('animation.workarea.reset',{});assert.deepEqual(findComp(s.document!)!.workArea,{in:0,out:TICKS_PER_SECOND*2});
 call('animation.playback.loop',{});assert.equal(s.getState().view.loop,false);
 call('animation.graph.toggle',{});assert.equal(s.getState().view.graph,true);
 assert.throws(()=>call('animation.keys.paste',{}),(e:Error&{expected?:boolean})=>e.expected===true);
 assert.throws(()=>call('animation.keys.copy',{}),(e:Error&{expected?:boolean})=>e.expected===true);
});

const fakePng=(svg:string)=>new Uint8Array([137,80,78,71,...new TextEncoder().encode(svg.length.toString())]);
test('export: frame svg escapes text, honours transparency and animation',()=>{
 let d=applyEdit(base(),{type:'layer.add',kind:'text',id:'T',over:{source:{text:'A & <B> "q"',size:40,color:'#ffffff'}}});
 d=applyEdits(d,[{type:'prop.animate',layer:'T',prop:'opacity',on:true,t:0},{type:'prop.set',layer:'T',prop:'opacity',value:0,t:f(10)},{type:'key.interp',layer:'T',prop:'opacity',t:0,interp:'linear'}]);
 const c=findComp(d)!;
 const a=frameSvg(c,0);assert.ok(a.includes('A &amp; &lt;B&gt; &quot;q&quot;'));assert.ok(a.startsWith('<svg xmlns='));assert.ok(a.includes(`fill="${c.background}"`));
 assert.ok(!frameSvg(c,0,true).includes(`fill="${c.background}"`));
 assert.ok(frameSvg(c,f(5)).includes('opacity="0.5"'));
 assert.notEqual(frameSvg(c,0),frameSvg(c,f(10)));
});
test('export: sequence plan covers the work area, names count from frame 0',()=>{
 const d=applyEdit(base(),{type:'workarea.set',in:f(3),out:f(7)});const c=findComp(d)!;
 const plan=sequencePlan(c);assert.deepEqual(plan.map(p=>p.frame),[3,4,5,6]);assert.deepEqual(plan.map(p=>p.tick),[f(3),f(4),f(5),f(6)]);
 assert.equal(frameFileName('My Anim: ü/1',12),'My_Anim_u_1_00012.png');assert.equal(exportSlug('///'),'animation');
});
test('export: sequence ZIP holds every work-area frame plus a timing manifest',async()=>{
 const d=applyEdit(base(),{type:'workarea.set',in:f(2),out:f(6)});const c=findComp(d)!;
 const seen:number[][]=[];const calls:string[]=[];
 const r=await exportSequenceZip(c,'Demo',{rasterize:async svg=>{calls.push(svg);return fakePng(svg);},onProgress:(a,b)=>seen.push([a,b]),transparent:true});
 assert.equal(r.frames,4);assert.equal(r.fileName,'Demo_frames.zip');assert.deepEqual(seen,[[1,4],[2,4],[3,4],[4,4]]);
 assert.ok(calls.every(s=>!s.includes(`fill="${c.background}"`)));
 const files=unzipSync(new Uint8Array(await r.blob.arrayBuffer()));
 assert.deepEqual(Object.keys(files).sort(),['Demo_00002.png','Demo_00003.png','Demo_00004.png','Demo_00005.png','manifest.json']);
 const m=JSON.parse(strFromU8(files['manifest.json']));
 assert.equal(m.frameCount,4);assert.deepEqual(m.frameRate,{num:30,den:1});assert.equal(m.firstFrame,2);assert.match(m.alpha,/straight alpha/);assert.equal(m.files[0].file,'Demo_00002.png');
 assert.equal(files['Demo_00002.png'][0],137);assert.equal(r.bytes,Object.entries(files).filter(([n])=>n.endsWith('.png')).reduce((n,[,b])=>n+b.length,0));
});
test('export: failures produce no file and say why',async()=>{
 const c=findComp(applyEdit(base(),{type:'workarea.set',in:0,out:f(4)}))!;
 const fail=async(o:Parameters<typeof exportSequenceZip>[2],comp=c)=>{try{await exportSequenceZip(comp,'x',o);return null;}catch(e){return e as ExportError;}};
 const big=await fail({rasterize:async()=>new Uint8Array(100),maxBytes:250});assert.equal(big!.code,'too-large');
 const rast=await fail({rasterize:async()=>{throw new Error('boom');}});assert.equal(rast!.code,'raster');assert.match(rast!.message,/Frame 0.*boom/);
 const ac=new AbortController();let n=0;
 const cancelled=await fail({rasterize:async()=>{if(++n===2)ac.abort();return new Uint8Array(1);},signal:ac.signal});assert.equal(cancelled!.code,'cancelled');
 const long=applyEdits(base(),[{type:'comp.update',settings:{duration:TICKS_PER_SECOND*600}},{type:'workarea.set',in:0,out:TICKS_PER_SECOND*600}]);
 const many=await fail({rasterize:async()=>new Uint8Array(1)},findComp(long)!);assert.equal(many!.code,'too-many');assert.match(many!.message,new RegExp(String(MAX_FRAMES)));
 const huge=await fail({rasterize:async()=>new Uint8Array(1)},{...c,width:9000,height:9000});assert.equal(huge!.code,'too-large');
});
test('export: single frame uses the playhead frame number',async()=>{
 const c=findComp(base())!;
 const r=await exportFramePng(c,f(7),'Demo',async()=>new Uint8Array([137,80,78,71]));
 assert.equal(r.fileName,'Demo_00007.png');assert.equal(r.blob.type,'image/png');assert.equal(r.blob.size,4);
 await assert.rejects(()=>exportFramePng(c,0,'Demo',async()=>{throw new Error('nope');}),(e:ExportError)=>e.code==='raster');
});
test('export job: state goes idle, running, done and never reports done on failure',async()=>{
 const s=new AnimationSession(null);setAnimationSession(s);s.open(applyEdit(base(),{type:'workarea.set',in:0,out:f(3)}));
 resetExport();assert.equal(exportState().status,'idle');
 const saved:string[]=[];
 const name=await exportWorkAreaSequence({rasterize:async()=>new Uint8Array([1,2,3]),save:(_b,n)=>{saved.push(n);}});
 assert.equal(name,'t_frames.zip');assert.deepEqual(saved,['t_frames.zip']);assert.equal(exportState().status,'done');assert.equal(exportState().done,3);
 s.setView({playhead:f(1)});
 await exportCurrentFrame({rasterize:async()=>new Uint8Array([1]),save:(_b,n)=>{saved.push(n);}});assert.equal(saved[1],'t_00001.png');
 await assert.rejects(()=>exportCurrentFrame({rasterize:async()=>{throw new Error('x');},save:()=>assert.fail('must not save')}));
 assert.equal(exportState().status,'error');assert.match(exportState().message,/could not be rendered/);
 resetExport();assert.equal(exportState().status,'idle');
 assert.equal(typeof canvasRasterize,'function');
});
test('scene: parent matrix maps parent-space positions to composition space and inverts',async()=>{
 const {parentMatrix,invertMatrix,applyMatrix,worldMatrix,sceneAt}=await import('./scene');
 let d=base();d=applyEdits(d,[{type:'layer.add',kind:'null',id:'P'},{type:'prop.set',layer:'P',prop:'position',value:[100,50],t:0},{type:'prop.set',layer:'P',prop:'scale',value:[200,200],t:0},{type:'layer.parent',layer:'L1',parent:'P'}]);
 const c=findComp(d)!;const l=findLayer(c,'L1')!;
 const m=parentMatrix(c,l,0);const inv=invertMatrix(m)!;
 const world=applyMatrix(m,[10,10]);assert.deepEqual(world,[120,70]);
 const back=applyMatrix(inv,world);assert.ok(Math.abs(back[0]-10)<1e-9&&Math.abs(back[1]-10)<1e-9);
 assert.deepEqual(parentMatrix(c,findLayer(c,'P')!,0),[1,0,0,1,0,0]);
 assert.equal(invertMatrix([0,0,0,0,1,1]),null);
 assert.deepEqual(sceneAt(c,0)[0].matrix,worldMatrix(c,l,0));
});
test('session: switching the selected layer clears the key selection',()=>{
 const s=new AnimationSession(null);s.open(keyed());s.setView({selectedLayer:'L1'});s.selectKeys([ref('position',0)]);
 s.setView({selectedLayer:'L1'});assert.equal(s.getState().view.selectedKeys.length,1);
 s.setView({selectedLayer:'L2'});assert.deepEqual(s.getState().view.selectedKeys,[]);assert.equal(s.getState().view.selectedKey,null);
});
