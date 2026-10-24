import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp} from './model';
import {applyEdits} from './edit';
import {frameToTick} from './time';
import {keysAround} from './keyRange';
const f=(n:number)=>frameToTick(n,{num:30,den:1});
const mk=(id:string,ts:number[])=>[{type:'layer.add',kind:'shape',id},{type:'prop.animate',layer:id,prop:'position',on:true,t:f(ts[0])},...ts.slice(1).map(t=>({type:'key.add',layer:id,prop:'position',t:f(t)}))];
const d=()=>applyEdits(createDocument(),[...mk('a',[0,10,20]),...mk('b',[5,10,30])] as never);
test('keys at or after / before the playhead on the given layers only',()=>{
  const c=findComp(d())!;
  assert.deepEqual(keysAround(c,['a'],f(10),'after').map(r=>r.t),[10,20].map(f));assert.deepEqual(keysAround(c,['a'],f(10),'before').map(r=>r.t),[0,10].map(f));
  assert.equal(keysAround(c,['a','b'],f(10),'after').length,4);assert.equal(keysAround(c,['zzz'],f(10),'after').length,0);assert.equal(keysAround(c,['a'],f(21),'after').length,0);
});
