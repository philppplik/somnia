import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer} from './model';
import {applyEdits} from './edit';
import {frameToTick} from './time';
import {AnimationSession} from './session';
import {ReviewedError} from './reviewedCommit';
const f=(n:number)=>frameToTick(n,{num:30,den:1});
const base=()=>applyEdits(createDocument(),[{type:'layer.add',kind:'shape',id:'a'},{type:'prop.animate',layer:'a',prop:'position',on:true,t:f(0)},{type:'prop.set',layer:'a',prop:'position',t:f(0),value:[100,100]},{type:'prop.set',layer:'a',prop:'position',t:f(10),value:[200,50]}] as never);
const open=()=>{const s=new AnimationSession();s.open(base());return s;};
const req=(s:AnimationSession,value:number[]=[120,90],over:object={})=>({doc:s.document!,layer:'a',prop:'position' as const,t:f(0),expected:[100,100],value,origin:'agent-1',...over});
const code=(fn:()=>unknown)=>{try{fn();}catch(e){return e instanceof ReviewedError?e.code:'other';}return 'none';};
test('apply: one history step, readback, receipt; undo restores exactly',()=>{
 const s=open(),d0=s.document!,r=s.applyReviewed(req(s));
 assert.equal(r.applied,1);assert.deepEqual(r.after,[120,90]);assert.deepEqual(r.before,[100,100]);assert.equal(r.postCommitErrors,0);
 const u=s.undoReviewed(r);assert.equal(u.applied,1);assert.deepEqual(u.after,[100,100]);assert.equal(s.document,d0);assert.equal(s.getState().canUndo,false);
});
test('no-op and stale refusals change nothing',()=>{
 const s=open(),d0=s.document!;
 assert.equal(s.applyReviewed(req(s,[100,100])).applied,0);assert.equal(s.getState().canUndo,false);
 assert.equal(code(()=>s.applyReviewed(req(s,[1,1],{expected:[9,9]}))),'stale-value');
 assert.equal(code(()=>s.applyReviewed(req(s,[1,1],{t:f(3)}))),'bad-target');
 assert.equal(code(()=>s.applyReviewed(req(s,[1,1],{doc:base()}))),'stale-document');
 assert.equal(code(()=>s.applyReviewed(req(s,[1,1],{layer:'zz'}))),'bad-target');
 assert.equal(code(()=>s.applyReviewed(req(s,[Number.NaN,1]))),'invalid');
 assert.equal(s.document,d0);
});
test('locked layer and active preview refuse',()=>{
 const s=open();s.dispatch({type:'layer.update',layer:'a',locked:true} as never);
 assert.equal(code(()=>s.applyReviewed(req(s))),'locked');
 const p=open();p.previewEdits([{type:'prop.set',layer:'a',prop:'position',t:f(0),value:[1,1]} as never]);
 assert.equal(code(()=>p.applyReviewed(req(p))),'preview-active');
});
test('undo refuses after a newer manual edit and for foreign receipts',()=>{
 const s=open(),r=s.applyReviewed(req(s));
 s.dispatch({type:'prop.set',layer:'a',prop:'position',t:f(10),value:[5,5]} as never);
 assert.equal(code(()=>s.undoReviewed(r)),'stale-history');
 const o=open(),r2=o.applyReviewed(req(o));
 assert.equal(code(()=>s.undoReviewed(r2)),'stale-history');
 const s3=open(),r3=s3.applyReviewed(req(s3));s3.open(base());
 assert.equal(code(()=>s3.undoReviewed(r3)),'stale-history');
});
test('listener exceptions after commit do not turn it into a failure',()=>{
 const s=open();s.subscribe(()=>{throw new Error('boom');});
 const r=s.applyReviewed(req(s));
 assert.equal(r.applied,1);assert.ok(r.postCommitErrors>=1);
 assert.deepEqual(findLayer(findComp(s.document!)!,'a')!.transform.position.keys[0].v,[120,90]);
});
test('other keys and eases are preserved',()=>{
 const s=open(),before=findLayer(findComp(s.document!)!,'a')!.transform.position.keys;
 s.applyReviewed(req(s));
 const after=findLayer(findComp(s.document!)!,'a')!.transform.position.keys;
 assert.deepEqual(after[1],before[1]);assert.equal(after[0].interp,before[0].interp);assert.deepEqual(after[0].out,before[0].out);
});
import {nthKeys} from './keyNth';
test('nth keys: per property in time order, offset, validation',()=>{
 const k=(layer:string,t:number)=>({layer,prop:'position' as const,t});
 const sel=[k('a',30),k('a',0),k('a',10),k('a',20),k('b',5),k('b',6)];
 assert.deepEqual(nthKeys(sel,2).map(x=>x.layer+x.t).sort(),['a0','a20','b5']);
 assert.deepEqual(nthKeys(sel,2,1).map(x=>x.layer+x.t).sort(),['a10','a30','b6']);
 assert.throws(()=>nthKeys(sel,1));assert.throws(()=>nthKeys(sel,3,3));
});
import {distributeMoves} from './keyDistribute';
test('distribute: even spacing, ends stay, skips collisions, needs three keys',()=>{
 const d=applyEdits(base(),[{type:'prop.set',layer:'a',prop:'position',t:f(2),value:[1,1]},{type:'prop.set',layer:'a',prop:'position',t:f(3),value:[2,2]},{type:'prop.set',layer:'a',prop:'position',t:f(20),value:[3,3]}] as never);
 const c=findComp(d)!,k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 const r=distributeMoves(c,[k(0),k(2),k(3),k(20)]);
 assert.deepEqual(r.moves.map(m=>Math.round(m.to/f(1))),[7,13]);
 assert.equal(distributeMoves(c,[k(0),k(20)]).moves.length,0);
 assert.equal(distributeMoves(c,[k(0),k(10),k(20)]).moves.length,0);
});
import {toPlayheadDelta} from './keyToPlayhead';
test('to playhead: delta puts the earliest key on the playhead',()=>{
 const fps={num:30,den:1},k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 assert.equal(toPlayheadDelta([k(4),k(9)],f(10),fps),f(6));
 assert.equal(toPlayheadDelta([k(4)],f(4),fps),0);assert.equal(toPlayheadDelta([],f(3),fps),0);
});
import {keysAround} from './keyRange';
test('keysAround at: only keys exactly on the time',()=>{
 const c=findComp(base())!;
 assert.deepEqual(keysAround(c,['a'],f(10),'at').map(k=>k.t),[f(10)]);
 assert.equal(keysAround(c,['a'],f(5),'at').length,0);
});
import {valueEdits} from './keyValues';
test('smooth: moves toward neighbour average, ends use one neighbour, validates amount',()=>{
 const d=applyEdits(base(),[{type:'prop.set',layer:'a',prop:'position',t:f(5),value:[400,0]}] as never),c=findComp(d)!;
 const e=valueEdits(c,[{layer:'a',prop:'position',t:f(5)}],'smooth',100) as {value:number[]}[];
 assert.deepEqual(e[0].value,[150,75]);
 const h=valueEdits(c,[{layer:'a',prop:'position',t:f(5)}],'smooth',50) as {value:number[]}[];
 assert.deepEqual(h[0].value,[275,37.5]);
 assert.throws(()=>valueEdits(c,[{layer:'a',prop:'position',t:f(5)}],'smooth',0));
 assert.throws(()=>valueEdits(c,[{layer:'a',prop:'position',t:f(5)}],'smooth',101));
});
import {jitterTimeMoves} from './keyJitterTime';
test('jitter time: deterministic per seed, within bounds, whole frames, validated',()=>{
 const d=applyEdits(base(),[{type:'prop.set',layer:'a',prop:'position',t:f(30),value:[1,1]},{type:'prop.set',layer:'a',prop:'position',t:f(60),value:[2,2]}] as never),c=findComp(d)!;
 const refs=[10,30,60].map(n=>({layer:'a',prop:'position' as const,t:f(n)}));
 const a=jitterTimeMoves(c,refs,4,5),b=jitterTimeMoves(c,refs,4,5);
 assert.deepEqual(a,b);assert.ok(a.moves.length>0);
 for(const m of a.moves){const df=Math.abs(m.to-m.from)/f(1);assert.ok(df>=1&&df<=4&&Number.isInteger(Math.round(df)));}
 assert.throws(()=>jitterTimeMoves(c,refs,0));assert.throws(()=>jitterTimeMoves(c,refs,61));
});
import {wholeProperties} from './keyProperty';
test('whole property: all keys of each selected property only',()=>{
 const c=findComp(base())!;
 const r=wholeProperties(c,[{layer:'a',prop:'position',t:f(10)}]);
 assert.deepEqual(r.map(k=>k.t),[f(0),f(10)]);assert.ok(r.every(k=>k.prop==='position'));
 assert.equal(wholeProperties(c,[]).length,0);
});
import {thinKeys} from './keyThin';
test('thin: removes collinear selected keys, keeps ends, outliers and unselected',()=>{
 const d=applyEdits(base(),[{type:'prop.set',layer:'a',prop:'position',t:f(5),value:[150,75]},{type:'prop.set',layer:'a',prop:'position',t:f(3),value:[300,0]}] as never),c=findComp(d)!;
 const k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 assert.deepEqual(thinKeys(c,[k(0),k(3),k(5),k(10)],1).map(x=>x.t),[]);
 const d2=applyEdits(base(),[{type:'prop.set',layer:'a',prop:'position',t:f(5),value:[150,75]}] as never),c2=findComp(d2)!;
 assert.deepEqual(thinKeys(c2,[k(0),k(5),k(10)],1).map(x=>x.t),[f(5)]);
 assert.deepEqual(thinKeys(c2,[k(10)],1).map(x=>x.t),[]);
 assert.throws(()=>thinKeys(c2,[k(5)],0));
});
import {matchPreviousEdits} from './keyMatch';
test('match previous: copies predecessor value, skips first key and equal values, no cascade',()=>{
 const c=findComp(base())!,k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 const e=matchPreviousEdits(c,[k(0),k(10)]) as {t:number;value:number[]}[];
 assert.equal(e.length,1);assert.equal(e[0].t,f(10));assert.deepEqual(e[0].value,[100,100]);
 assert.equal(matchPreviousEdits(c,[k(0)]).length,0);
});
import {flattenEdits} from './keyFlatten';
test('flatten: later selected keys take the earliest selected value',()=>{
 const c=findComp(base())!,k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 const e=flattenEdits(c,[k(10),k(0)]) as {t:number;value:number[]}[];
 assert.equal(e.length,1);assert.equal(e[0].t,f(10));assert.deepEqual(e[0].value,[100,100]);
 assert.equal(flattenEdits(c,[k(0)]).length,0);
});
import {easeCopyEdits} from './keyEaseCopy';
test('ease copy: later selected keys take the earliest key ease, matching keys skipped',()=>{
 const d=applyEdits(base(),[{type:'keys.interp',keys:[{layer:'a',prop:'position',t:f(0)}],interp:'bezier',out:[0.3,2],in:[0.5,1]}] as never),c=findComp(d)!;
 const k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 const e=easeCopyEdits(c,[k(0),k(10)]) as {keys:{t:number}[];out:number[]}[];
 assert.equal(e.length,1);assert.deepEqual(e[0].keys.map(x=>x.t),[f(10)]);assert.deepEqual([...e[0].out],[0.3,2]);
 assert.equal(easeCopyEdits(c,[k(10)]).length,0);
});
import {rampEdits} from './keyRamp';
test('ramp: interior keys land on the line by time, ends untouched',()=>{
 const d=applyEdits(base(),[{type:'prop.set',layer:'a',prop:'position',t:f(5),value:[0,0]}] as never),c=findComp(d)!;
 const k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 const e=rampEdits(c,[k(10),k(0),k(5)]) as {t:number;value:number[]}[];
 assert.equal(e.length,1);assert.equal(e[0].t,f(5));assert.deepEqual(e[0].value,[150,75]);
 assert.equal(rampEdits(c,[k(0),k(10)]).length,0);
});
test('match next: copies successor value, last key has none',()=>{
 const c=findComp(base())!,k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 const e=matchPreviousEdits(c,[k(0),k(10)],'next') as {t:number;value:number[]}[];
 assert.equal(e.length,1);assert.equal(e[0].t,f(0));assert.deepEqual(e[0].value,[200,50]);
});
test('flatten average: all selected keys take the mean',()=>{
 const c=findComp(base())!,k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 const e=flattenEdits(c,[k(0),k(10)],'average') as {value:number[]}[];
 assert.equal(e.length,2);assert.deepEqual(e[0].value,[150,75]);assert.deepEqual(e[1].value,[150,75]);
});
import {peakKeys} from './keyPeaks';
test('peaks: interior local extremes only',()=>{
 const d=applyEdits(base(),[{type:'prop.set',layer:'a',prop:'position',t:f(5),value:[400,200]}] as never),c=findComp(d)!;
 assert.deepEqual(peakKeys(c,['a']).map(k=>k.t),[f(5)]);
 assert.equal(peakKeys(findComp(base())!,['a']).length,0);assert.equal(peakKeys(c,['zz']).length,0);
});
