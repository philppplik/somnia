import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer,type KeyRef} from './model';
import {applyEdits,EditError} from './edit';
import {frameToTick} from './time';
import {valueEdits} from './keyValues';
const f=(n:number)=>frameToTick(n,{num:30,den:1});
const base=()=>applyEdits(createDocument(),[{type:'layer.add',kind:'shape',id:'a'},{type:'prop.animate',layer:'a',prop:'opacity',on:true,t:f(0)},{type:'prop.set',layer:'a',prop:'opacity',t:f(0),value:20},{type:'prop.set',layer:'a',prop:'opacity',t:f(10),value:60},{type:'prop.set',layer:'a',prop:'opacity',t:f(20),value:30},
 {type:'prop.animate',layer:'a',prop:'position',on:true,t:f(0)},{type:'prop.set',layer:'a',prop:'position',t:f(0),value:[100,100]},{type:'prop.set',layer:'a',prop:'position',t:f(10),value:[200,50]}] as never);
const L=(d:ReturnType<typeof base>)=>findLayer(findComp(d)!,'a')!.transform;
const r=(prop:'opacity'|'position',ts:number[]):KeyRef[]=>ts.map(t=>({layer:'a',prop,t:f(t)}));
test('offset adds to scalars and both vec2 components',()=>{
  const d=base(),c=findComp(d)!;
  assert.deepEqual(L(applyEdits(d,valueEdits(c,r('opacity',[0,10]),'offset',15))).opacity.keys.map(k=>k.v),[35,75,30]);
  assert.deepEqual(L(applyEdits(d,valueEdits(c,r('position',[0,10]),'offset',-10))).position.keys.map(k=>k.v),[[90,90],[190,40]]);
});
test('scale keeps the first selected key and scales the distance',()=>{
  const d=base(),c=findComp(d)!,n=applyEdits(d,valueEdits(c,r('opacity',[0,10,20]),'scale',50));
  assert.deepEqual(L(n).opacity.keys.map(k=>k.v),[20,40,25]);
  assert.deepEqual(L(applyEdits(d,valueEdits(c,r('position',[0,10]),'scale',200))).position.keys.map(k=>k.v),[[100,100],[300,0]]);
});
test('bad input, no change and out-of-range values are refused',()=>{
  const d=base(),c=findComp(d)!;
  assert.throws(()=>valueEdits(c,r('opacity',[0]),'offset',Infinity));assert.throws(()=>valueEdits(c,r('opacity',[0]),'scale',5000));assert.throws(()=>valueEdits(c,[],'offset',1));
  assert.throws(()=>valueEdits(c,r('opacity',[0,10]),'offset',0));assert.throws(()=>valueEdits(c,r('opacity',[0]),'x' as never,1));
  assert.throws(()=>applyEdits(d,valueEdits(c,r('opacity',[0,10]),'offset',80)),EditError);
});
test('snap rounds scalars and both vec2 components to a step; bad steps are refused',()=>{
  const d=applyEdits(base(),[{type:'prop.set',layer:'a',prop:'opacity',t:f(10),value:63.4},{type:'prop.set',layer:'a',prop:'position',t:f(10),value:[203,48]}] as never),c=findComp(d)!;
  assert.deepEqual(L(applyEdits(d,valueEdits(c,r('opacity',[0,10]),'snap',5))).opacity.keys.map(k=>k.v),[20,65,30]);
  assert.deepEqual(L(applyEdits(d,valueEdits(c,r('position',[0,10]),'snap',10))).position.keys.map(k=>k.v),[[100,100],[200,50]]);
  assert.throws(()=>valueEdits(c,r('opacity',[0,10]),'snap',0));assert.throws(()=>valueEdits(c,r('opacity',[0,10]),'snap',-5));assert.throws(()=>valueEdits(c,r('opacity',[0]),'snap',5));
});
