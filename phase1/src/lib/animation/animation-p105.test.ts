import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer,type KeyRef} from './model';
import {applyEdits,EditError} from './edit';
import {frameToTick} from './time';
import {invertEdits} from './keyInvert';
const f=(n:number)=>frameToTick(n,{num:30,den:1});
const base=()=>applyEdits(createDocument(),[{type:'layer.add',kind:'shape',id:'a'},{type:'prop.animate',layer:'a',prop:'opacity',on:true,t:f(0)},{type:'prop.set',layer:'a',prop:'opacity',t:f(0),value:20},{type:'prop.set',layer:'a',prop:'opacity',t:f(10),value:90},{type:'prop.set',layer:'a',prop:'opacity',t:f(20),value:50},
 {type:'key.interp',layer:'a',prop:'opacity',t:f(0),interp:'bezier',out:[0.2,0.1],in:[0.6,0.9]},
 {type:'prop.animate',layer:'a',prop:'position',on:true,t:f(0)},{type:'prop.set',layer:'a',prop:'position',t:f(0),value:[0,100]},{type:'prop.set',layer:'a',prop:'position',t:f(10),value:[300,40]}] as never);
const L=(d:ReturnType<typeof base>)=>findLayer(findComp(d)!,'a')!.transform;
const r=(prop:'opacity'|'position',ts:number[]):KeyRef[]=>ts.map(t=>({layer:'a',prop,t:f(t)}));
test('scalar keys flip around the middle of their range, times and easing stay',()=>{
  const d=base(),n=applyEdits(d,invertEdits(findComp(d)!,r('opacity',[0,10,20])));
  assert.deepEqual(L(n).opacity.keys.map(k=>k.v),[90,20,60]);assert.deepEqual(L(n).opacity.keys.map(k=>k.t),L(d).opacity.keys.map(k=>k.t));
  assert.deepEqual(L(n).opacity.keys[0].out,L(d).opacity.keys[0].out);assert.equal(L(n).opacity.keys[0].interp,'bezier');
});
test('vec2 flips each component, twice restores, one batch',()=>{
  const d=base(),c=findComp(d)!,once=applyEdits(d,invertEdits(c,r('position',[0,10])));
  assert.deepEqual(L(once).position.keys.map(k=>k.v),[[300,40],[0,100]]);
  const twice=applyEdits(once,invertEdits(findComp(once)!,r('position',[0,10])));assert.deepEqual(L(twice).position.keys.map(k=>k.v),L(d).position.keys.map(k=>k.v));
  assert.equal(invertEdits(c,[...r('opacity',[0,10]),...r('position',[0,10])]).length,4);
});
test('refuses one key, equal values and locked layers',()=>{
  const d=base(),c=findComp(d)!;assert.throws(()=>invertEdits(c,r('opacity',[0])));
  const eq=applyEdits(d,[{type:'prop.set',layer:'a',prop:'opacity',t:f(10),value:20}] as never);assert.throws(()=>invertEdits(findComp(eq)!,r('opacity',[0,10])));
  const locked=applyEdits(d,[{type:'layer.update',layer:'a',locked:true}] as never);assert.throws(()=>applyEdits(locked,invertEdits(c,r('opacity',[0,10]))),EditError);
});
