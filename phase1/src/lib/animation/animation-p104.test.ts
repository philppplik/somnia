import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer,type KeyRef} from './model';
import {applyEdits,EditError} from './edit';
import {frameToTick} from './time';
import {reverseEdits,layerKeyRefs,reversedRefs} from './keyReverse';
const f=(n:number)=>frameToTick(n,{num:30,den:1});
const mk=(id:string,pts:[number,number][])=>[{type:'layer.add',kind:'shape',id},{type:'prop.animate',layer:id,prop:'opacity',on:true,t:f(pts[0][0])},...pts.map(([t,v])=>({type:'prop.set',layer:id,prop:'opacity',t:f(t),value:v}))];
const base=()=>applyEdits(createDocument(),[...mk('a',[[0,0],[10,100],[30,40]]),...mk('b',[[50,5],[60,9]]),
 {type:'key.interp',layer:'a',prop:'opacity',t:f(0),interp:'bezier',out:[0.2,0.1],in:[0.6,0.9]},{type:'key.interp',layer:'a',prop:'opacity',t:f(10),interp:'linear'}] as never);
const keys=(d:ReturnType<typeof base>,id='a')=>findLayer(findComp(d)!,id)!.transform.opacity.keys;
const refs=(d:ReturnType<typeof base>,id='a'):KeyRef[]=>keys(d,id).map(k=>({layer:id,prop:'opacity',t:k.t}));
test('reverse swaps times and values around the middle, one batch',()=>{
  const d=base(),c=findComp(d)!;const e=reverseEdits(c,refs(d),false);const n=applyEdits(d,e);
  assert.deepEqual(keys(n).map(k=>k.t),[0,20,30].map(f));assert.deepEqual(keys(n).map(k=>k.v),[40,100,0]);
  assert.deepEqual(reversedRefs(e).map(r=>r.t).sort((x,y)=>x-y),[0,20,30].map(f));
});
test('ease handles mirror and each key takes the type of the segment before it',()=>{
  const d=base(),c=findComp(d)!,n=applyEdits(d,reverseEdits(c,refs(d),false));
  const last=keys(n)[2],first0=keys(d)[0];
  assert.deepEqual(last.out,[1-first0.in[0],1-first0.in[1]]);assert.deepEqual(last.in,[1-first0.out[0],1-first0.out[1]]);
  assert.equal(keys(n)[0].interp,'linear');assert.equal(keys(n)[1].interp,'bezier');
});
test('reversing twice restores times and values',()=>{
  const d=base(),c=findComp(d)!,once=applyEdits(d,reverseEdits(c,refs(d),false)),c2=findComp(once)!,twice=applyEdits(once,reverseEdits(c2,refs(once),false));
  assert.deepEqual(keys(twice).map(k=>[k.t,k.v]),keys(d).map(k=>[k.t,k.v]));
});
test('layer mode uses each layer own span; locked layer, one key and mixed refs are handled',()=>{
  const d=base(),c=findComp(d)!,e=reverseEdits(c,layerKeyRefs(c,['a','b']),true);const n=applyEdits(d,e);
  assert.deepEqual(keys(n,'b').map(k=>[k.t,k.v]),[[f(50),9],[f(60),5]]);assert.deepEqual(keys(n,'a').map(k=>k.t),[0,20,30].map(f));
  const shared=applyEdits(d,reverseEdits(c,layerKeyRefs(c,['a','b']),false));assert.deepEqual(keys(shared,'b').map(k=>k.t),[0,f(10)]);
  assert.throws(()=>reverseEdits(c,[refs(d)[0]],false));
  const locked=applyEdits(d,[{type:'layer.update',layer:'b',locked:true}] as never);assert.throws(()=>applyEdits(locked,e),EditError);
});
