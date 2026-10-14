import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDocument,findComp,findLayer,type Layer} from './model';
import {applyEdits,applyEdit,EditError} from './edit';
import {frameToTick} from './time';
import {layerKeyTimes,shiftLayerKeys} from './layerShift';
import {timingPlan} from './layerTiming';
const fps={num:30,den:1},f=(n:number)=>frameToTick(n,fps);
const base=()=>applyEdits(createDocument(),[{type:'layer.add',kind:'shape',id:'a',over:{source:{shape:'path',width:200,height:100,color:'#ff0000',path:{points:[{x:0,y:0},{x:1,y:0},{x:1,y:1}],closed:true}}}},
 {type:'prop.animate',layer:'a',prop:'position',on:true,t:f(0)},{type:'key.add',layer:'a',prop:'position',t:f(30)},
 {type:'color.prop',layer:'a',prop:'fill',op:'animate',on:true,t:f(0)},{type:'color.prop',layer:'a',prop:'fill',op:'set',color:'#00ff00',t:f(30)},
 {type:'layer.timing',layer:'a',inT:f(10),outT:f(60)}] as never);
const L=(d:ReturnType<typeof base>)=>findLayer(findComp(d)!,'a')!;
test('inventory: the model has exactly the known number of time-keyed structures',()=>{
  // 7 definitions (Keyframe, KeyRef, effect colorKeys and bypassKeys, ColorKey, MaskShapeKey, Marker) and 2 validator callbacks. A new `t:number` must be handled by shiftLayerKeys first.
  const src=readFileSync(new URL('./model.ts',import.meta.url),'utf8');
  assert.equal((src.match(/\bt:number\b/g)??[]).length,9);
});
test('shiftLayerKeys moves keys of every kind and nothing else',()=>{
  const l={id:'x',name:'x',inT:5,outT:50,offset:0,source:{color:'#fff',gradient:{start:'#000',end:'#fff',angle:0,colorKeys:{start:[{t:10,color:'#111'}],end:[{t:20,color:'#222',ease:'ease'}]},stops:[{offset:0.5,color:'#333',offsetAnim:{type:'scalar',value:0.5,keys:[{t:30,v:0.5,interp:'linear',out:[0.3,0.3],in:[0.7,0.7]}]}}]},pathKeys:[{t:40,path:{points:[{x:0,y:0}],closed:true}}]},
   transform:{position:{type:'vec2',value:[0,0],keys:[{t:0,v:[0,0],interp:'linear',out:[0.3,0.3],in:[0.7,0.7]}]}},effects:[{id:'e',colorKeys:[{t:7,color:'#abc'}],bypassKeys:[{t:9,bypass:true}]}],masks:[{id:'m',pathKeys:[{t:11,path:{points:[],closed:false}}]}]} as unknown as Layer;
  const times=layerKeyTimes(l).sort((a,b)=>a-b);assert.deepEqual(times,[0,7,9,10,11,20,30,40]);
  const s=shiftLayerKeys(l,100);assert.deepEqual(layerKeyTimes(s).sort((a,b)=>a-b),times.map(t=>t+100));
  assert.equal(s.inT,5);assert.equal(s.outT,50);assert.equal((s.source.gradient?.stops??[])[0].offset,0.5);assert.equal(l.transform.position.keys[0].t,0);
});
test('layer.shift slide moves keys and in/out; slip moves only keys; one atomic step',()=>{
  const d=base(),k0=L(d).transform.position.keys.map(k=>k.t),c0=L(d).colorKeys!.fill!.map(k=>k.t);
  const sl=applyEdit(d,{type:'layer.shift',layer:'a',delta:f(5),mode:'slide'}),s=L(sl);
  assert.deepEqual([s.inT,s.outT],[f(15),f(65)]);assert.deepEqual(s.transform.position.keys.map(k=>k.t),k0.map(t=>t+f(5)));assert.deepEqual(s.colorKeys!.fill!.map(k=>k.t),c0.map(t=>t+f(5)));
  const sp=L(applyEdit(d,{type:'layer.shift',layer:'a',delta:f(5),mode:'slip'}));
  assert.deepEqual([sp.inT,sp.outT],[f(10),f(60)]);assert.deepEqual(sp.transform.position.keys.map(k=>k.t),k0.map(t=>t+f(5)));
});
test('layer.shift refuses bad shifts and changes nothing',()=>{
  const d=base();
  for(const e of [{delta:0},{delta:-f(5)},{delta:f(900)},{delta:1.5}])assert.throws(()=>applyEdit(d,{type:'layer.shift',layer:'a',mode:'slide',...e} as never),EditError);
  assert.throws(()=>applyEdit(d,{type:'layer.shift',layer:'a',delta:f(5),mode:'nope'} as never),EditError);
  const locked=applyEdit(d,{type:'layer.update',layer:'a',locked:true});assert.throws(()=>applyEdit(locked,{type:'layer.shift',layer:'a',delta:f(5),mode:'slide'}),EditError);
});
test('timing plan: slide, slip and slideTo, with skips',()=>{
  const d=base(),c=findComp(d)!;
  const r=timingPlan(c,['a'],'slide',{playhead:0,frames:5});assert.equal(r.changed,1);assert.equal(r.edits[0].type,'layer.shift');
  assert.deepEqual(L(applyEdits(d,r.edits)).transform.position.keys.map(k=>k.t),[f(5),f(35)]);
  assert.equal(timingPlan(c,['a'],'slide',{playhead:0,frames:-5}).skipped,1);
  assert.equal(timingPlan(c,['a'],'slip',{playhead:0,frames:0}).changed,0);
  const to=timingPlan(c,['a'],'slideTo',{playhead:f(20)});assert.equal(to.changed,1);assert.equal(L(applyEdits(d,to.edits)).inT,f(20));
  assert.equal(timingPlan(c,['a'],'slideTo',{playhead:f(10)}).changed,0);
});
