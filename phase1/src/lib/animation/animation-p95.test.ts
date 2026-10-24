import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer} from './model';
import {applyEdits} from './edit';
import {frameToTick} from './time';
import {stretchMoves} from './keyStretch';
const fps={num:30,den:1},f=(n:number)=>frameToTick(n,fps);
const doc=()=>applyEdits(createDocument(),[{type:'layer.add',kind:'shape',id:'a'},{type:'prop.animate',layer:'a',prop:'position',on:true,t:f(0)},...[30,60].map(n=>({type:'key.add' as const,layer:'a',prop:'position' as const,t:f(n)}))]);
const keys=(frames:number[])=>frames.map(n=>({layer:'a',prop:'position' as const,t:f(n)}));
test('stretch scales gaps around the anchor and snaps to frames',()=>{
  const c=findComp(doc())!,r=stretchMoves(c,keys([30,60]),200,f(30));
  assert.deepEqual(r.moves.map(m=>[m.from,m.to]),[[f(60),f(90)]]);assert.equal(r.unchanged,1);assert.equal(r.skipped,0);
});
test('half-speed collides with a fixed key and is skipped',()=>{
  const c=findComp(doc())!,r=stretchMoves(c,keys([60]),50,f(0));
  assert.equal(r.moves.length,0);assert.equal(r.skipped,1);
});
test('keys leaving the composition are skipped; junk percent does nothing',()=>{
  const c=findComp(doc())!,end=c.start+c.duration;
  const r=stretchMoves(c,keys([30,60]),1000,0);assert.ok(r.moves.every(m=>m.to>=c.start&&m.to<=end));assert.ok(r.skipped>=0);
  for(const p of [0,5,5000,NaN])assert.deepEqual(stretchMoves(c,keys([30]),p,0),{moves:[],skipped:0,unchanged:0});
});
test('retime applies the moves as one edit and keeps values',()=>{
  const d=doc(),c=findComp(d)!,r=stretchMoves(c,keys([30,60]),200,f(30)),n=applyEdits(d,[{type:'keys.retime',moves:r.moves}]);
  const ks=findLayer(findComp(n)!,'a')!.transform.position.keys;assert.deepEqual(ks.map(k=>k.t),[f(0),f(30),f(90)]);
});
import {stretchPlan,stretchStyleMoves} from './keyStretch';
const cdoc=()=>applyEdits(createDocument(),[{type:'layer.add',kind:'shape',id:'a'},{type:'color.prop',layer:'a',prop:'fill',op:'animate',on:true,t:f(0)},{type:'color.prop',layer:'a',prop:'fill',op:'set',color:'#ff0000',t:f(30)},{type:'color.prop',layer:'a',prop:'fill',op:'set',color:'#00ff00',t:f(60)}]);
const sk=(frames:number[])=>frames.map(n=>({layer:'a',lane:'fill' as const,t:f(n)}));
test('style-lane keys stretch in a safe order and apply as one batch',()=>{
  const d=cdoc(),c=findComp(d)!,r=stretchStyleMoves(c,sk([30,60]),200,f(0));
  assert.deepEqual(r.moves.map(m=>[m.from,m.to]),[[f(60),f(120)],[f(30),f(60)]]);
  const n=applyEdits(d,r.moves.map(m=>({type:'style.key.move' as const,layer:m.layer,lane:m.lane,from:m.from,to:m.to})));
  assert.deepEqual(findLayer(findComp(n)!,'a')!.colorKeys!.fill!.map(k=>k.t),[f(0),f(60),f(120)]);
});
test('style stretch skips collisions with fixed keys and junk percent',()=>{
  const c=findComp(cdoc())!,r=stretchStyleMoves(c,sk([60]),50,f(0));assert.equal(r.moves.length,0);assert.equal(r.skipped,1);
  assert.deepEqual(stretchStyleMoves(c,sk([30]),0,0),{moves:[],skipped:0,unchanged:0});
});
test('stretchPlan combines both kinds and counts skipped; empty selection is a no-op',()=>{
  const c=findComp(cdoc())!;
  const p=stretchPlan(c,[],sk([30,60]),200,'first',0);assert.equal(p.styleMoves.length,1);assert.equal(p.unchanged,1);
  assert.deepEqual(stretchPlan(c,[],[],200,'first',0),{moves:[],styleMoves:[],skipped:0,unchanged:0});
  const q=stretchPlan(c,[],sk([30,60]),200,'playhead',f(60));assert.equal(q.styleMoves.length,0);assert.equal(q.skipped,1);
});
