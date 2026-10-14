import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer,validateDocument,MAX_TEXT_ANIMATORS,type AnimationDocument} from './model';
import {applyEdit,applyEdits,EditError} from './edit';
import {animatedChars,animatorEdit,charWeight,defaultAnimator} from './textAnimators';
import {frameSvg} from './exportFrames';
import {worldMatrix} from './scene';
import {TICKS_PER_SECOND as sec} from './time';
const comp=(d:AnimationDocument)=>findComp(d)!;
const text=(d:AnimationDocument)=>findLayer(comp(d),'title')!;
const base=()=>applyEdits(createDocument(),[{type:'layer.add',kind:'text',id:'title',over:{source:{text:'ABCDEFGHIJ',size:40,color:'#ffffff'}}}]);
const withAnimator=(over:Partial<ReturnType<typeof defaultAnimator>>={})=>applyEdit(base(),{type:'text.animators',layer:'title',animators:[{...defaultAnimator('a1'),...over}]});

test('animator selector weights are deterministic with a soft ramp',()=>{
 const a={...defaultAnimator('a'),start:0,end:50,softness:20};
 assert.equal(charWeight(a,0,10,0),1);assert.equal(charWeight(a,4,10,0),1);
 assert.ok(Math.abs(charWeight(a,5,10,0)-0.75)<1e-9);assert.equal(charWeight(a,9,10,0),0);
 assert.equal(charWeight({...a,softness:0},5,10,0),0);
 assert.equal(charWeight(a,9,10,50),1);
 assert.deepEqual(animatedChars(text(withAnimator()),'ABCDEFGHIJ',0),animatedChars(text(withAnimator()),'ABCDEFGHIJ',0));
});
test('shift, scale and opacity apply only inside the range; spans carry relative shifts',()=>{
 const d=withAnimator({start:0,end:50,softness:0,position:[0,40],scale:200,opacity:0});
 const spans=animatedChars(text(d),'ABCDEFGHIJ',0)!;
 assert.equal(spans.length,10);
 assert.deepEqual(spans.slice(0,5).map(s=>[s.scale,s.opacity]),Array(5).fill([2,0]));
 assert.deepEqual(spans.slice(5).map(s=>[s.scale,s.opacity,s.dy]),[[1,1,-40],...Array(4).fill([1,1,0])]);
 assert.equal(spans[0].dy,40);
});
test('keyed offset moves the range over time',()=>{
 let d=withAnimator({start:0,end:20,softness:0,position:[10,0],scale:100,opacity:100});
 d=applyEdit(d,animatorEdit(d,'title',{op:'animate',animator:'a1',on:true,t:0}));
 d=applyEdit(d,animatorEdit(d,'title',{op:'offset',animator:'a1',value:80,t:sec}));
 const at=(t:number)=>animatedChars(text(d),'ABCDEFGHIJ',t)!.map(s=>s.dx);
 assert.deepEqual(at(0).slice(0,3),[10,0,-10]);
 assert.notDeepEqual(at(0),at(sec));assert.deepEqual(at(sec),at(sec));
 assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))),[]);
});
test('animators are undoable edits, bounded, and validated',()=>{
 let d=base();
 for(let i=0;i<MAX_TEXT_ANIMATORS;i++)d=applyEdit(d,animatorEdit(d,'title',{op:'add',id:`n${i}`}));
 assert.equal(text(d).animators!.length,MAX_TEXT_ANIMATORS);
 assert.throws(()=>animatorEdit(d,'title',{op:'add'}),/At most/);
 assert.throws(()=>applyEdit(d,animatorEdit(d,'title',{op:'update',animator:'n0',patch:{start:80,end:20}})),EditError);
 assert.throws(()=>applyEdit(d,animatorEdit(d,'title',{op:'update',animator:'n0',patch:{opacity:500}})),EditError);
 assert.throws(()=>applyEdit(d,animatorEdit(d,'title',{op:'update',animator:'n0',patch:{position:[1e6,0]}})),EditError);
 assert.throws(()=>animatorEdit(d,'title',{op:'remove',animator:'ghost'}),/no longer exists/);
 d=applyEdit(d,animatorEdit(d,'title',{op:'remove',animator:'n0'}));assert.equal(text(d).animators!.length,MAX_TEXT_ANIMATORS-1);
 const s=applyEdit(createDocument(),{type:'layer.add',kind:'shape',id:'s'});
 assert.throws(()=>animatorEdit(s,'s',{op:'add'}),/text layer/);
 assert.throws(()=>applyEdit(s,{type:'text.animators',layer:'s',animators:[defaultAnimator('x')]}),EditError);
});
test('long text with animators is rejected',()=>{
 const d=withAnimator();
 assert.throws(()=>applyEdit(d,{type:'layer.update',layer:'title',source:{text:'x'.repeat(1001)}}),EditError);
 assert.equal(text(applyEdit(d,{type:'layer.update',layer:'title',source:{text:'x'.repeat(1000)}})).source.text!.length,1000);
});
test('export frame renders one span per revealed character with shifts and opacity',()=>{
 const d=withAnimator({start:0,end:50,softness:0,position:[0,40],opacity:0});
 const svg=frameSvg(comp(d),0);
 assert.equal((svg.match(/<tspan /g)??[]).length,10);
 assert.ok(svg.includes('fill-opacity="0"')&&svg.includes('dy="40"'));
 assert.equal(frameSvg(comp(d),0),svg);
 assert.ok(!frameSvg(comp(base()),0).includes('<tspan'));
 const off=applyEdit(d,animatorEdit(d,'title',{op:'update',animator:'a1',patch:{enabled:false}}));
 assert.ok(!frameSvg(comp(off),0).includes('<tspan'));
});
test('timeline parenting: reparent with keep-world preserves the pose, plain reparent does not',()=>{
 let d=applyEdits(createDocument(),[{type:'layer.add',kind:'shape',id:'child'},{type:'layer.add',kind:'null',id:'rig'},{type:'prop.set',layer:'rig',prop:'position',value:[300,200],t:0}]);
 const before=worldMatrix(comp(d),findLayer(comp(d),'child')!,0);
 const kept=applyEdit(d,{type:'layer.parent',layer:'child',parent:'rig',keepWorld:true,t:0});
 worldMatrix(comp(kept),findLayer(comp(kept),'child')!,0).forEach((v,i)=>assert.ok(Math.abs(v-before[i])<1e-6));
 const plain=applyEdit(d,{type:'layer.parent',layer:'child',parent:'rig'});
 assert.notDeepEqual(worldMatrix(comp(plain),findLayer(comp(plain),'child')!,0),before);
 assert.throws(()=>applyEdit(kept,{type:'layer.parent',layer:'rig',parent:'child'}),(e:unknown)=>e instanceof EditError&&e.code==='cycle');
 assert.equal(findLayer(comp(applyEdit(kept,{type:'layer.parent',layer:'child',parent:null})),'child')!.parent,null);
});
