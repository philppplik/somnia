import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer} from './model';
import {applyEdits} from './edit';
import {frameToTick} from './time';
import {barDragEdit} from './barDrag';
const f=(n:number)=>frameToTick(n,{num:30,den:1});
const doc=()=>applyEdits(createDocument(),[{type:'layer.add',kind:'shape',id:'a'},{type:'prop.animate',layer:'a',prop:'position',on:true,t:f(0)},{type:'key.add',layer:'a',prop:'position',t:f(30)},{type:'layer.timing',layer:'a',inT:f(10),outT:f(60)}] as never);
const L=(d:ReturnType<typeof doc>)=>findLayer(findComp(d)!,'a')!;
test('body drag slides, shift slips, edges trim',()=>{
  const d=doc(),l=L(d);
  const mv=applyEdits(d,[barDragEdit(l,'move',f(5))!]);assert.deepEqual([L(mv).inT,L(mv).outT],[f(15),f(65)]);assert.equal(L(mv).transform.position.keys[0].t,f(5));
  const sp=applyEdits(d,[barDragEdit(l,'slip',f(5))!]);assert.deepEqual([L(sp).inT,L(sp).outT],[f(10),f(60)]);assert.equal(L(sp).transform.position.keys[0].t,f(5));
  const ti=applyEdits(d,[barDragEdit(l,'trimIn',f(-4))!]);assert.deepEqual([L(ti).inT,L(ti).outT],[f(6),f(60)]);assert.equal(L(ti).transform.position.keys[0].t,0);
  const to=applyEdits(d,[barDragEdit(l,'trimOut',f(-4))!]);assert.deepEqual([L(to).inT,L(to).outT],[f(10),f(56)]);
});
test('no edit for zero, fractional, locked and audio layers',()=>{
  const l=L(doc());
  assert.equal(barDragEdit(l,'move',0),null);assert.equal(barDragEdit(l,'move',1.5),null);
  assert.equal(barDragEdit({...l,locked:true},'move',f(5)),null);assert.equal(barDragEdit({...l,kind:'audio'},'trimIn',f(5)),null);
});
test('refused positions throw so the drag keeps the last valid preview',()=>{
  const l=L(doc());
  assert.throws(()=>applyEdits(doc(),[barDragEdit(l,'trimIn',f(60))!]));
  assert.throws(()=>applyEdits(doc(),[barDragEdit(l,'move',-f(20))!]));
  assert.throws(()=>applyEdits(doc(),[barDragEdit(l,'trimOut',-f(60))!]));
});
