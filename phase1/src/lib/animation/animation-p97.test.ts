import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer} from './model';
import {applyEdits} from './edit';
import {frameToTick} from './time';
import {timingPlan,MAX_STAGGER_FRAMES} from './layerTiming';
const fps={num:30,den:1},f=(n:number)=>frameToTick(n,fps);
const doc=()=>applyEdits(createDocument(),[{type:'layer.add',kind:'shape',id:'a'},{type:'layer.add',kind:'shape',id:'b'},{type:'layer.add',kind:'shape',id:'c'},{type:'markers.set',markers:[{id:'m1',t:f(10),label:'m1'},{id:'m2',t:f(40),label:'m2'}]}] as never);
const win=(d:ReturnType<typeof doc>,id:string)=>{const l=findLayer(findComp(d)!,id)!;return [l.inT,l.outT];};
test('stagger starts at the first layer and keeps outs',()=>{
  const d=doc(),c=findComp(d)!,out0=win(d,'c')[1],r=timingPlan(c,['a','b','c'],'stagger',{playhead:0,frames:6});
  assert.equal(r.changed,2);assert.equal(r.skipped,0);
  const n=applyEdits(d,r.edits);assert.deepEqual(win(n,'a'),win(d,'a'));assert.deepEqual(win(n,'b'),[f(6),win(d,'b')[1]]);assert.deepEqual(win(n,'c'),[f(12),out0]);
});
test('in and out to the playhead; invalid ones are skipped',()=>{
  const d=doc(),c=findComp(d)!,r=timingPlan(c,['a','b'],'in',{playhead:f(20)});assert.equal(r.changed,2);
  assert.deepEqual(win(applyEdits(d,r.edits),'a')[0],f(20));
  const o=timingPlan(c,['a'],'out',{playhead:f(15)});assert.deepEqual(win(applyEdits(d,o.edits),'a'),[0,f(15)]);
  const bad=timingPlan(c,['a'],'out',{playhead:0});assert.equal(bad.changed,0);assert.equal(bad.skipped,1);
  const past=timingPlan(c,['a'],'in',{playhead:c.duration+f(5)});assert.equal(past.skipped,1);
});
test('in-points go on markers in order; extra layers are skipped',()=>{
  const d=doc(),c=findComp(d)!,r=timingPlan(c,['c','a','b'],'markers',{playhead:0});
  assert.equal(r.changed,2);assert.equal(r.skipped,1);const n=applyEdits(d,r.edits);
  assert.equal(win(n,'c')[0],f(10));assert.equal(win(n,'a')[0],f(40));
});
test('locked, audio and missing layers are skipped; no-ops are not edits; limits hold',()=>{
  const d=applyEdits(doc(),[{type:'layer.update',layer:'b',locked:true}]),c=findComp(d)!;
  const r=timingPlan(c,['a','b','zzz'],'stagger',{playhead:0,frames:5});assert.equal(r.skipped,2);assert.equal(r.changed,0);
  assert.equal(timingPlan(c,['a'],'in',{playhead:0}).changed,0);
  assert.equal(timingPlan(c,['a','a'],'in',{playhead:f(3)}).changed,1);
  const big=timingPlan(c,['a','c'],'stagger',{playhead:0,frames:99999});assert.ok(big.edits.length<=1);assert.equal(MAX_STAGGER_FRAMES,600);
});
