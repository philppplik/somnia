import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer,type KeyRef} from './model';
import {applyEdits} from './edit';
import {frameToTick} from './time';
import {copySetKeys,pasteSetEdits,pastedSetRefs,pasteTargets,setKeyRefs} from './keySetClip';
const f=(n:number)=>frameToTick(n,{num:30,den:1});
const mk=(id:string,at:number[])=>[{type:'layer.add',kind:'shape',id},{type:'prop.animate',layer:id,prop:'position',on:true,t:f(at[0])},...at.slice(1).map(t=>({type:'key.add',layer:id,prop:'position',t:f(t)}))];
const doc=()=>applyEdits(createDocument(),[...mk('a',[10,20]),...mk('b',[15,40]),...mk('c',[0]),...mk('d',[0])] as never);
const keys=(d:ReturnType<typeof doc>,id:string)=>findLayer(findComp(d)!,id)!.transform.position.keys.map(k=>k.t);
const refs=(ids:string[]):KeyRef[]=>ids.flatMap(id=>keys(doc(),id).map(t=>({layer:id,prop:'position' as const,t})));
test('copy keeps relative timing across layers, anchored on the earliest key',()=>{
  const c=findComp(doc())!,k=copySetKeys(c,refs(['a','b']));
  assert.equal(k.first,f(10));assert.deepEqual(k.groups.map(g=>g.layer),c.layers.map(l=>l.id).filter(i=>i==='a'||i==='b'));
  const A=k.groups.find(g=>g.layer==='a')!,B=k.groups.find(g=>g.layer==='b')!;
  assert.deepEqual(A.items.map(i=>i.dt),[0,f(10)]);assert.deepEqual(B.items.map(i=>i.dt),[f(5),f(30)]);
  assert.throws(()=>copySetKeys(c,[]));
});
test('paste of several layers goes back to the same layers at the playhead, one batch',()=>{
  const d=doc(),c=findComp(d)!,k=copySetKeys(c,refs(['a','b']));
  const e=pasteSetEdits(c,k,f(100));assert.equal(e.length,2);
  const n=applyEdits(d,e);assert.deepEqual(keys(n,'a'),[f(10),f(20),f(100),f(110)]);assert.deepEqual(keys(n,'b'),[f(15),f(40),f(105),f(130)]);
  assert.equal(pastedSetRefs(c,k,f(100)).length,4);
});
test('paste in place keeps the original times',()=>{
  const d=doc(),c=findComp(d)!,k=copySetKeys(c,refs(['a']));
  const n=applyEdits(d,pasteSetEdits(c,k,f(100),['c','d'],true));assert.deepEqual(keys(n,'c'),[0,f(10),f(20)]);assert.deepEqual(keys(n,'d'),[0,f(10),f(20)]);
});
test('one copied layer fills every target, several map in order and must match in number',()=>{
  const c=findComp(doc())!,one=copySetKeys(c,refs(['a'])),two=copySetKeys(c,refs(['a','b']));
  const n=applyEdits(doc(),pasteSetEdits(c,one,f(50),['b','c','d']));assert.deepEqual(keys(n,'c'),[0,f(50),f(60)]);assert.deepEqual(keys(n,'b'),[f(15),f(40),f(50),f(60)]);
  const m=applyEdits(doc(),pasteSetEdits(c,two,f(50),['c','d']));const first=c.layers.findIndex(l=>l.id==='c')<c.layers.findIndex(l=>l.id==='d')?'c':'d',second=first==='c'?'d':'c',aFirst=(_x:number)=>two.groups[0].layer==='a';
  assert.deepEqual(keys(m,first),aFirst(0)?[0,f(50),f(60)]:[0,f(55),f(80)]);assert.deepEqual(keys(m,second),aFirst(0)?[0,f(55),f(80)]:[0,f(50),f(60)]);
  assert.throws(()=>pasteTargets(c,two,['c']));assert.throws(()=>pasteTargets(c,one,['zzz']));
});
test('a copied layer that is gone needs explicit targets; pasting past the end is refused whole',()=>{
  const d=doc(),c=findComp(d)!,k=copySetKeys(c,refs(['a','b']));
  const gone=applyEdits(d,[{type:'layer.remove',layer:'a'}] as never);assert.throws(()=>pasteTargets(findComp(gone)!,k,null));
  assert.throws(()=>applyEdits(d,pasteSetEdits(c,k,c.start+c.duration-f(2))));
});
test('selecting set keys lists every key of the picked layers only',()=>{
  const c=findComp(doc())!;assert.equal(setKeyRefs(c,['a','b']).length,4);assert.equal(setKeyRefs(c,['zzz']).length,0);
});
