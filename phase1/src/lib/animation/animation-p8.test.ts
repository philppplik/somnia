import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateMod,validateModifiers,WIGGLE_MAX_AMPLITUDE,WIGGLE_MAX_FREQUENCY,type Modifier} from './modifiers';
import {createDocument,createComposition,findComp,findLayer,validateDocument,type AnimationDocument,type Property} from './model';
import {applyEdit} from './edit';
import {AnimationSession} from './session';
import {prop} from './model';
import {evaluate} from './interpolate';
const fps={num:30,den:1};const sec=(n:number)=>n*240000;
const docWith=()=>applyEdit(createDocument('m',createComposition({fps,duration:sec(4)})),{type:'layer.add',kind:'shape',id:'L'});
const withKeys=(doc:AnimationDocument)=>applyEdits2(doc,[
 {type:'prop.animate',layer:'L',prop:'position',on:true,t:0} as never,
 {type:'prop.set',layer:'L',prop:'position',value:[0,0],t:0} as never,
 {type:'prop.set',layer:'L',prop:'position',value:[300,0],t:sec(1)} as never]);
const applyEdits2=(d:AnimationDocument,es:never[])=>es.reduce((c,e)=>applyEdit(c,e),d);
const posOf=(d:AnimationDocument)=>findLayer(findComp(d)!,'L')!.transform.position;
test('wiggle is deterministic per seed and bounded by amplitude',()=>{
 const p={...prop('scalar',50),modifiers:[{type:'wiggle',seed:7,amplitude:10,frequency:2}] as Modifier[]};
 const a=[0.13,0.5,1.01,2.7].map(t=>evaluateMod(p,sec(t)) as number);
 const b=[0.13,0.5,1.01,2.7].map(t=>evaluateMod(p,sec(t)) as number);
 assert.deepEqual(a,b,'same seed, same wiggle');
 const c=[0.13,0.5,1.01,2.7].map(t=>evaluateMod({...p,modifiers:[{type:'wiggle',seed:8,amplitude:10,frequency:2}]},sec(t)) as number);
 assert.notDeepEqual(a,c,'different seed, different wiggle');
 for(const v of a)assert.ok(Math.abs(v-50)<=10+1e-9,'bounded by amplitude');
 const still=[0.001,0.4,0.9].map(t=>evaluateMod(p,sec(t)) as number);
 assert.ok(still.some((v,i)=>i>0&&v!==still[0]),'wiggle moves over time');
});
test('wiggle on vec2 wiggles both channels independently and stacked wiggles add up',()=>{
 const p={...prop('vec2',[0,0]),modifiers:[{type:'wiggle',seed:1,amplitude:5,frequency:1}] as Modifier[]};
 const [x,y]=evaluateMod(p,sec(0.37)) as [number,number];
 assert.ok(x!==0&&y!==0&&x!==y,'independent channels');
 const p2={...prop('vec2',[0,0]),modifiers:[{type:'wiggle',seed:1,amplitude:5,frequency:1},{type:'wiggle',seed:1,amplitude:5,frequency:1}] as Modifier[]};
 const [x2]=evaluateMod(p2,sec(0.37)) as [number,number];
 assert.ok(Math.abs(x2-2*x)<1e-9,'stacked modifiers compose');
});
test('loop cycle repeats, pingpong mirrors, offset accumulates',()=>{
 const doc=withKeys(docWith());const base=posOf(doc);
 const span=sec(1);
 const at=(p:Property,t:number)=>evaluateMod(p,t) as [number,number];
 const cyc=applyEdit(doc,{type:'modifier.add',layer:'L',prop:'position',modifier:{type:'loop',mode:'cycle'}} as never);
 const pc=posOf(cyc);
 assert.deepEqual(at(pc,span+sec(0.5)),at(pc,sec(0.5)),'cycle repeats after one span');
 assert.deepEqual(at(pc,3*span),at(pc,0),'cycle returns to start');
 const pp=posOf(applyEdit(doc,{type:'modifier.add',layer:'L',prop:'position',modifier:{type:'loop',mode:'pingpong'}} as never));
 assert.deepEqual(at(pp,span+sec(0.25)),at(pp,sec(0.75)),'pingpong mirrors the second span');
 const off=posOf(applyEdit(doc,{type:'modifier.add',layer:'L',prop:'position',modifier:{type:'loop',mode:'offset'}} as never));
 const delta=(at(off,2*span+sec(0.5))[0])-(at(base,sec(0.5))[0]);
 assert.ok(Math.abs(delta-600)<1e-9,'offset adds the keyed delta per cycle');
});
test('loop without keys is a no-op and plain evaluate is untouched',()=>{
 const p={...prop('scalar',42),modifiers:[{type:'loop',mode:'cycle'}] as Modifier[]};
 assert.equal(evaluateMod(p,sec(9)),42);
 assert.equal(evaluate(p,sec(9)),42);
});
test('modifier edits are validated, undoable and survive a document round trip',()=>{
 const s=new AnimationSession(null);s.open(docWith());
 s.dispatch({type:'modifier.add',layer:'L',prop:'rotation',modifier:{type:'wiggle',seed:3,amplitude:20,frequency:1.5}});
 assert.deepEqual(findLayer(findComp(s.document!)!,'L')!.transform.rotation.modifiers,[{type:'wiggle',seed:3,amplitude:20,frequency:1.5}]);
 assert.throws(()=>s.dispatch({type:'modifier.add',layer:'L',prop:'rotation',modifier:{type:'wiggle',seed:3,amplitude:WIGGLE_MAX_AMPLITUDE+1,frequency:1}}),(e:{code?:string})=>e.code==='invalid');
 assert.throws(()=>s.dispatch({type:'modifier.add',layer:'L',prop:'rotation',modifier:{type:'wiggle',seed:3,amplitude:5,frequency:WIGGLE_MAX_FREQUENCY+1}}),(e:{code?:string})=>e.code==='invalid');
 assert.throws(()=>s.dispatch({type:'modifier.remove',layer:'L',prop:'rotation',index:1}),(e:{code?:string})=>e.code==='missing');
 s.dispatch({type:'modifier.remove',layer:'L',prop:'rotation',index:0});
 assert.equal(findLayer(findComp(s.document!)!,'L')!.transform.rotation.modifiers,undefined);
 s.undo();assert.equal(findLayer(findComp(s.document!)!,'L')!.transform.rotation.modifiers?.length,1);
 const round=JSON.parse(JSON.stringify(s.document));
 assert.equal(findLayer(findComp(round)!,'L')!.transform.rotation.modifiers?.length,1,'serialised in the document');
 const bad=JSON.parse(JSON.stringify(s.document));
 findLayer(findComp(bad)!,'L')!.transform.rotation.modifiers=[{type:'wiggle',seed:-1,amplitude:5,frequency:1}];
 assert.ok(validateDocument(bad).some(m=>m.includes('seed')));
});
test('validateModifiers bounds every field',()=>{
 assert.equal(validateModifiers(undefined).length,0);
 assert.equal(validateModifiers([{type:'loop',mode:'pingpong'}]).length,0);
 assert.ok(validateModifiers([{type:'loop',mode:'forever' as never}]).length>0);
 assert.ok(validateModifiers([{type:'wiggle',seed:1.5,amplitude:1,frequency:1}]).length>0);
 assert.ok(validateModifiers(([{type:'nope'}] as unknown as Modifier[])).length>0);
});
