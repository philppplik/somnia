import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer,type KeyRef} from './model';
import {applyEdits,EditError} from './edit';
import {frameToTick} from './time';
import {repeatEdits,repeatedRefs} from './keyRepeat';
const f=(n:number)=>frameToTick(n,{num:30,den:1});
const base=()=>applyEdits(createDocument(),[{type:'layer.add',kind:'shape',id:'a'},{type:'prop.animate',layer:'a',prop:'opacity',on:true,t:f(0)},{type:'prop.set',layer:'a',prop:'opacity',t:f(0),value:0},{type:'prop.set',layer:'a',prop:'opacity',t:f(10),value:100},{type:'prop.set',layer:'a',prop:'opacity',t:f(20),value:40},
 {type:'key.interp',layer:'a',prop:'opacity',t:f(0),interp:'bezier',out:[0.2,0.1],in:[0.6,0.9]}] as never);
const keys=(d:ReturnType<typeof base>)=>findLayer(findComp(d)!,'a')!.transform.opacity.keys;
const sel=(d:ReturnType<typeof base>):KeyRef[]=>keys(d).map(k=>({layer:'a',prop:'opacity',t:k.t}));
test('cycle repeats the keys after the selection, the seam key takes the first value',()=>{
  const d=base(),c=findComp(d)!;const n=applyEdits(d,repeatEdits(c,sel(d),2,'cycle'));
  assert.deepEqual(keys(n).map(k=>k.t),[0,10,20,30,40,50,60].map(f));
  assert.deepEqual(keys(n).map(k=>k.v),[0,100,0,100,0,100,40]);
});
test('ping-pong plays odd rounds backwards with mirrored easing',()=>{
  const d=base(),c=findComp(d)!;const n=applyEdits(d,repeatEdits(c,sel(d),1,'pingpong'));
  assert.deepEqual(keys(n).map(k=>k.t),[0,10,20,30,40].map(f));assert.deepEqual(keys(n).map(k=>k.v),[0,100,40,100,0]);
  const last=keys(n)[4],first=keys(d)[0];
  assert.deepEqual(last.in,[1-first.out[0],1-first.out[1]]);assert.deepEqual(last.out,[1-first.in[0],1-first.in[1]]);
});
test('rounds past the composition end are clipped, bad input is refused',()=>{
  const d=base(),c=findComp(d)!;const e=repeatEdits(c,sel(d),20,'cycle');
  const n=applyEdits(d,e);assert.ok(keys(n).every(k=>k.t<=c.start+c.duration));assert.ok(keys(n).length>3);
  assert.throws(()=>repeatEdits(c,sel(d),0,'cycle'));assert.throws(()=>repeatEdits(c,sel(d),21,'cycle'));assert.throws(()=>repeatEdits(c,[],2,'cycle'));
  assert.throws(()=>repeatEdits(c,[sel(d)[0]],2,'cycle'));assert.throws(()=>repeatEdits(c,sel(d),2,'x' as never));
});
test('refs of the added keys match the new key times; locked layers refuse the whole repeat',()=>{
  const d=base(),c=findComp(d)!,e=repeatEdits(c,sel(d),1,'cycle');
  assert.deepEqual(repeatedRefs(c,e).map(r=>r.t).sort((a,b)=>a-b),[0,10,20].map(x=>f(x+20)));
  const locked=applyEdits(d,[{type:'layer.update',layer:'a',locked:true}] as never);assert.throws(()=>applyEdits(locked,e),EditError);
});
