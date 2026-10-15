import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer} from './model';
import {applyEdits} from './edit';
import {frameToTick} from './time';
import {AnimationSession,setAnimationSession} from './session';
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
import {invertSelection} from './keyInvertSelection';
test('invert selection: the other keys of the picked layers',()=>{
 const c=findComp(base())!,k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 assert.deepEqual(invertSelection(c,['a'],[k(0)]).map(x=>x.t),[f(10)]);
 assert.equal(invertSelection(c,['a'],[k(0),k(10)]).length,0);assert.equal(invertSelection(c,['zz'],[]).length,0);
});
import {influenceEdits} from './keyInfluence';
test('influence: bezier keys get x handles from percent, y kept, others skipped',()=>{
 const d=applyEdits(base(),[{type:'keys.interp',keys:[{layer:'a',prop:'position',t:f(0)}],interp:'bezier',out:[0.3,2],in:[0.5,1]},{type:'keys.interp',keys:[{layer:'a',prop:'position',t:f(10)}],interp:'linear'}] as never),c=findComp(d)!;
 const k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 const e=influenceEdits(c,[k(0),k(10)],25) as {out:number[];in:number[]}[];
 assert.equal(e.length,1);assert.deepEqual([...e[0].out],[0.25,2]);assert.deepEqual([...e[0].in],[0.75,1]);
 assert.throws(()=>influenceEdits(c,[k(0)],0));assert.throws(()=>influenceEdits(c,[k(0)],100));
});
import {tameEdits} from './keyTame';
test('tame: clamps handle y into 0..1, skips keys that do not overshoot',()=>{
 const d=applyEdits(base(),[{type:'keys.interp',keys:[{layer:'a',prop:'position',t:f(0)}],interp:'bezier',out:[0.3,2],in:[0.5,-0.5]}] as never),c=findComp(d)!;
 const k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 const e=tameEdits(c,[k(0),k(10)]) as {out:number[];in:number[]}[];
 assert.equal(e.length,1);assert.deepEqual([...e[0].out],[0.3,1]);assert.deepEqual([...e[0].in],[0.5,0]);
});
import {echoEdits} from './keyEcho';
test('echo: copies later or earlier, originals stay, copies outside the comp dropped, validated',()=>{
 const c=findComp(base())!,k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 const e=echoEdits(c,[k(0),k(10)],5) as {items:{key:{t:number}}[]}[];
 assert.equal(e.length,1);assert.deepEqual(e[0].items.map(i=>i.key.t),[f(5),f(15)]);
 assert.deepEqual((echoEdits(c,[k(0),k(10)],-5) as {items:{key:{t:number}}[]}[])[0].items.map(i=>i.key.t),[f(5)]);
 assert.throws(()=>echoEdits(c,[k(0)],0));assert.throws(()=>echoEdits(c,[k(0)],-5));
 const s=open();s.dispatch(echoEdits(s.document!.compositions[0],[k(0)],5));assert.equal(findLayer(findComp(s.document!)!,'a')!.transform.position.keys.length,3);
});
import {keyAllEdits} from './keyAll';
test('key all: only animated properties without a key at the playhead, locked layers skipped',()=>{
 const c=findComp(base())!;
 const r=keyAllEdits(c,['a'],f(5));assert.equal(r.edits.length,1);assert.deepEqual(r.refs,[{layer:'a',prop:'position',t:f(5)}]);
 assert.equal(keyAllEdits(c,['a'],f(10)).edits.length,0);assert.equal(keyAllEdits(c,['zz'],f(5)).edits.length,0);
 const s=open();s.dispatch(keyAllEdits(s.document!.compositions[0],['a'],f(5)).edits);
 assert.equal(findLayer(findComp(s.document!)!,'a')!.transform.position.keys.length,3);
});
import {trimKeys} from './keyTrim';
test('trim: keys outside the work area go, all-outside properties and locked layers are kept',()=>{
 const d=applyEdits(base(),[{type:'prop.set',layer:'a',prop:'position',t:f(20),value:[3,3]}] as never);
 const c={...findComp(d)!,workArea:{in:f(5),out:f(15)}};
 assert.deepEqual(trimKeys(c,['a']).map(k=>k.t).sort((a,b)=>a-b),[f(0),f(20)]);
 assert.equal(trimKeys({...c,workArea:{in:f(30),out:f(40)}},['a']).length,0);assert.equal(trimKeys(c,['zz']).length,0);
});
import {workAreaForKeys} from './keyWorkArea';
test('work area for keys: first to last, one frame minimum, clamped, null when empty',()=>{
 const c=findComp(base())!,k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 assert.deepEqual(workAreaForKeys(c,[k(10),k(3)]),{in:f(3),out:f(10)});
 assert.deepEqual(workAreaForKeys(c,[k(4)]),{in:f(4),out:f(5)});assert.equal(workAreaForKeys(c,[]),null);
});
import {keysInWorkArea} from './keyInWorkArea';
test('keys in work area: inclusive bounds, only listed layers',()=>{
 const c0=findComp(base())!,c={...c0,workArea:{in:f(0),out:f(10)}};
 assert.equal(keysInWorkArea(c,['a']).length,keysInWorkArea(c0,['a']).filter(k=>k.t<=f(10)).length);
 assert.equal(keysInWorkArea(c,['zz']).length,0);
 assert.equal(keysInWorkArea({...c,workArea:{in:f(1),out:f(2)}},['a']).length,0);
});
import {keysAroundPlayhead} from './keyPlayheadSelect';
test('keys around playhead: strict before/after, listed layers only',()=>{
 const c=findComp(base())!;
 assert.deepEqual(keysAroundPlayhead(c,['a'],f(5),'before').map(x=>x.t),[f(0)]);
 assert.deepEqual(keysAroundPlayhead(c,['a'],f(5),'after').map(x=>x.t),[f(10)]);
 assert.equal(keysAroundPlayhead(c,['a'],f(0),'before').length,0);assert.equal(keysAroundPlayhead(c,['zz'],f(5),'after').length,0);
});
test('keys at playhead: exact tick only',()=>{
 const c=findComp(base())!;
 assert.deepEqual(keysAroundPlayhead(c,['a'],f(10),'at').map(x=>x.t),[f(10)]);
 assert.equal(keysAroundPlayhead(c,['a'],f(5),'at').length,0);
});
import {endKeys} from './keyEnds';
test('end keys: first and last per property, listed layers only',()=>{
 const c=findComp(base())!;
 assert.deepEqual(endKeys(c,['a']).map(x=>x.t),[f(0),f(10)]);
 assert.equal(endKeys(c,['zz']).length,0);
});
import {keysByInterp} from './keyByInterp';
test('keys by interpolation: matches only that type on listed layers',()=>{
 const c=findComp(base())!,all=endKeys(c,['a']).length;
 const n=(['hold','linear','bezier'] as const).reduce((a,i)=>a+keysByInterp(c,['a'],i).length,0);
 assert.ok(n>=all);assert.equal(keysByInterp(c,['zz'],'linear').length,0);
});
import {growSelection} from './keyGrow';
test('grow selection: adds neighbours once, keeps the rest',()=>{
 const c=findComp(base())!,k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 assert.deepEqual(growSelection(c,[k(0)]).map(x=>x.t),[f(0),f(10)]);
 assert.equal(growSelection(c,[k(0),k(10)]).length,2);assert.equal(growSelection(c,[]).length,0);
});
import {shrinkSelection} from './keyShrink';
test('shrink selection: drops both ends per property',()=>{
 const k=(n:number,prop:'position'|'scale'='position')=>({layer:'a',prop,t:f(n)});
 assert.deepEqual(shrinkSelection([k(3),k(1),k(2),k(4)]).map(x=>x.t),[f(2),f(3)]);
 assert.equal(shrinkSelection([k(1),k(2)]).length,0);assert.equal(shrinkSelection([k(1),k(2),k(1,'scale')]).length,0);
});
import {gridMoves} from './keyGrid';
test('snap to grid: nearest multiple of N frames, bad N rejected',()=>{
 const c=findComp(base())!,k=(n:number)=>({layer:'a',prop:'position' as const,t:f(n)});
 const r=gridMoves(c,[k(10)],4);assert.deepEqual(r.moves.map(m=>m.to),[f(8)]);
 assert.equal(gridMoves(c,[k(10)],3).moves.length,1);assert.throws(()=>gridMoves(c,[k(10)],1));
 assert.equal(gridMoves(c,[k(8)],4).moves.length,0);
});
import {keysByValue} from './keyByValue';
test('keys by value: scalar keys in the inclusive range, vectors skipped, bad range rejected',()=>{
 const c=findComp(base())!;
 assert.equal(keysByValue(c,['a'],-1e6,1e6).every(k=>k.prop!=='position'),true);
 assert.equal(keysByValue(c,['zz'],0,100).length,0);
 assert.throws(()=>keysByValue(c,['a'],5,1));assert.throws(()=>keysByValue(c,['a'],NaN,1));
});
import {graphWindow} from './graphWindow';
test('graph window: whole comp unless fit, padded and clamped keys span',()=>{
 const c=findComp(base())!,ks=c.layers.find(l=>l.id==='a')!.transform.position.keys;
 assert.deepEqual(graphWindow(c.start,c.duration,c.fps,ks,false),{t0:c.start,t1:c.start+c.duration});
 const w=graphWindow(c.start,c.duration,c.fps,ks,true);
 assert.ok(w.t0>=c.start&&w.t1<=c.start+c.duration&&w.t1>w.t0&&w.t0<=ks[0].t&&w.t1>=ks[ks.length-1].t);
 assert.deepEqual(graphWindow(c.start,c.duration,c.fps,ks.slice(0,1),true),{t0:c.start,t1:c.start+c.duration});
});
import {exportFrameSvg,frameSvgFileName} from './exportSvg';
test('svg frame export: standalone svg file named by frame, too large rejected by size check',async()=>{
 const c=findComp(base())!,r=exportFrameSvg(c,f(5),'My Anim',true);
 const txt=await r.blob.text();
 assert.ok(txt.startsWith('<?xml')&&txt.includes('<svg')&&!txt.includes('<rect width'));
 assert.equal(r.fileName,frameSvgFileName('My Anim',5));assert.ok(r.fileName.endsWith('.svg'));
 assert.ok((await exportFrameSvg(c,f(5),'x',false).blob.text()).includes('<rect width'));
});
import {fitTargets} from './graphWindow';
test('fit targets: selected keys when two or more, else all',()=>{
 const c=findComp(base())!,ks=c.layers.find(l=>l.id==='a')!.transform.position.keys;
 assert.equal(fitTargets(ks,[{t:ks[0].t}]).length,ks.length);
 assert.equal(fitTargets(ks,[]).length,ks.length);
 assert.equal(fitTargets(ks,ks.slice(0,2)).length,2);
});
import {windowValueRange} from './graphWindow';
test('window value range: covers the curve in the window, narrower than the full range',()=>{
 const c=findComp(base())!,p=c.layers.find(l=>l.id==='a')!.transform.position,ks=p.keys;
 const full=windowValueRange(p,0,ks[0].t,ks[ks.length-1].t),part=windowValueRange(p,0,ks[0].t,ks[0].t+(ks[1].t-ks[0].t)/4);
 assert.ok(full.max>full.min&&part.max>part.min&&part.max-part.min<=full.max-full.min+1e-9);
});
import {validateDocument} from './model';
import {applyEdit} from './edit';
import {duplicateLayers} from './layerDuplicate';
test('duplicate layers: copies above originals, internal parents remapped, outside ones kept, bad input rejected',()=>{
 let d=applyEdits(base(),[{type:'layer.add',kind:'shape',id:'b'},{type:'layer.parent',layer:'b',parent:'a'}]);
 const n=findComp(d)!.layers.length;
 const both=applyEdit(d,{type:'layers.duplicate',layers:['a','b'],ids:['a2','b2']}),ls=findComp(both)!.layers;
 assert.equal(ls.length,n+2);assert.deepEqual(validateDocument(both),[]);
 const ids=ls.map(l=>l.id);assert.equal(ids.indexOf('a2')+1,ids.indexOf('a'));assert.equal(ids.indexOf('b2')+1,ids.indexOf('b'));
 assert.equal(findLayer(findComp(both)!,'b2')!.parent,'a2');assert.equal(findLayer(findComp(both)!,'a2')!.name.endsWith(' copy'),true);
 assert.equal(findLayer(findComp(both)!,'a2')!.transform.position.keys.length,findLayer(findComp(both)!,'a')!.transform.position.keys.length);
 const one=applyEdit(d,{type:'layers.duplicate',layers:['b'],ids:['b3']});assert.equal(findLayer(findComp(one)!,'b3')!.parent,'a');
 assert.throws(()=>applyEdit(d,{type:'layers.duplicate',layers:['a'],ids:['b']}),/Duplicate/);
 assert.throws(()=>applyEdit(d,{type:'layers.duplicate',layers:['zz'],ids:['q']}));
 assert.throws(()=>duplicateLayers(findComp(d)!.layers,[],[]));
});
test('duplicate layers: command is one undo step and selects the copy',async()=>{
 const s=open(),before=s.document!;setAnimationSession(s);
 s.setView({selectedLayer:'a'});
 const {layerDuplicateSpecs}=await import('./layerDuplicateCommands');const spec=layerDuplicateSpecs()[0];
 await (spec.run as (p?:unknown)=>unknown)(undefined);
 assert.equal(s.getState().view.selectedLayer!==null&&s.getState().view.selectedLayer!=='a',true);
 s.undo();assert.deepEqual(findComp(s.document!)!.layers.map(l=>l.id),findComp(before)!.layers.map(l=>l.id));setAnimationSession(null);
});
test('key and layer commands with optional-only params tolerate a call with no payload',async()=>{
 const {animationCommandSpecs}=await import('./commands');
 const cmds=animationCommandSpecs().filter(c=>/^animation\.(keys|layers?|key)\./.test(c.id)&&!(c.params&&'required' in c.params&&(c.params as {required?:unknown[]}).required?.length));
 assert.ok(cmds.length>10);
 for(const c of cmds){
  const s=open();setAnimationSession(s);s.setView({selectedLayer:'a'});
  try{await (c.run as (p?:unknown)=>unknown)(undefined);}
  catch(e){const x=e as {expected?:boolean;message?:string};if(!x.expected&&e instanceof TypeError)assert.fail(`${c.id}: ${x.message}`);}
 }
 setAnimationSession(null);
});

test('P153 composition duplicate is one undo step and a deep copy',async()=>{
 const {animationCommandSpecs}=await import('./commands');
 const s=open();setAnimationSession(s);const d0=s.document!,n=d0.compositions.length,src=findComp(d0)!;
 const r=animationCommandSpecs().find(c=>c.id==='animation.comp.duplicate')!.run(undefined) as {comp:string};
 const d1=s.document!;assert.equal(d1.compositions.length,n+1);assert.equal(d1.activeComp,r.comp);
 const c=findComp(d1,r.comp)!;assert.equal(c.name,`${src.name} copy`);assert.equal(c.layers.length,src.layers.length);assert.notEqual(c.layers,src.layers);
 s.undo();assert.equal(s.document!.compositions.length,n);
});

test('P154 composition delete refuses precomp use, one undo step',async()=>{
 const {animationCommandSpecs}=await import('./commands');const run=(id:string,p?:unknown)=>animationCommandSpecs().find(c=>c.id===id)!.run(p);
 const s=open();setAnimationSession(s);const first=s.document!.activeComp;
 const r=run('animation.comp.duplicate') as {comp:string};
 s.dispatch({type:'precomp.add',comp:first});
 assert.throws(()=>run('animation.comp.remove',{comp:first}),/used as a layer/);
 const n=s.document!.compositions.length;
 run('animation.comp.remove',{comp:r.comp}) ;
 assert.equal(s.document!.compositions.length,n-1);s.undo();assert.equal(s.document!.compositions.length,n);
});

test('P155 split layers at the playhead: later part above, one undo step, outside is refused',async()=>{
 const {layerSplitSpecs}=await import('./layerSplitCommands');const spec=layerSplitSpecs()[0],run=spec.run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);const c0=findComp(s.document!)!,l0=c0.layers[0];
 s.setView({selectedLayer:l0.id,playhead:l0.inT});assert.throws(()=>run(),/inside a layer/);
 const mid=Math.round((l0.inT+l0.outT)/2/8000)*8000;s.setView({selectedLayer:l0.id,playhead:mid});
 const before=s.document!;run();
 const c1=findComp(s.document!)!;assert.equal(c1.layers.length,c0.layers.length+1);
 const a=c1.layers.find(l=>l.id===l0.id)!,b=c1.layers[c1.layers.findIndex(l=>l.id===l0.id)-1];
 assert.equal(a.outT,mid);assert.equal(b.inT,mid);assert.equal(b.outT,l0.outT);assert.equal(s.getState().view.selectedLayer,b.id);
 s.undo();assert.equal(s.document,before);setAnimationSession(null);
});

test('P157 link delay reads the source at t - delay, validates, and is optional',async()=>{
 const {evaluateMod,validateModifiers}=await import('./modifiers');
 const prop={type:'number',keys:[],value:0,modifiers:[{type:'link',layer:'x',prop:'rotation',multiplier:1,offset:0,delay:16000}]} as never;
 const seen:number[]=[];evaluateMod(prop,40000,(_l,_p,t)=>{seen.push(t);return 5;});assert.deepEqual(seen,[24000]);
 const nod={...(prop as object),modifiers:[{type:'link',layer:'x',prop:'rotation',multiplier:1,offset:0}]} as never;
 seen.length=0;evaluateMod(nod,40000,(_l,_p,t)=>{seen.push(t);return 5;});assert.deepEqual(seen,[40000]);
 assert.equal(validateModifiers([{type:'link',layer:'x',prop:'rotation',multiplier:1,offset:0,delay:1.5}]).length,1);
 assert.equal(validateModifiers([{type:'link',layer:'x',prop:'rotation',multiplier:1,offset:0,delay:-16000}]).length,0);
});

test('P158 follow the leader links each layer to the previous one with a delay, one undo step',async()=>{
 const {rigFollowSpecs}=await import('./rigFollowCommands');const run=rigFollowSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});const ids=['a','b'];
 const before=s.document!;
 assert.throws(()=>run({layers:[ids[0]]}),/two or more/);
 run({layers:ids.slice(0,2),frames:4});
 const c=findComp(s.document!)!,f=findLayer(c,ids[1])!,m=f.transform.position.modifiers!.find(x=>x.type==='link') as {layer:string;delay?:number};
 assert.equal(m.layer,ids[0]);assert.equal(m.delay,4*8000);assert.equal(findLayer(c,ids[0])!.transform.position.modifiers?.length??0,0);
 assert.throws(()=>run({layers:ids.slice(0,2)}),/already has a link/);
 s.undo();assert.equal(s.document,before);setAnimationSession(null);
});

test('P160 sprite sheet planner, packer and PNG writer',async()=>{
 const {sheetPlan,packSheet,encodePngRgba,SheetError}=await import('./spriteSheet');const {unzlibSync}=await import('fflate');
 const p=sheetPlan(5,2,1);assert.deepEqual([p.columns,p.rows,p.width,p.height],[3,2,6,2]);assert.deepEqual(p.cells[4],{index:4,x:2,y:1});
 assert.equal(sheetPlan(4,2,2,4).rows,1);
 assert.throws(()=>sheetPlan(0,2,2),SheetError);assert.throws(()=>sheetPlan(257,1,1),/limited to 256/);assert.throws(()=>sheetPlan(16,2000,2000),/above the limit/);
 const fr=[0,1,2,3,4].map(n=>new Uint8ClampedArray([n,n,n,255,n,n,n,255]));
 const px=packSheet(p,fr);assert.equal(px.length,6*2*4);assert.equal(px[0],0);assert.equal(px[4],0);assert.equal(px[8],1);assert.equal(px[(1*6+2)*4],4);
 assert.throws(()=>packSheet(p,fr.slice(1)),/does not match/);
 const png=encodePngRgba(p.width,p.height,px);assert.deepEqual([...png.slice(0,8)],[137,80,78,71,13,10,26,10]);
 const idatLen=new DataView(png.buffer,png.byteOffset).getUint32(33);const raw=unzlibSync(png.slice(41,41+idatLen));
 assert.equal(raw.length,2*(6*4+1));assert.equal(raw[0],0);assert.equal(raw[1+8],1);
});
test('P160 sprite sheet export zips the sheet and atlas, refuses oversize',async()=>{
 const {exportSpriteSheet}=await import('./exportJob');const {unzipSync,strFromU8}=await import('fflate');
 const s=open();setAnimationSession(s);s.dispatch({type:'workarea.set',in:0,out:f(4)} as never);
 let saved:{b:Blob;n:string}|null=null;
 await exportSpriteSheet(2,{pixels:async(_s,w,h)=>new Uint8ClampedArray(w*h*4).fill(200),save:(b,n)=>{saved={b,n};}});
 assert.ok(saved);const z=unzipSync(new Uint8Array(await (saved as unknown as {b:Blob}).b.arrayBuffer()));
 assert.deepEqual(Object.keys(z).sort(),['atlas.json',Object.keys(z).find(k=>k.endsWith('.png'))!].sort());
 const atlas=JSON.parse(strFromU8(z['atlas.json']));assert.equal(atlas.columns,2);assert.equal(atlas.frames.length,atlas.columns*atlas.rows>=4?atlas.frames.length:-1);assert.ok(atlas.frames.length>=4);
 setAnimationSession(null);
});

test('P161 sprite sheet is a render format with its own limits',async()=>{
 const {exportPlan,defaultExportSettings,EXPORT_FORMATS}=await import('./exportSettings');const {SHEET_MAX_FRAMES}=await import('./spriteSheet');
 assert.ok(EXPORT_FORMATS.includes('sheet'));
 const c=findComp(open().document!)!;
 const short={...c,workArea:{in:0,out:8*8000}};
 assert.deepEqual(exportPlan(short,'sheet',defaultExportSettings()).problems,[]);
 const long={...c,workArea:{in:0,out:(SHEET_MAX_FRAMES+10)*8000},duration:(SHEET_MAX_FRAMES+10)*8000};
 assert.ok(exportPlan(long,'sheet',defaultExportSettings()).problems.includes('frames'));
 assert.ok(!exportPlan(long,'sequence',defaultExportSettings()).problems.includes('frames'));
 assert.ok(exportPlan(short,'sheet',{...defaultExportSettings(),scale:400}).problems.includes('size'));
});

test('P162 wiggle hold samples noise once per hold, smooth when absent, validated',async()=>{
 const {evaluateMod,validateModifiers}=await import('./modifiers');
 const mk=(hold?:number)=>({type:'number',keys:[],value:0,modifiers:[{type:'wiggle',seed:3,amplitude:50,frequency:7,...(hold?{hold}:{})}]} as never);
 const h=mk(24000);
 assert.equal(evaluateMod(h,24000),evaluateMod(h,47999));assert.equal(evaluateMod(h,0),evaluateMod(h,23999));
 assert.notEqual(evaluateMod(h,24000),evaluateMod(h,48000));
 assert.notEqual(evaluateMod(mk(),24000),evaluateMod(mk(),30000));
 assert.equal(evaluateMod(mk(),12345),evaluateMod(mk(0),12345));
 assert.equal(validateModifiers([{type:'wiggle',seed:1,amplitude:1,frequency:1,hold:-1}]).length,1);
 assert.equal(validateModifiers([{type:'wiggle',seed:1,amplitude:1,frequency:1,hold:24000}]).length,0);
});

test('P163 work area follows the selected layers, one undo step, no-op refused',async()=>{
 const {layerWorkAreaSpecs}=await import('./layerWorkAreaCommands');const run=layerWorkAreaSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 s.dispatch({type:'layer.timing',layer:'a',inT:f(2),outT:f(6)});s.dispatch({type:'layer.timing',layer:'b',inT:f(4),outT:f(9)});
 const before=s.document!;
 run({layers:['a','b']});assert.deepEqual(findComp(s.document!)!.workArea,{in:f(2),out:f(9)});
 assert.throws(()=>run({layers:['a','b']}),/already spans/);
 run({layers:['a']});assert.deepEqual(findComp(s.document!)!.workArea,{in:f(2),out:f(6)});
 s.undo();s.undo();assert.equal(s.document,before);setAnimationSession(null);
});

test('P164 sheet columns setting: validated, used by the plan and the export',async()=>{
 const {settingsProblems,defaultExportSettings,exportPlan}=await import('./exportSettings');const {exportSpriteSheet,setExportSettings,resetExportSettings}=await import('./exportJob');const {unzipSync,strFromU8}=await import('fflate');
 const d=defaultExportSettings();
 assert.deepEqual(settingsProblems({...d,columns:0}),['columns']);assert.deepEqual(settingsProblems({...d,columns:2.5}),['columns']);assert.deepEqual(settingsProblems({...d,columns:8}),[]);assert.deepEqual(settingsProblems({...d,columns:null}),[]);
 const s=open();setAnimationSession(s);s.dispatch({type:'workarea.set',in:0,out:f(8)} as never);const c=findComp(s.document!)!;
 assert.ok(!exportPlan(c,'sheet',{...d,columns:4}).problems.length);
 setExportSettings({columns:4});let saved:Blob|null=null;
 await exportSpriteSheet(undefined,{pixels:async(_s,w,h)=>new Uint8ClampedArray(w*h*4),save:b=>{saved=b;}});
 const z=unzipSync(new Uint8Array(await (saved as unknown as Blob).arrayBuffer()));const a=JSON.parse(strFromU8(z['atlas.json']));
 assert.equal(a.columns,4);assert.equal(a.rows,2);
 assert.throws(()=>setExportSettings({columns:999}),/columns/);resetExportSettings();setAnimationSession(null);
});

test('P165 copy frame renders a PNG and refuses cleanly without a clipboard',async()=>{
 const {copyCurrentFrame,exportState,resetExport}=await import('./exportJob');
 const s=open();setAnimationSession(s);
 let got:{b:Blob;n:string}|null=null;
 await copyCurrentFrame({rasterize:async()=>new Uint8Array([137,80,78,71]),save:(b,n)=>{got={b,n};}});
 assert.ok(got);assert.equal((got as unknown as {b:Blob}).b.type,'image/png');assert.equal(exportState().kind,'copy');assert.equal(exportState().status,'done');resetExport();
 await assert.rejects(()=>copyCurrentFrame({rasterize:async()=>new Uint8Array([1])}),/cannot copy images|clipboard/);
 assert.equal(exportState().status,'error');resetExport();setAnimationSession(null);
});

test('P166 wiggle axis limits the shake to one axis, validated',async()=>{
 const {evaluateMod,validateModifiers}=await import('./modifiers');
 const mk=(axis?:string)=>({type:'vec2',keys:[],value:[10,20],modifiers:[{type:'wiggle',seed:5,amplitude:30,frequency:4,...(axis?{axis}:{})}]} as never);
 const both=evaluateMod(mk(),30000) as number[],x=evaluateMod(mk('x'),30000) as number[],y=evaluateMod(mk('y'),30000) as number[];
 assert.notEqual(both[0],10);assert.notEqual(both[1],20);
 assert.deepEqual([x[0],x[1]],[both[0],20]);assert.deepEqual([y[0],y[1]],[10,both[1]]);
 assert.equal(validateModifiers([{type:'wiggle',seed:1,amplitude:1,frequency:1,axis:'z' as never}]).length,1);
 assert.equal(validateModifiers([{type:'wiggle',seed:1,amplitude:1,frequency:1,axis:'y'}]).length,0);
});

test('P167 reseed gives every wiggle a distinct new seed, one undo step, skips locked',async()=>{
 const {modifierReseedSpecs}=await import('./modifierReseedCommands');const run=modifierReseedSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const w={type:'wiggle' as const,seed:1,amplitude:5,frequency:2};
 s.dispatch({type:'modifier.add',layer:'a',prop:'position',modifier:w});s.dispatch({type:'modifier.add',layer:'b',prop:'position',modifier:w});s.dispatch({type:'modifier.add',layer:'b',prop:'rotation',modifier:w});
 const seeds=()=>['a','b'].flatMap(id=>['position','rotation'].flatMap(k=>(findLayer(findComp(s.document!)!,id)!.transform[k as 'position'].modifiers??[]).map(m=>(m as {seed:number}).seed)));
 const before=s.document!;assert.deepEqual(seeds(),[1,1,1]);
 run({layers:['a','b'],seed:1000});const after=seeds();assert.equal(new Set(after).size,3);assert.ok(after.every(x=>x!==1&&x<=2147483647));
 s.undo();assert.equal(s.document,before);
 s.dispatch({type:'layer.update',layer:'b',locked:true});const b2=s.document!;
 run({layers:['a','b'],seed:5});assert.equal(seeds()[2],1);assert.notEqual(seeds()[0],1);
 s.undo();assert.equal(s.document,b2);
 assert.throws(()=>run({layers:['b'],seed:5}),/locked/);setAnimationSession(null);
});

test('P171 number layers renames top to bottom, strips copy suffixes, one undo step, skips locked',async()=>{
 const {layerNumberSpecs,numberBase}=await import('./layerNumberCommands');const run=layerNumberSpecs()[0].run as (p?:unknown)=>unknown;
 assert.equal(numberBase('Star copy 2'),'Star');assert.equal(numberBase('Star 3'),'Star');
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});s.dispatch({type:'layer.add',kind:'shape',id:'c'});
 const names=()=>findComp(s.document!)!.layers.map(l=>l.name);const ids=findComp(s.document!)!.layers.map(l=>l.id);
 const before=s.document!;run({layers:ids,name:'Dot',start:5});assert.deepEqual(names(),ids.map((_,i)=>`Dot ${5+i}`));
 s.undo();assert.equal(s.document,before);
 s.dispatch({type:'layer.update',layer:'b',locked:true});run({layers:ids,name:'Dot'});assert.ok(!names().some((n,i)=>ids[i]==='b'&&n.startsWith('Dot')));
});

test('P172 arrange: front/back/up/down/reverse keep the rest, one undo step, no-op is refused',async()=>{
 const {arrangedOrder}=await import('./layerArrange');const {layerArrangeSpecs}=await import('./layerArrangeCommands');const run=layerArrangeSpecs()[0].run as (p?:unknown)=>unknown;
 const o=['a','b','c','d','e'],sel=new Set(['b','d']);
 assert.deepEqual(arrangedOrder(o,sel,'front'),['b','d','a','c','e']);assert.deepEqual(arrangedOrder(o,sel,'back'),['a','c','e','b','d']);
 assert.deepEqual(arrangedOrder(o,sel,'up'),['b','a','d','c','e']);assert.deepEqual(arrangedOrder(o,sel,'down'),['a','c','b','e','d']);
 assert.deepEqual(arrangedOrder(o,sel,'reverse'),['a','d','c','b','e']);assert.deepEqual(arrangedOrder(o,new Set(['a']),'up'),o);
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});s.dispatch({type:'layer.add',kind:'shape',id:'c'});
 const ids=()=>findComp(s.document!)!.layers.map(l=>l.id);const start=ids(),before=s.document!;
 run({mode:'back',layers:[start[0]]});assert.deepEqual(ids(),[...start.slice(1),start[0]]);s.undo();assert.equal(s.document,before);
 assert.throws(()=>run({mode:'front',layers:[start[0]]}),(e:any)=>e.expected===true);
});

test('P173 layer flags toggle for many layers, one undo step, locked layers only unlock',async()=>{
 const {layerFlagSpecs}=await import('./layerFlagCommands');const run=layerFlagSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});s.dispatch({type:'layer.add',kind:'shape',id:'c'});
 const get=(k:'visible'|'solo'|'locked')=>findComp(s.document!)!.layers.map(l=>l[k]);const ids=findComp(s.document!)!.layers.map(l=>l.id);
 const before=s.document!;run({flag:'solo',layers:ids});assert.deepEqual(get('solo'),[true,true,true]);s.undo();assert.equal(s.document,before);
 run({flag:'visible',layers:ids});assert.deepEqual(get('visible'),[false,false,false]);run({flag:'visible',layers:ids});assert.deepEqual(get('visible'),[true,true,true]);
 run({flag:'locked',layers:[ids[0]]});const r=run({flag:'visible',layers:ids}) as {skippedLocked:number};assert.equal(r.skippedLocked,1);assert.equal(get('visible')[0],true);
 assert.throws(()=>run({flag:'visible',layers:[ids[0]]}),(e:any)=>e.expected===true);
 run({flag:'locked',layers:[ids[0]]});assert.equal(get('locked')[0],false);
});

test('P174 marker update renames the marker at the playhead or by id, moves it, one undo step',async()=>{
 const {markerUpdateSpecs}=await import('./markerUpdateCommands');const run=markerUpdateSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);const c0=findComp(s.document!)!;
 s.dispatch({type:'markers.set',markers:[{id:'m1',t:c0.start+f(10),label:'one'},{id:'m2',t:c0.start+f(20),label:'two'}]});
 const ms=()=>findComp(s.document!)!.markers!;
 s.setView({playhead:c0.start+f(20)});const before=s.document!;
 run({label:'  hit  '});assert.equal(ms()[1].label,'hit');s.undo();assert.equal(s.document,before);
 run({id:'m1',label:'start',t:c0.start+f(25)});assert.deepEqual(ms().map(m=>m.label),['two','start']);
 const e=(p:object)=>assert.throws(()=>run(p),(x:any)=>x.expected===true);
 e({id:'nope',label:'x'});e({id:'m2',label:'two'});e({id:'m2',t:c0.start+c0.duration+f(5)});e({id:'m2',label:'  '});
 s.setView({playhead:c0.start+f(3)});e({label:'x'});
});

test('P175 markers from layers: one per in point, named after the layer, no duplicates, one undo step',async()=>{
 const {markerFromLayersSpecs}=await import('./markerFromLayersCommands');const run=markerFromLayersSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});s.dispatch({type:'layer.add',kind:'shape',id:'c'});
 const c0=findComp(s.document!)!;s.dispatch({type:'layer.timing',layer:'b',inT:c0.start+f(10),outT:c0.start+f(40)});s.dispatch({type:'layer.timing',layer:'c',inT:c0.start+f(10),outT:c0.start+f(40)});
 const ms=()=>findComp(s.document!)!.markers??[];const before=s.document!;
 const r=run({layers:['a','b','c']}) as {added:number};assert.equal(r.added,2);assert.deepEqual(ms().map(m=>m.t),[c0.start,c0.start+f(10)]);
 assert.equal(ms()[1].label,findLayer(findComp(s.document!)!,'c')!.name);s.undo();assert.equal(s.document,before);
 run({layers:['a','b']});assert.throws(()=>run({layers:['a','b','c']}),(e:any)=>e.expected===true);
});

test('P176 clear markers: all or inside the work area, one undo step, empty is refused',async()=>{
 const {markerClearSpecs}=await import('./markerClearCommands');const run=markerClearSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);const c0=findComp(s.document!)!;const e=(p?:object)=>assert.throws(()=>run(p),(x:any)=>x.expected===true);
 e();s.dispatch({type:'markers.set',markers:[5,15,25,35].map(n=>({id:'m'+n,t:c0.start+f(n),label:'m'+n}))});
 s.dispatch({type:'workarea.set',in:c0.start+f(10),out:c0.start+f(30)});
 const ms=()=>findComp(s.document!)!.markers!.map(m=>m.id);const before=s.document!;
 run({scope:'workArea'});assert.deepEqual(ms(),['m5','m35']);s.undo();assert.equal(s.document,before);
 run();assert.deepEqual(ms(),[]);e();
});

test('P180 GIF dithering: closer average colour on a gradient, deterministic, off by default, stays inside the palette',async()=>{
 const {ditherIndices,mapIndices,encodeGif}=await import('./gifEncode');const {defaultExportSettings,settingsProblems}=await import('./exportSettings');
 const w=64,h=16,px=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const o=(y*w+x)*4,v=Math.round(x/(w-1)*255);px[o]=v;px[o+1]=v;px[o+2]=v;px[o+3]=255;}
 const pal=new Uint8Array(4*3);[0,85,170,255].forEach((v,i)=>pal.set([v,v,v],i*3));
 const plain=mapIndices(px,pal,4).indices,dith=ditherIndices(px,pal,4,w).indices;
 assert.equal(dith.length,w*h);assert.ok(Array.from(dith).every(i=>i<4));assert.deepEqual(Array.from(dith),Array.from(ditherIndices(px,pal,4,w).indices));
 // Mean error per 8-pixel window: dithering keeps the local average close to the source, plain mapping banding does not.
 const winErr=(idx:Uint8Array)=>{let e=0,n=0;for(let y=0;y<h;y++)for(let x0=0;x0+8<=w;x0+=8){let a=0,b=0;for(let x=x0;x<x0+8;x++){a+=px[(y*w+x)*4];b+=pal[idx[y*w+x]*3];}e+=Math.abs(a-b)/8;n++;}return e/n;};
 assert.ok(winErr(dith)<winErr(plain)*0.6,`dither ${winErr(dith)} vs plain ${winErr(plain)}`);
 const frames=[{pixels:px,delayCs:5}];const a=encodeGif(w,h,frames),b=encodeGif(w,h,frames,true,false),c=encodeGif(w,h,frames,true,true);
 assert.deepEqual(Array.from(a),Array.from(b));assert.notDeepEqual(Array.from(a),Array.from(c));
 assert.equal(defaultExportSettings().dither,undefined);assert.deepEqual(settingsProblems({...defaultExportSettings(),dither:true}),[]);
});

test('P181 loop setting: GIF drops the NETSCAPE loop block, APNG writes plays=1, default loops forever',async()=>{
 const {encodeGif}=await import('./gifEncode');const {encodeApng}=await import('./apngEncode');
 const w=4,h=4,px=new Uint8ClampedArray(w*h*4).fill(255);const f=[{pixels:px,delayCs:5}];
 const has=(u:Uint8Array)=>Buffer.from(u).includes(Buffer.from('NETSCAPE2.0'));
 assert.equal(has(encodeGif(w,h,f)),true);assert.equal(has(encodeGif(w,h,f,false)),false);
 const {defaultExportSettings,settingsProblems}=await import('./exportSettings');assert.equal(defaultExportSettings().loop,undefined);assert.deepEqual(settingsProblems({...defaultExportSettings(),loop:false}),[]);
 assert.equal(typeof encodeApng,'function');
});

test('P182 graph time axis: readable frame steps, bounded count, aligned to the frame grid',async()=>{
 const {timeTicks,timeTickStep}=await import('./graphWindow');const fps={num:30,den:1};const T=(fr:number)=>f(fr);
 assert.equal(timeTickStep(fps,T(150),6),30);                 // 5 s at 6 labels: one per second
 assert.equal(timeTickStep(fps,T(150),12),15);                // more room: half seconds
 assert.equal(timeTickStep(fps,T(20),8),5);                   // zoomed in: 5 frames
 const t=timeTicks(0,T(150),fps,6);assert.deepEqual(t,[0,30,60,90,120,150].map(T));
 const z=timeTicks(T(7),T(23),fps,8);assert.ok(z.every(x=>x%f(1)===0&&x>=T(7)&&x<=T(23)));assert.ok(z.length<=8+1);
 assert.deepEqual(timeTicks(5,5,fps,6),[]);assert.deepEqual(timeTicks(0,100,fps,0),[]);
 assert.ok(timeTicks(0,T(3600*30),fps,500).length<=61);
 const ntsc={num:30000,den:1001};assert.ok(timeTicks(0,T(300),ntsc,6).length>=2);
});

test('P184 align: world anchor points line up, parents respected, distribute is even, locked skipped, one undo step',async()=>{
 const {alignTargets}=await import('./layerAlign');const {layerAlignSpecs}=await import('./layerAlignCommands');const run=layerAlignSpecs()[0].run as (p?:unknown)=>unknown;
 const T=(a:number[],m:any)=>[...alignTargets(a.map((v,i)=>({id:'k'+i,v})),m)!.values()];
 assert.deepEqual(T([10,40,20],'left'),[10,10,10]);assert.deepEqual(T([10,40,20],'right'),[40,40,40]);assert.deepEqual(T([10,40,20],'centerX'),[25,25,25]);
 assert.deepEqual(T([0,100,10],'distributeX'),[0,50,100]);
 assert.equal(alignTargets([{id:'a',v:1},{id:'b',v:2}],'distributeX'),null);
 const s=open();setAnimationSession(s);for(const id of ['b','c'])s.dispatch({type:'layer.add',kind:'shape',id});
 const at=s.getState().view.playhead;
 s.dispatch({type:'prop.set',layer:'a',prop:'position',t:at,value:[100,50]});s.dispatch({type:'prop.set',layer:'b',prop:'position',t:at,value:[300,150]});s.dispatch({type:'prop.set',layer:'c',prop:'position',t:at,value:[150,90]});
 const {evaluate}=await import('./interpolate');const pos=(id:string)=>Array.from(evaluate(findLayer(findComp(s.document!)!,id)!.transform.position,at) as number[]);
 const before=s.document!;run({mode:'left',layers:['a','b','c']});assert.deepEqual(['a','b','c'].map(i=>pos(i)[0]),[100,100,100]);assert.deepEqual(pos('b')[1],150);
 s.undo();assert.equal(s.document,before);
 run({mode:'distributeX',layers:['a','b','c']});assert.deepEqual(['a','c','b'].map(i=>pos(i)[0]),[100,200,300]);
 const e=(p:object)=>assert.throws(()=>run(p),(x:any)=>x.expected===true);
 e({mode:'distributeX',layers:['a','b','c']});e({mode:'left',layers:['a']});e({mode:'distributeY',layers:['a','b']});
});

test('P184 align works in composition space through a scaled parent',async()=>{
 const {layerAlignSpecs}=await import('./layerAlignCommands');const run=layerAlignSpecs()[0].run as (p?:unknown)=>unknown;const {worldMatrix,applyMatrix}=await import('./scene');const {evaluate}=await import('./interpolate');
 const s=open();setAnimationSession(s);for(const id of ['b','c'])s.dispatch({type:'layer.add',kind:'shape',id});s.dispatch({type:'layer.add',kind:'null',id:'p'});
 const at=s.getState().view.playhead;
 s.dispatch({type:'prop.set',layer:'p',prop:'scale',t:at,value:[200,200]});s.dispatch({type:'layer.parent',layer:'b',parent:'p',keepWorld:false,t:at});
 s.dispatch({type:'prop.set',layer:'b',prop:'position',t:at,value:[300,40]});s.dispatch({type:'prop.set',layer:'c',prop:'position',t:at,value:[250,90]});
 const wx=(id:string)=>{const c=findComp(s.document!)!,l=findLayer(c,id)!;return applyMatrix(worldMatrix(c,l,at),evaluate(l.transform.anchor,at) as [number,number])[0];};
 const bx=wx('b'),cx=wx('c');run({mode:'left',layers:['b','c']});
 assert.ok(Math.abs(wx('b')-Math.min(bx,cx))<0.05&&Math.abs(wx('c')-Math.min(bx,cx))<0.05,`${wx('b')} ${wx('c')} want ${Math.min(bx,cx)}`);
});

test('P185 Rig-menu commands are enabled and run on ticked layers even with nothing selected in the timeline',async()=>{
 const mods=await Promise.all([import('./layerSplitCommands'),import('./layerWorkAreaCommands'),import('./modifierReseedCommands'),import('./layerNumberCommands'),import('./layerArrangeCommands'),import('./layerFlagCommands'),import('./markerFromLayersCommands')]);
 const specs=mods.flatMap(m=>Object.values(m).filter(v=>typeof v==='function'&&(v as Function).name.endsWith('Specs')).flatMap(f=>(f as ()=>any[])()));
 const dup=await import('./layerDuplicateCommands');specs.push(...Object.values(dup).filter(v=>typeof v==='function'&&(v as Function).name.endsWith('Specs')).flatMap(f=>(f as ()=>any[])()));
 assert.ok(specs.length>=8,`found ${specs.length}`);assert.ok(['animation.layers.duplicate','animation.layers.split','animation.workarea.toLayers','animation.modifiers.reseed','animation.layers.number','animation.layers.arrange','animation.layers.flag','animation.marker.fromLayers'].every(id=>specs.some(x=>x.id===id)));
 const s=open();setAnimationSession(s);s.setView({selectedLayer:null as never});
 for(const sp of specs)assert.equal(sp.enabled(),true,sp.id);
 s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const r=specs.find(x=>x.id==='animation.layers.flag')!.run({flag:'shy',layers:['a','b']}) as {changed:number};assert.equal(r.changed,2);
});

test('P186 custom export file name: replaces the document name in frame, sequence and GIF names, clears with null, stays sanitised',async()=>{
 const {exportCurrentFrame,exportWorkAreaSequence,exportGif,setExportSettings,resetExportSettings,resetExport}=await import('./exportJob');const {settingsProblems,defaultExportSettings}=await import('./exportSettings');
 const s=open();setAnimationSession(s);s.dispatch({type:'workarea.set',in:0,out:f(2)});resetExport();resetExportSettings();
 const saved:string[]=[];const save=(_b:Blob,n:string)=>{saved.push(n);};const rasterize=async()=>new Uint8Array([1]);const pixels=async(_s:string,w:number,h:number)=>new Uint8ClampedArray(w*h*4);
 setExportSettings({fileName:' My Title/2 '});s.setView({playhead:f(1)});
 await exportCurrentFrame({rasterize,save});await exportWorkAreaSequence({rasterize,save});await exportGif({pixels,save});
 assert.deepEqual(saved,['My_Title_2_00001.png','My_Title_2_frames.zip','My_Title_2.gif']);
 setExportSettings({fileName:null});saved.length=0;await exportGif({pixels,save});assert.notEqual(saved[0],'My_Title_2.gif');
 assert.throws(()=>setExportSettings({fileName:'x'.repeat(81)}),(e:any)=>e.code==='unsupported');assert.deepEqual(settingsProblems({...defaultExportSettings(),fileName:'ok'}),[]);
 resetExportSettings();
});

test('P188: WebM quality sets the bitrate and the size estimate',async()=>{
 const {webmBitrate,estimateBytes,settingsProblems}=await import('./exportSettings');
 assert.equal(webmBitrate(1280,720,30),Math.round(1280*720*30*0.07));
 assert.ok(webmBitrate(1280,720,30,'low')<webmBitrate(1280,720,30)&&webmBitrate(1280,720,30)<webmBitrate(1280,720,30,'high'));
 assert.equal(webmBitrate(16,16,1,'low'),250000);assert.equal(webmBitrate(8000,8000,60,'high'),40e6);
 assert.ok(estimateBytes('webm',800,450,60,30,'high')>estimateBytes('webm',800,450,60,30,'low'));
 assert.equal(estimateBytes('webm',800,450,60,30),estimateBytes('webm',800,450,60,30,'medium'));
 assert.deepEqual(settingsProblems({scale:100,fps:null,from:null,to:null,quality:'ultra' as never}),['quality']);
});

test('P189 export background colour: replaces the composition colour for this export only, validates, clears with null',async()=>{
 const {exportCurrentFrame,setExportSettings,resetExportSettings,resetExport}=await import('./exportJob');const {settingsProblems,defaultExportSettings}=await import('./exportSettings');
 const s=open();setAnimationSession(s);resetExport();resetExportSettings();
 const svgs:string[]=[];const rasterize=async(svg:string)=>{svgs.push(svg);return new Uint8Array([1]);};const save=()=>{};
 const orig=findComp(s.document!).background.toLowerCase();assert.notEqual(orig,'#ff00aa');
 setExportSettings({background:'#FF00AA'});await exportCurrentFrame({rasterize,save});
 assert.ok(svgs[0].toLowerCase().includes('#ff00aa'));assert.equal(findComp(s.document!).background.toLowerCase(),orig);
 setExportSettings({background:null});await exportCurrentFrame({rasterize,save});assert.ok(svgs[1].toLowerCase().includes(orig));
 assert.throws(()=>setExportSettings({background:'red'}),(e:any)=>e.code==='unsupported');assert.deepEqual(settingsProblems({...defaultExportSettings(),background:'#abcdef'}),[]);
 resetExportSettings();
});

test('P190 graph playhead reading: value of the channel at the playhead, speed in speed mode, null outside the window',async()=>{
 const {playheadReading}=await import('./graph');const {evaluate}=await import('./interpolate');
 const s=open();const c=findComp(s.document!);const prop=findLayer(c,'a')!.transform.position;const k=prop.keys;
 const t=Math.round((k[0].t+k[k.length-1].t)/2);const ev=evaluate(prop,t);
 assert.equal(playheadReading(prop,0,t,0,c.duration,false),typeof ev==='number'?ev:ev[0]);
 assert.equal(playheadReading(prop,1,t,0,c.duration,false),(ev as readonly number[])[1]);
 assert.equal(typeof playheadReading(prop,0,t,0,c.duration,true),'number');
 assert.equal(playheadReading(prop,0,-5,0,c.duration,false),null);assert.equal(playheadReading(prop,0,c.duration+1,0,c.duration,false),null);
});

test('P191 layers.reset: neutral rotation/scale/opacity at the playhead, one undo step, skips locked, refuses when already neutral',async()=>{
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});s.dispatch({type:'layer.add',kind:'shape',id:'c'});
 const {evaluate}=await import('./interpolate');const {layerResetSpecs}=await import('./layerResetCommands');const run=(p:object)=>(layerResetSpecs()[0].run as (p:unknown)=>any)(p);
 const get=(id:string)=>findLayer(findComp(s.document!)!,id)!;const ev=(id:string,k:'rotation'|'scale'|'opacity')=>evaluate(get(id).transform[k],0);
 s.dispatch([{type:'prop.set',layer:'b',prop:'rotation',value:45,t:0},{type:'prop.set',layer:'b',prop:'scale',value:[50,60],t:0},{type:'prop.set',layer:'b',prop:'opacity',value:30,t:0},{type:'prop.set',layer:'c',prop:'rotation',value:10,t:0}]);
 s.dispatch({type:'layer.update',layer:'c',locked:true});s.setView({playhead:0});
 const r=run({mode:'all',layers:['b','c']});assert.equal(r.changed,3);assert.equal(r.skippedLocked,1);
 assert.equal(ev('b','rotation'),0);assert.deepEqual(ev('b','scale'),[100,100]);assert.equal(ev('b','opacity'),100);assert.equal(ev('c','rotation'),10);
 assert.throws(()=>run({mode:'all',layers:['b']}),(e:any)=>e.expected===true);
 assert.throws(()=>run({mode:'nope',layers:['b']}),(e:any)=>e.expected===true);
 s.undo();assert.equal(ev('b','rotation'),45);assert.deepEqual(ev('b','scale'),[50,60]);
});

test('P192 first frame number: renumbers sequence files and manifest, validates, default unchanged',async()=>{
 const {exportWorkAreaSequence,setExportSettings,resetExportSettings,resetExport}=await import('./exportJob');const {renumberPlan}=await import('./exportFrames');const {unzipSync,strFromU8}=await import('fflate');
 assert.deepEqual(renumberPlan([{frame:7},{frame:8}],1001).map(p=>p.frame),[1001,1002]);assert.deepEqual(renumberPlan([{frame:7}],null).map(p=>p.frame),[7]);assert.deepEqual(renumberPlan([{frame:7}],-1).map(p=>p.frame),[7]);
 const s=open();setAnimationSession(s);s.dispatch({type:'workarea.set',in:f(2),out:f(5)});resetExport();resetExportSettings();
 let blob:Blob|null=null;const save=(b:Blob)=>{blob=b;};const rasterize=async()=>new Uint8Array([1]);
 const names=async()=>{await exportWorkAreaSequence({rasterize,save});return unzipSync(new Uint8Array(await blob!.arrayBuffer()));};
 let z=await names();assert.ok(Object.keys(z).some(n=>n.endsWith('_00002.png')));
 setExportSettings({firstNumber:1001});z=await names();const png=Object.keys(z).filter(n=>n.endsWith('.png')).sort();
 assert.deepEqual(png.map(n=>n.slice(-9,-4)),['01001','01002','01003']);assert.equal(JSON.parse(strFromU8(z['manifest.json'])).firstFrame,1001);
 assert.throws(()=>setExportSettings({firstNumber:100000}),(e:any)=>e.code==='unsupported');assert.throws(()=>setExportSettings({firstNumber:1.5}),(e:any)=>e.code==='unsupported');
 resetExportSettings();
});

test('P193 layers.trimToWorkArea: cuts in/out to the work area, never extends, skips locked and outside, one undo step',async()=>{
 const s=open();setAnimationSession(s);const c0=findComp(s.document!);const d=c0.duration;
 for(const id of ['b','c','e','f'])s.dispatch({type:'layer.add',kind:'shape',id});
 const T=(id:string,inT:number,outT:number)=>s.dispatch({type:'layer.timing',layer:id,inT,outT});
 const q=Math.round(d/10);T('b',0,d);T('c',q*4,q*6);T('e',0,q);T('f',0,d);s.dispatch({type:'layer.update',layer:'f',locked:true});
 s.dispatch({type:'workarea.set',in:q*2,out:q*8});
 const {layerTrimSpecs}=await import('./layerTrimCommands');const run=(p:object)=>(layerTrimSpecs()[0].run as (p:unknown)=>any)(p);
 const get=(id:string)=>findLayer(findComp(s.document!)!,id)!;
 const r=run({layers:['b','c','e','f']});assert.equal(r.trimmed,1);assert.equal(r.skipped,2);
 assert.deepEqual([get('b').inT,get('b').outT],[q*2,q*8]);assert.deepEqual([get('c').inT,get('c').outT],[q*4,q*6]);assert.deepEqual([get('e').inT,get('e').outT],[0,q]);assert.deepEqual([get('f').inT,get('f').outT],[0,d]);
 assert.throws(()=>run({layers:['b','c']}),(e:any)=>e.expected===true);
 s.undo();assert.deepEqual([get('b').inT,get('b').outT],[0,d]);
});

test('P194 graph zoom/pan window: zooms around the anchor, clamps, returns null at full range, pans without changing span',async()=>{
 const {zoomWindow,panWindow}=await import('./graphWindow');const fps={num:30,den:1};const full={t0:0,t1:240000};
 const z=zoomWindow(full,120000,2,0,240000,fps)!;assert.equal(z.t1-z.t0,120000);assert.equal(z.t0,60000);
 const edge=zoomWindow(full,0,2,0,240000,fps)!;assert.deepEqual(edge,{t0:0,t1:120000});
 assert.equal(zoomWindow(z,120000,0.5,0,240000,fps),null);
 const tiny=zoomWindow(full,100,1e9,0,240000,fps)!;assert.equal(tiny.t1-tiny.t0,2*8000);assert.ok(tiny.t0>=0);
 const p=panWindow(z,1e9,0,240000);assert.equal(p.t1,240000);assert.equal(p.t1-p.t0,120000);assert.equal(panWindow(z,-1e9,0,240000).t0,0);
 assert.equal(zoomWindow(full,0,0,0,240000,fps),null);
});

test('P196 GIF colors: colour table, LZW code size and file size follow the palette size; bad values refused',async()=>{
 const {encodeGif,buildPalette}=await import('./gifEncode');const {estimateBytes,settingsProblems,defaultExportSettings}=await import('./exportSettings');
 const w=32,h=32,px=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++){px[i*4]=(i*7)&255;px[i*4+1]=(i*13)&255;px[i*4+2]=(i*29)&255;px[i*4+3]=255;}
 const frames=[{pixels:px,delayCs:5}];const g256=encodeGif(w,h,frames),g16=encodeGif(w,h,frames,true,false,16);
 assert.equal(g256[10],0xF7);assert.equal(g16[10],0xF3);assert.equal(buildPalette(frames,w,h,16).length,48);
 assert.ok(g16.length<g256.length);
 const img=(g:Uint8Array,tab:number)=>{let i=13+tab*3;while(!(g[i]===0x2C&&g[i+1]===0&&g[i+2]===0))i++;return g[i+10];};
 assert.equal(img(g16,16),4);assert.equal(img(g256,256),8);assert.equal(g16[g16.length-1],0x3B);
 assert.throws(()=>encodeGif(w,h,frames,true,false,100),(e:any)=>e.code==='bad-colors');
 assert.ok(estimateBytes('gif',100,100,10,10,'medium',16)<estimateBytes('gif',100,100,10,10));assert.equal(estimateBytes('gif',100,100,10,10,'medium',256),estimateBytes('gif',100,100,10,10));
 assert.deepEqual(settingsProblems({...defaultExportSettings(),colors:100 as never}),['colors']);
});

test('P198 layers.centerAnchor: anchor to the content centre, picture does not move, skips animated/locked, one undo step',async()=>{
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});s.dispatch({type:'layer.add',kind:'shape',id:'c'});
 const {layerCenterSpecs}=await import('./layerCenterCommands');const {worldMatrix,applyMatrix}=await import('./scene');const run=(p:object)=>(layerCenterSpecs()[0].run as (p:unknown)=>any)(p);
 const get=(id:string)=>findLayer(findComp(s.document!)!,id)!;const corner=(id:string,x:number,y:number)=>applyMatrix(worldMatrix(findComp(s.document!)!,get(id),0),[x,y]);
 const w=get('b').source.width!,h=get('b').source.height!;assert.ok(w>0&&h>0);
 s.dispatch([{type:'prop.set',layer:'b',prop:'rotation',value:30,t:0},{type:'prop.set',layer:'b',prop:'scale',value:[150,80],t:0}]);s.dispatch({type:'layer.update',layer:'c',locked:true});s.setView({playhead:0});
 const before=[corner('b',0,0),corner('b',w,h)];
 const r=run({layers:['b','c']});assert.equal(r.centred,1);assert.deepEqual(Array.from(get('b').transform.anchor.value as number[]),[w/2,h/2]);
 const after=[corner('b',0,0),corner('b',w,h)];for(let i=0;i<2;i++)for(let k=0;k<2;k++)assert.ok(Math.abs(before[i][k]-after[i][k])<0.05);
 assert.throws(()=>run({layers:['b']}),(e:any)=>e.expected===true);
 s.undo();assert.deepEqual(Array.from(get('b').transform.anchor.value as number[]),[0,0].map((_,i)=>before.length?(get('b').transform.anchor.value as number[])[i]:0));assert.notDeepEqual(Array.from(get('b').transform.anchor.value as number[]),[w/2,h/2]);
});

test('P199 centerAnchor on an animated position: all keys shift by one offset, picture stays put at every frame, undo is one step',async()=>{
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'m'});
 const {layerCenterSpecs}=await import('./layerCenterCommands');const {worldMatrix,applyMatrix}=await import('./scene');const run=(p:object)=>(layerCenterSpecs()[0].run as (p:unknown)=>any)(p);
 const c=()=>findComp(s.document!)!;const get=(id:string)=>findLayer(c(),id)!;const w=get('m').source.width!,h=get('m').source.height!;
 s.dispatch([{type:'prop.set',layer:'m',prop:'rotation',value:40,t:0},{type:'prop.set',layer:'m',prop:'scale',value:[120,70],t:0},{type:'prop.animate',layer:'m',prop:'position',on:true,t:0},{type:'prop.set',layer:'m',prop:'position',value:[600,300],t:frameToTick(20,c().fps)}]);
 const ts=[0,frameToTick(7,c().fps),frameToTick(20,c().fps)];const at=(t:number)=>applyMatrix(worldMatrix(c(),get('m'),t),[w,h]);const before=ts.map(at);
 s.setView({playhead:0});const r=run({layers:['m']});assert.equal(r.centred,1);assert.equal(get('m').transform.position.keys.length,2);
 ts.forEach((t,i)=>{const a=at(t);assert.ok(Math.abs(a[0]-before[i][0])<0.1&&Math.abs(a[1]-before[i][1])<0.1);});
 s.undo();assert.deepEqual(Array.from(get('m').transform.anchor.value as number[]),[0,0]);
 s.dispatch({type:'prop.animate',layer:'m',prop:'rotation',on:true,t:0});s.dispatch({type:'prop.set',layer:'m',prop:'rotation',value:90,t:frameToTick(20,c().fps)});
 assert.throws(()=>run({layers:['m']}),(e:any)=>e.expected===true);
});

test('P201 layers.fade: opacity keys at in/out, one undo step, skips animated/locked/short, validates',async()=>{
 const s=open();setAnimationSession(s);for(const id of ['b','c','e'])s.dispatch({type:'layer.add',kind:'shape',id});
 const {layerFadeSpecs}=await import('./layerFadeCommands');const {evaluate}=await import('./interpolate');const run=(p:object)=>(layerFadeSpecs()[0].run as (p:unknown)=>any)(p);
 const c=()=>findComp(s.document!)!;const get=(id:string)=>findLayer(c(),id)!;const fr=(n:number)=>frameToTick(n,c().fps);
 s.dispatch({type:'layer.timing',layer:'b',inT:fr(10),outT:fr(100)});s.dispatch([{type:'prop.animate',layer:'c',prop:'opacity',on:true,t:0}]);s.dispatch({type:'layer.update',layer:'e',locked:true});
 s.dispatch({type:'prop.set',layer:'b',prop:'opacity',value:80,t:0});
 const r=run({mode:'both',frames:12,layers:['b','c','e']});assert.equal(r.faded,1);assert.equal(r.skipped,2);
 const o=get('b').transform.opacity;assert.equal(o.keys.length,4);
 assert.equal(evaluate(o,fr(10)),0);assert.equal(evaluate(o,fr(22)),80);assert.equal(evaluate(o,fr(50)),80);assert.equal(evaluate(o,fr(99)),0);
 s.undo();assert.equal(get('b').transform.opacity.keys.length,0);assert.equal(get('b').transform.opacity.value,80);
 run({mode:'in',layers:['b']});assert.equal(get('b').transform.opacity.keys.length,2);s.undo();
 assert.throws(()=>run({mode:'x',layers:['b']}),(e:any)=>e.expected===true);assert.throws(()=>run({mode:'in',frames:0,layers:['b']}),(e:any)=>e.expected===true);
 s.dispatch({type:'layer.timing',layer:'b',inT:fr(10),outT:fr(15)});assert.throws(()=>run({mode:'both',layers:['b']}),(e:any)=>e.expected===true);
});

test('P202 layers.fit: uniform scale and centring for contain/cover/width/height, rotation respected, skips parented/animated/locked',async()=>{
 const s=open();setAnimationSession(s);for(const id of ['b','c','e'])s.dispatch({type:'layer.add',kind:'shape',id});
 const {layerFitSpecs}=await import('./layerFitCommands');const {worldMatrix,applyMatrix}=await import('./scene');const run=(p:object)=>(layerFitSpecs()[0].run as (p:unknown)=>any)(p);
 const c=()=>findComp(s.document!)!;const get=(id:string)=>findLayer(c(),id)!;const w=get('b').source.width!,h=get('b').source.height!;
 const box=(id:string)=>{const pts=[[0,0],[w,0],[0,h],[w,h]].map(([x,y])=>applyMatrix(worldMatrix(c(),get(id),0),[x,y]));const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return {x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)};};
 s.setView({playhead:0});s.dispatch({type:'prop.set',layer:'b',prop:'rotation',value:25,t:0});s.dispatch({type:'prop.set',layer:'b',prop:'anchor',value:[10,20],t:0});
 const W=c().width,H=c().height,near=(a:number,b:number)=>Math.abs(a-b)<0.1;
 run({mode:'contain',layers:['b']});let r=box('b');assert.ok(near((r.x0+r.x1)/2,W/2)&&near((r.y0+r.y1)/2,H/2));assert.ok(near(r.x1-r.x0,W)||near(r.y1-r.y0,H));assert.ok(r.x1-r.x0<=W+0.1&&r.y1-r.y0<=H+0.1);
 run({mode:'cover',layers:['b']});r=box('b');assert.ok(r.x1-r.x0>=W-0.1&&r.y1-r.y0>=H-0.1);assert.ok(near((r.x0+r.x1)/2,W/2));
 run({mode:'width',layers:['b']});r=box('b');assert.ok(near(r.x1-r.x0,W));run({mode:'height',layers:['b']});r=box('b');assert.ok(near(r.y1-r.y0,H));
 s.dispatch({type:'layer.update',layer:'e',locked:true});s.dispatch({type:'layer.update',layer:'c',parent:'b'} as never);
 const out=run({mode:'contain',layers:['c','e','a']});assert.ok(out.skipped>=2);
 assert.throws(()=>run({mode:'nope',layers:['b']}),(e:any)=>e.expected===true);
 s.undo();
});

test('P204 frame format: JPEG/WebP single-frame export re-encodes at the quality, renames, JPEG is opaque, validates',async()=>{
 const {exportCurrentFrame,setExportSettings,resetExportSettings,resetExport,setExportTransparent}=await import('./exportJob');
 const s=open();setAnimationSession(s);resetExport();resetExportSettings();s.setView({playhead:frameToTick(3,findComp(s.document!)!.fps)});
 const saved:{n:string;type:string;bytes:number[]}[]=[];const save=async(b:Blob,n:string)=>{saved.push({n,type:b.type,bytes:Array.from(new Uint8Array(await b.arrayBuffer()))});};
 const svgs:string[]=[];const rasterize=async(svg:string)=>{svgs.push(svg);return new Uint8Array([137,80]);};const calls:any[]=[];
 const encode=async(png:Uint8Array,f:'jpeg'|'webp',q:number)=>{calls.push([Array.from(png),f,q]);return new Uint8Array([9,9,q]);};
 await exportCurrentFrame({rasterize,save,encode});assert.match(saved[0].n,/\.png$/);assert.equal(saved[0].type,'image/png');assert.equal(calls.length,0);
 setExportTransparent(true);setExportSettings({frameFormat:'jpeg',frameQuality:70});await exportCurrentFrame({rasterize,save,encode});
 assert.match(saved[1].n,/_00003\.jpg$/);assert.equal(saved[1].type,'image/jpeg');assert.deepEqual(saved[1].bytes,[9,9,70]);assert.deepEqual(calls[0],[[137,80],'jpeg',70]);
 const bgJpeg=svgs[1];setExportSettings({frameFormat:'webp'});await exportCurrentFrame({rasterize,save,encode});
 assert.match(saved[2].n,/\.webp$/);assert.equal(calls[1][2],70);assert.notEqual(bgJpeg,svgs[2]);
 resetExportSettings();setExportTransparent(false);
 assert.throws(()=>setExportSettings({frameFormat:'gif' as never}),(e:any)=>e.code==='unsupported');assert.throws(()=>setExportSettings({frameQuality:0}),(e:any)=>e.code==='unsupported');assert.throws(()=>setExportSettings({frameQuality:101}),(e:any)=>e.code==='unsupported');
});

test('P205 sprite sheet padding: gutter between and around cells, atlas follows, default identical, bad values refused',async()=>{
 const {sheetPlan,packSheet,sheetManifest,SheetError}=await import('./spriteSheet');const {settingsProblems,defaultExportSettings}=await import('./exportSettings');
 const a=sheetPlan(5,10,8,3),b=sheetPlan(5,10,8,3,0);assert.deepEqual(a,b);assert.equal(a.width,30);assert.equal(a.height,16);
 const p=sheetPlan(5,10,8,3,2);assert.equal(p.padding,2);assert.equal(p.width,2+3*12);assert.equal(p.height,2+2*10);
 assert.deepEqual(p.cells.map(c=>[c.x,c.y]),[[2,2],[14,2],[26,2],[2,12],[14,12]]);
 const frames=p.cells.map((_,i)=>new Uint8ClampedArray(10*8*4).fill(i+1));const px=packSheet(p,frames);
 const at=(x:number,y:number)=>px[(y*p.width+x)*4];assert.equal(at(0,0),0);assert.equal(at(2,2),1);assert.equal(at(11,9),1);assert.equal(at(12,5),0);assert.equal(at(14,2),2);assert.equal(at(p.width-1,p.height-1),0);
 const m=sheetManifest(p,p.cells.map((_,i)=>({frame:i,tick:i})),'n','n.png',{num:30,den:1});assert.equal((m as any).padding,2);assert.equal(m.frames[1].x,14);assert.equal((sheetManifest(a,a.cells.map((_,i)=>({frame:i,tick:i})),'n','n.png',{num:30,den:1}) as any).padding,undefined);
 assert.throws(()=>sheetPlan(2,10,8,2,33),SheetError);assert.throws(()=>sheetPlan(2,10,8,2,1.5),SheetError);
 assert.deepEqual(settingsProblems({...defaultExportSettings(),sheetPadding:40}),['padding']);assert.deepEqual(settingsProblems({...defaultExportSettings(),sheetPadding:4}),[]);
});

test('P206 graph value zoom: anchor keeps its relative position, span clamps, bad input refused',async()=>{
 const {zoomRange}=await import('./graphWindow');const r={min:0,max:100};
 const z=zoomRange(r,25,2)!;assert.equal(z.max-z.min,50);assert.equal(z.min,12.5);assert.equal((25-z.min)/(z.max-z.min),0.25);
 const o=zoomRange(r,50,0.5)!;assert.equal(o.max-o.min,200);assert.equal(o.min,-50);
 assert.ok(Math.abs(zoomRange(r,50,1e12)!.max-zoomRange(r,50,1e12)!.min-0.01)<1e-9);assert.ok(zoomRange(r,50,1e-12)!.max-zoomRange(r,50,1e-12)!.min<=1e9+1);
 assert.equal(zoomRange(r,50,0),null);assert.equal(zoomRange({min:3,max:3},3,2),null);assert.equal(zoomRange(r,NaN,2),null);
 assert.equal(zoomRange(r,500,2)!.max,100);
});

test('P207 GIF merges identical consecutive frames: summed delay, fewer images, smaller file, order kept',async()=>{
 const {encodeGif,mergeIdenticalFrames}=await import('./gifEncode');
 const w=16,h=16,mk=(r:number)=>{const px=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++){px[i*4]=r;px[i*4+1]=(i*5)&255;px[i*4+2]=40;px[i*4+3]=255;}return px;};
 const A=mk(10),B=mk(200),A2=mk(10);const fr=[{pixels:A,delayCs:3},{pixels:A2,delayCs:4},{pixels:B,delayCs:5},{pixels:B,delayCs:6},{pixels:A,delayCs:7}];
 const m=mergeIdenticalFrames(fr);assert.deepEqual(m.map(f=>f.delayCs),[7,11,7]);assert.equal(m.reduce((n,f)=>n+f.delayCs,0),fr.reduce((n,f)=>n+f.delayCs,0));
 assert.equal(mergeIdenticalFrames([{pixels:A,delayCs:40000},{pixels:A,delayCs:40000}]).length,2);assert.equal(mergeIdenticalFrames([]).length,0);
 const info=(g:Uint8Array)=>{let n=0;const d:number[]=[];for(let i=0;i<g.length-1;i++){if(g[i]===0x21&&g[i+1]===0xF9&&g[i+2]===4)d.push(g[i+4]|g[i+5]<<8);if(g[i]===0x2C&&g[i+1]===0&&g[i+2]===0&&g[i+3]===0&&g[i+4]===0)n++;}return {n,d};};
 const g=encodeGif(w,h,fr),one=encodeGif(w,h,[{pixels:A,delayCs:3},{pixels:B,delayCs:5},{pixels:A,delayCs:7}]);
 assert.deepEqual(info(g),{n:3,d:[7,11,7]});assert.equal(g.length,one.length);assert.equal(g[g.length-1],0x3B);
 const plain=encodeGif(w,h,[{pixels:A,delayCs:3},{pixels:A2,delayCs:4},{pixels:A,delayCs:3}]);assert.equal(info(plain).n,1);
});

test('P208 export plan: sheet size and grid in the readout, padding included, absent for other formats and bad settings',async()=>{
 const {exportPlan,defaultExportSettings}=await import('./exportSettings');
 const s=open();const c=findComp(s.document!)!;const base={...defaultExportSettings(),scale:25};
 const a=exportPlan(c,'sheet',base);assert.ok(a.sheet);assert.equal(a.sheet!.width,a.sheet!.columns*a.width);assert.equal(a.sheet!.height,a.sheet!.rows*a.height);assert.ok(a.sheet!.columns*a.sheet!.rows>=a.frames);
 const b=exportPlan(c,'sheet',{...base,sheetPadding:4,columns:5});assert.equal(b.sheet!.columns,5);assert.equal(b.sheet!.width,5*(a.width+4)+4);assert.equal(b.sheet!.height,b.sheet!.rows*(a.height+4)+4);
 assert.equal(exportPlan(c,'gif',base).sheet,undefined);assert.equal(exportPlan(c,'sheet',{...base,scale:400,columns:1}).sheet,undefined);
 assert.equal(exportPlan(c,'sheet',{...base,sheetPadding:99}).sheet!.width,a.sheet!.width);
});

test('P209 export plan: sprite sheet estimate follows the sheet pixels (padding and empty cells count)',async()=>{
 const {exportPlan,defaultExportSettings,estimateBytes}=await import('./exportSettings');
 const s=open();const c=findComp(s.document!)!;const base={...defaultExportSettings(),scale:25};
 const a=exportPlan(c,'sheet',base),b=exportPlan(c,'sheet',{...base,sheetPadding:16,columns:7});
 assert.equal(a.estimateBytes,estimateBytes('sheet',a.sheet!.width,a.sheet!.height,1));
 assert.ok(b.estimateBytes>a.estimateBytes*0.9);assert.equal(b.estimateBytes,estimateBytes('sheet',b.sheet!.width,b.sheet!.height,1));
 assert.equal(exportPlan(c,'sequence',base).estimateBytes,estimateBytes('sequence',a.width,a.height,a.frames,a.fps.num/a.fps.den));
});

test('P210 own export presets: save, apply, replace, delete, limits and persistence',async()=>{
 const u=await import('./exportUserPresets');const {exportPresetSpecs}=await import('./exportPresetCommands');const {setExportSettings,resetExportSettings,exportState,setExportTransparent}=await import('./exportJob');
 const mem=new Map<string,string>();u.setPresetStore({getItem:k=>mem.get(k)??null,setItem:(k,v)=>{mem.set(k,v);}});
 const run=(i:number,p?:unknown)=>exportPresetSpecs()[i].run(p) as unknown;
 resetExportSettings();setExportSettings({scale:50,fps:15,colors:64,dither:true,sheetPadding:4,from:3,to:9,fileName:'keep'});setExportTransparent(true);
 assert.equal(run(0,{name:'  Web  small '}),'web small');assert.equal(u.userExportPresets().length,1);
 const raw=JSON.parse(mem.get('somnia.exportPresets.v1')!);assert.equal(raw[0].name,'Web small');assert.equal(raw[0].settings.from,undefined);assert.equal(raw[0].settings.fileName,undefined);
 resetExportSettings();setExportTransparent(false);setExportSettings({from:1,to:2,fileName:'doc',quality:'high'});
 run(1,{id:'web small'});const s=exportState().settings;assert.equal(s.scale,50);assert.equal(s.colors,64);assert.equal(s.dither,true);assert.equal(s.quality,undefined);assert.equal(s.from,1);assert.equal(s.to,2);assert.equal(s.fileName,'doc');assert.equal(exportState().transparent,true);
 setExportSettings({scale:200});run(0,{name:'WEB small'});assert.equal(u.userExportPresets().length,1);assert.equal(u.userExportPresets()[0].settings.scale,200);
 for(const bad of ['','   ','x'.repeat(41)])assert.throws(()=>run(0,{name:bad}),(e:any)=>e.expected===true);
 assert.throws(()=>run(1,{id:'nope'}),(e:any)=>e.expected===true);assert.throws(()=>run(2,{id:'nope'}),(e:any)=>e.expected===true);
 for(let i=1;i<u.MAX_USER_PRESETS;i++)run(0,{name:`p${i}`});assert.throws(()=>run(0,{name:'one more'}),(e:any)=>/Delete one first/.test(e.message));run(0,{name:'p1'});
 u.setPresetStore({getItem:k=>mem.get(k)??null,setItem:(k,v)=>{mem.set(k,v);}});assert.equal(u.userExportPresets().length,u.MAX_USER_PRESETS);
 run(2,{id:'p1'});assert.equal(u.userExportPresets().length,u.MAX_USER_PRESETS-1);
 mem.set('somnia.exportPresets.v1',JSON.stringify([{name:'ok',settings:{scale:100},transparent:false},{name:'bad',settings:{scale:5},transparent:false},{name:'',settings:{scale:100},transparent:false},7,null]));u.setPresetStore({getItem:k=>mem.get(k)??null,setItem:()=>{}});
 assert.deepEqual(u.userExportPresets().map(p=>p.id),['ok']);mem.set('somnia.exportPresets.v1','{not json');u.setPresetStore({getItem:k=>mem.get(k)??null,setItem:()=>{}});assert.equal(u.userExportPresets().length,0);
 u.setPresetStore(null);run(0,{name:'session only'});assert.equal(u.userExportPresets().length,1);u.setPresetStore(undefined);resetExportSettings();setExportTransparent(false);
});

test('P211 export motion blur: off drops the shutter, high uses 16 samples, document untouched, no effect without a shutter',async()=>{
 const {exportCurrentFrame,setExportSettings,resetExportSettings,resetExport}=await import('./exportJob');const {settingsProblems,defaultExportSettings}=await import('./exportSettings');
 const s=open();setAnimationSession(s);resetExport();resetExportSettings();
 const svgs:string[]=[];const rasterize=async(svg:string)=>{svgs.push(svg);return new Uint8Array([1]);};const save=()=>{};
 const ids=findComp(s.document!).layers.map(l=>l.id);s.dispatch({type:'layer.motionBlur',layers:ids,enabled:true});s.setView({playhead:f(1)});
 await exportCurrentFrame({rasterize,save});assert.equal(svgs[0],svgs[0]);const plain=svgs[0].length;
 s.dispatch({type:'comp.shutter',shutter:{angle:180,samples:3}});
 await exportCurrentFrame({rasterize,save});setExportSettings({blur:'off'});await exportCurrentFrame({rasterize,save});setExportSettings({blur:'high'});await exportCurrentFrame({rasterize,save});setExportSettings({blur:null});await exportCurrentFrame({rasterize,save});
 const [,comp3,off,high,again]=svgs.map(x=>x.length);
 assert.ok(comp3>plain);assert.equal(off,plain);assert.ok(high>comp3);assert.equal(again,comp3);
 assert.deepEqual(findComp(s.document!).shutter,{angle:180,samples:3});
 assert.throws(()=>setExportSettings({blur:'max' as never}),(e:any)=>e.code==='unsupported');assert.deepEqual(settingsProblems({...defaultExportSettings(),blur:'high'}),[]);assert.deepEqual(settingsProblems({...defaultExportSettings(),blur:null}),[]);
 resetExportSettings();
});

test('P212 export selected layers only: hides the others in the output, keeps parents and mattes working, document untouched',async()=>{
 const {exportCurrentFrame,setExportSettings,resetExportSettings,resetExport}=await import('./exportJob');const {settingsProblems,defaultExportSettings}=await import('./exportSettings');
 const s=open();setAnimationSession(s);resetExport();resetExportSettings();
 const svgs:string[]=[];const rasterize=async(svg:string)=>{svgs.push(svg);return new Uint8Array([1]);};const save=()=>{};
 s.dispatch({type:'layer.add',kind:'shape',id:'zz'});s.dispatch({type:'layer.add',kind:'shape',id:'yy'});const ids=findComp(s.document!).layers.map(l=>l.id);assert.ok(ids.length>=3);
 s.setView({playhead:f(1),selectedLayer:'zz'});await exportCurrentFrame({rasterize,save});
 setExportSettings({selectedOnly:true});await exportCurrentFrame({rasterize,save});
 assert.ok(svgs[1].length<svgs[0].length);
 s.setView({selectedLayer:null});let code='';try{await exportCurrentFrame({rasterize,save});}catch(e){code=(e as {code:string}).code;}assert.equal(code,'empty');
 assert.ok(findComp(s.document!).layers.every(l=>l.visible));
 setExportSettings({selectedOnly:false});svgs.length=0;s.setView({selectedLayer:'zz'});await exportCurrentFrame({rasterize,save});assert.ok(svgs[0].length>0);
 assert.throws(()=>setExportSettings({selectedOnly:'yes' as never}),(e:any)=>e.code==='unsupported');assert.deepEqual(settingsProblems({...defaultExportSettings(),selectedOnly:true}),[]);
 resetExportSettings();
});

test('P213 seamless loop export: drops a last frame identical to the first in APNG and GIF, never a short clip, default unchanged',async()=>{
 const {exportApng,exportGif,setExportSettings,resetExportSettings,resetExport}=await import('./exportJob');const {withoutLoopSeam,settingsProblems,defaultExportSettings}=await import('./exportSettings');
 assert.deepEqual(withoutLoopSeam([1,2,1],(a,b)=>a===b),[1,2]);assert.deepEqual(withoutLoopSeam([1,2,3],(a,b)=>a===b),[1,2,3]);assert.deepEqual(withoutLoopSeam([1,1],(a,b)=>a===b),[1,1]);assert.deepEqual(withoutLoopSeam([7],(a,b)=>a===b),[7]);
 const s=open();setAnimationSession(s);s.dispatch({type:'workarea.set',in:0,out:f(4)});resetExport();resetExportSettings();
 const {encodePngRgba}=await import('./spriteSheet');const frames=(b:Blob)=>b.arrayBuffer().then(x=>(Buffer.from(x).toString('latin1').match(/fcTL/g)||[]).length);
 const run=async(on:boolean)=>{resetExportSettings();setExportSettings({loopSeam:on});let n=0;const out:Blob[]=[];const rasterize=async()=>{const i=n++;return encodePngRgba(1,1,new Uint8ClampedArray([i===3?0:i*40,0,0,255]));};
  const pix=async(_s:string,w:number,h:number)=>{const px=new Uint8ClampedArray(w*h*4);return px;};
  await exportApng({rasterize,save:b=>{out.push(b);}});return frames(out[0]);};
 const off=await run(false),on=await run(true);assert.equal(on,off-1);
 const gif=async(on:boolean)=>{resetExportSettings();setExportSettings({loopSeam:on});let n=0;const out:Blob[]=[];const pixels=async(_s:string,w:number,h:number)=>{const i=n++;const px=new Uint8ClampedArray(w*h*4);px.fill(i===3?0:i*40,0,16);return px;};await exportGif({pixels,save:b=>{out.push(b);}});return out[0].size;};
 assert.ok(await gif(true)<await gif(false));
 assert.throws(()=>setExportSettings({loopSeam:1 as never}),(e:any)=>e.code==='unsupported');assert.deepEqual(settingsProblems({...defaultExportSettings(),loopSeam:true}),[]);resetExportSettings();
});

test('P214 timing sequence: layers chained head to tail with a gap, keys move with the layer, one undo step, blocked layers skipped',async()=>{
 const {timingPlan,TIMING_MODES,FRAME_MODES}=await import('./layerTiming');
 assert.ok(TIMING_MODES.includes('sequence'));assert.ok(FRAME_MODES.includes('sequence'));
 const s=open();for(const id of ['b','c','d'])s.dispatch({type:'layer.add',kind:'shape',id});
 s.dispatch({type:'layer.timing',layer:'b',inT:0,outT:f(10)});s.dispatch({type:'layer.timing',layer:'c',inT:0,outT:f(5)});s.dispatch({type:'layer.timing',layer:'d',inT:f(1),outT:f(9)});
 s.dispatch({type:'prop.set',layer:'c',prop:'opacity',t:0,value:0.5});
 const c0=findComp(s.document!);const r=timingPlan(c0,['b','c','d'],'sequence',{playhead:0,frames:2});assert.equal(r.changed,2);assert.equal(r.skipped,0);
 s.dispatch(r.edits);const c1=findComp(s.document!);const L=(id:string)=>c1.layers.find(l=>l.id===id)!;
 assert.equal(L('b').inT,0);assert.equal(L('b').outT,f(10));assert.equal(L('c').inT,f(12));assert.equal(L('c').outT,f(17));assert.equal(L('d').inT,f(19));assert.equal(L('d').outT,f(27));
 s.undo();const c2=findComp(s.document!);assert.equal(c2.layers.find(l=>l.id==='c')!.inT,0);assert.equal(c2.layers.find(l=>l.id==='d')!.inT,f(1));
 const again=timingPlan(c1,['b','c','d'],'sequence',{playhead:0,frames:2});assert.equal(again.edits.length,0);
 const rev=timingPlan(c0,['d','c','b'],'sequence',{playhead:0,frames:0});assert.equal(rev.changed,2);
 s.dispatch({type:'layer.update',layer:'c',locked:true});
 const lk=timingPlan(findComp(s.document!),['b','c','d'],'sequence',{playhead:0,frames:2});assert.equal(lk.skipped,1);
 const tooFar=timingPlan(c0,['b','c'],'sequence',{playhead:0,frames:600});assert.equal(tooFar.changed,0);assert.equal(tooFar.skipped,1);
});

test('P215 finished export reports the real file size, cleared when a new export starts',async()=>{
 const {exportCurrentFrame,exportWorkAreaSequence,exportState,resetExport,resetExportSettings}=await import('./exportJob');const {formatBytes}=await import('./exportSettings');
 const s=open();setAnimationSession(s);s.dispatch({type:'workarea.set',in:0,out:f(2)});resetExport();resetExportSettings();assert.equal(exportState().bytes,0);
 const saved:Blob[]=[];const rasterize=async()=>new Uint8Array([1,2,3,4,5]);const save=(b:Blob)=>{saved.push(b);};
 await exportCurrentFrame({rasterize,save});assert.equal(exportState().status,'done');assert.equal(exportState().bytes,saved[0].size);assert.ok(exportState().bytes>0);
 await exportWorkAreaSequence({rasterize,save});assert.equal(exportState().bytes,saved[1].size);
 resetExport();assert.equal(exportState().bytes,0);
 assert.equal(formatBytes(100),'1 KB');assert.equal(formatBytes(2048),'2 KB');assert.equal(formatBytes(1572864),'1.5 MB');
});

test('P216 match first layer: position by world anchor, scale, rotation, opacity, all; one undo step; locked skipped; no-op refused',async()=>{
 const {layerMatchSpecs}=await import('./layerMatchCommands');const run=layerMatchSpecs()[0].run as (p?:unknown)=>unknown;const {worldMatrix,applyMatrix}=await import('./scene');const {evaluate}=await import('./interpolate');
 const s=open();setAnimationSession(s);s.setView({playhead:0});for(const id of ['b','c','d'])s.dispatch({type:'layer.add',kind:'shape',id});
 s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[100,50],t:0});s.dispatch({type:'prop.set',layer:'b',prop:'scale',value:[50,60],t:0});s.dispatch({type:'prop.set',layer:'b',prop:'rotation',value:30,t:0});s.dispatch({type:'prop.set',layer:'b',prop:'opacity',value:40,t:0});
 s.dispatch({type:'layer.update',layer:'d',locked:true});
 const L=(id:string)=>findComp(s.document!).layers.find(l=>l.id===id)!;
 run({mode:'scale',layers:['b','c','d']});assert.deepEqual(evaluate(L('c').transform.scale,0),[50,60]);assert.deepEqual(evaluate(L('d').transform.scale,0),[100,100]);
 s.undo();assert.deepEqual(evaluate(L('c').transform.scale,0),[100,100]);
 run({mode:'all',layers:['b','c']});const c=findComp(s.document!);const w=(id:string)=>applyMatrix(worldMatrix(c,L(id),0),evaluate(L(id).transform.anchor,0) as [number,number]);
 assert.ok(Math.abs(w('c')[0]-w('b')[0])<0.02&&Math.abs(w('c')[1]-w('b')[1])<0.02);assert.equal(evaluate(L('c').transform.rotation,0),30);assert.equal(evaluate(L('c').transform.opacity,0),40);
 s.undo();assert.equal(evaluate(L('c').transform.rotation,0),0);
 for(const bad of [{mode:'x',layers:['b','c']},{mode:'all',layers:['b']},{mode:'all',layers:['b','d']}])assert.throws(()=>run(bad),(e:any)=>e.expected===true);
 run({mode:'opacity',layers:['b','c']});assert.throws(()=>run({mode:'opacity',layers:['b','c']}),(e:any)=>/already match/.test(e.message));
});

test('P217 graph box select: keys inside the box in any corner order, edges included, none outside',async()=>{
 const {keysInBox}=await import('./graphWindow');
 const keys=[{t:0,x:10,y:10},{t:1,x:50,y:50},{t:2,x:90,y:20},{t:3,x:50,y:90}];const pos=(k:{x:number;y:number})=>k;
 assert.deepEqual(keysInBox(keys,pos,{x:0,y:0},{x:60,y:60}),[0,1]);assert.deepEqual(keysInBox(keys,pos,{x:60,y:60},{x:0,y:0}),[0,1]);
 assert.deepEqual(keysInBox(keys,pos,{x:50,y:50},{x:90,y:20}),[1,2]);assert.deepEqual(keysInBox(keys,pos,{x:200,y:200},{x:300,y:300}),[]);assert.deepEqual(keysInBox([],pos,{x:0,y:0},{x:1,y:1}),[]);
});

test('P218 pose library: save by ticked layers, apply at the playhead in one undo step, replace by name, delete, limits, document validation',async()=>{
 const {poseSpecs}=await import('./poseCommands');const {validatePoseLib,MAX_POSES}=await import('./poseModel');const {validateDocument}=await import('./model');const {evaluate}=await import('./interpolate');
 const run=(i:number,p?:unknown)=>poseSpecs()[i].run(p) as unknown;
 const s=open();setAnimationSession(s);s.setView({playhead:0});for(const id of ['b','c'])s.dispatch({type:'layer.add',kind:'shape',id});
 const L=(id:string)=>findComp(s.document!).layers.find(l=>l.id===id)!;
 s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[10,20],t:0});s.dispatch({type:'prop.set',layer:'b',prop:'rotation',value:15,t:0});s.dispatch({type:'prop.set',layer:'c',prop:'opacity',value:30,t:0});
 assert.equal(run(0,{name:'  Hero  A ',layers:['b','c']}),'hero a');assert.equal(s.document!.poses!.items[0].name,'Hero A');assert.deepEqual(validateDocument(s.document),[]);
 s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[99,99],t:0});s.dispatch({type:'prop.set',layer:'b',prop:'rotation',value:0,t:0});s.dispatch({type:'prop.set',layer:'c',prop:'opacity',value:100,t:0});
 run(1,{id:'hero a'});assert.deepEqual(evaluate(L('b').transform.position,0),[10,20]);assert.equal(evaluate(L('b').transform.rotation,0),15);assert.equal(evaluate(L('c').transform.opacity,0),30);
 s.undo();assert.deepEqual(evaluate(L('b').transform.position,0),[99,99]);
 run(1,{id:'hero a'});assert.throws(()=>run(1,{id:'hero a'}),(e:any)=>/already match/.test(e.message));
 run(0,{name:'HERO a',layers:['b']});assert.equal(s.document!.poses!.items.length,1);assert.equal(s.document!.poses!.items[0].layers.length,1);
 s.dispatch({type:'layer.update',layer:'b',locked:true});assert.throws(()=>run(1,{id:'hero a'}),(e:any)=>e.expected===true);
 for(const bad of [{name:''},{name:'x'.repeat(41)},{name:'ok',layers:['nope']}])assert.throws(()=>run(0,bad),(e:any)=>e.expected===true);
 assert.throws(()=>run(1,{id:'nope'}),(e:any)=>e.expected===true);assert.throws(()=>run(2,{id:'nope'}),(e:any)=>e.expected===true);
 s.dispatch({type:'layer.update',layer:'b',locked:false});for(let i=1;i<MAX_POSES;i++)run(0,{name:`p${i}`,layers:['c']});assert.throws(()=>run(0,{name:'extra',layers:['c']}),(e:any)=>/Delete one first/.test(e.message));
 run(2,{id:'p1'});assert.equal(s.document!.poses!.items.length,MAX_POSES-1);
 s.undo();assert.equal(s.document!.poses!.items.length,MAX_POSES);
 assert.ok(validatePoseLib({version:2,items:[]}).length);assert.ok(validatePoseLib({version:1,items:[{id:'a',name:'a',layers:[{layer:'x'}]}]}).length);assert.ok(validatePoseLib({version:1,items:[{id:'a',name:'a',layers:[{layer:'x',opacity:101}]}]}).length);assert.deepEqual(validatePoseLib(undefined),[]);
});

test('P219 pose apply: set keys on static and animated props, blend by amount, validation, one undo step',async()=>{
 const {poseSpecs,blend}=await import('./poseCommands');const {evaluate}=await import('./interpolate');
 const run=(i:number,p?:unknown)=>poseSpecs()[i].run(p) as unknown;
 assert.equal(blend(10,20,50),15);assert.deepEqual(blend([0,100],[100,0],25),[25,75]);assert.equal(blend(5,9,100),9);
 const s=open();setAnimationSession(s);s.setView({playhead:0});s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const L=()=>findComp(s.document!).layers.find(l=>l.id==='b')!;
 s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[100,0],t:0});s.dispatch({type:'prop.set',layer:'b',prop:'rotation',value:40,t:0});
 run(0,{name:'A',layers:['b']});
 s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[0,0],t:0});s.dispatch({type:'prop.set',layer:'b',prop:'rotation',value:0,t:0});
 run(1,{id:'a',amount:50});assert.deepEqual(evaluate(L().transform.position,0),[50,0]);assert.equal(evaluate(L().transform.rotation,0),20);assert.equal(L().transform.position.keys.length,0);
 s.undo();assert.deepEqual(evaluate(L().transform.position,0),[0,0]);
 s.setView({playhead:f(10)});run(1,{id:'a',keys:true});assert.equal(L().transform.position.keys.length,1);assert.equal(L().transform.position.keys[0].t,f(10));assert.deepEqual(L().transform.position.keys[0].v,[100,0]);assert.equal(L().transform.rotation.keys.length,1);assert.equal(L().transform.opacity.keys.length,1);
 s.undo();assert.equal(L().transform.position.keys.length,0);assert.equal(L().transform.opacity.keys.length,0);
 s.setView({playhead:0});run(1,{id:'a',keys:true});s.setView({playhead:f(10)});s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[5,5],t:f(10)});run(1,{id:'a',keys:true,amount:100});
 assert.equal(L().transform.position.keys.length,2);assert.deepEqual(L().transform.position.keys[1].v,[100,0]);
 assert.throws(()=>run(1,{id:'a',keys:true}),(e:any)=>/already match/.test(e.message));
 for(const bad of [0,101,2.5])assert.throws(()=>run(1,{id:'a',amount:bad}),(e:any)=>e.expected===true);
});

test('P220 pose to pose: keys pose A at the playhead and pose B N frames later with the ease, one undo step, errors',async()=>{
 const {poseSpecs}=await import('./poseCommands');const {evaluate}=await import('./interpolate');
 const run=(i:number,p?:unknown)=>poseSpecs()[i].run(p) as unknown;const T=poseSpecs().findIndex(x=>x.id==='animation.pose.transition');assert.ok(T>0);
 const s=open();setAnimationSession(s);s.setView({playhead:0});s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const L=()=>findComp(s.document!).layers.find(l=>l.id==='b')!;
 run(0,{name:'A',layers:['b']});s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[100,0],t:0});s.dispatch({type:'prop.set',layer:'b',prop:'rotation',value:40,t:0});run(0,{name:'B',layers:['b']});
 s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[0,0],t:0});s.dispatch({type:'prop.set',layer:'b',prop:'rotation',value:0,t:0});
 s.setView({playhead:f(5)});const rev=s.document!.revision;
 run(T,{from:'a',to:'b',frames:10,ease:'linear'});
 const pk=L().transform.position.keys,rk=L().transform.rotation.keys;
 assert.equal(pk.length,2);assert.equal(pk[0].t,f(5));assert.deepEqual(pk[0].v,[960,540]);assert.equal(pk[1].t,f(15));assert.deepEqual(pk[1].v,[100,0]);assert.equal(pk[0].interp,'linear');
 assert.equal(rk.length,2);assert.equal(rk[1].v,40);assert.deepEqual(evaluate(L().transform.position,f(10)),[530,270]);
 s.undo();assert.equal(L().transform.position.keys.length,0);assert.equal(L().transform.rotation.keys.length,0);
 run(T,{from:'a',to:'b',frames:10});assert.equal(L().transform.position.keys[0].interp,'bezier');
 s.undo();
 for(const bad of [{from:'a',to:'a',frames:5},{from:'a',to:'nope',frames:5},{from:'a',to:'b',frames:0},{from:'a',to:'b',frames:601},{from:'a',to:'b',frames:600},{from:'a',to:'b',frames:5,ease:'nope'}])assert.throws(()=>run(T,bad),(e:any)=>e.expected===true||/must be|ease/i.test(e.message));
 assert.ok(rev>=0);
});
test('P222 orient to path: rotation follows the position heading, unwraps, replaces keys, validation, one undo step',async()=>{
 const {layerOrientSpecs,unwrapAngles,headingOf}=await import('./layerOrientCommands');const {evaluate}=await import('./interpolate');
 assert.deepEqual(unwrapAngles([170,-170,-150]),[170,190,210]);assert.equal(headingOf(0,0),null);assert.equal(headingOf(0,5),90);
 const run=(p?:unknown)=>layerOrientSpecs()[0].run(p) as unknown;
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const L=()=>findComp(s.document!).layers.find(l=>l.id==='b')!;
 assert.throws(()=>run({layers:['b']}),/animated position/);
 const f=(n:number)=>frameToTick(n,{num:30,den:1});
 s.dispatch({type:'key.add',layer:'b',prop:'position',t:f(0)});s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[0,0],t:f(0)});
 s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[100,0],t:f(10)});s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[100,100],t:f(20)});
 s.dispatch({type:'key.add',layer:'b',prop:'rotation',t:f(5)});s.dispatch({type:'prop.set',layer:'b',prop:'rotation',value:77,t:f(5)});
 const before=s.document;
 const r=run({layers:['b'],step:5}) as {layers:number};assert.equal(r.layers,1);
 const rot=L().transform.rotation;assert.ok(rot.keys.length>=4);
 assert.equal(rot.keys.some(k=>k.t===f(5)&&evaluate(rot,f(5))===77),false);
 assert.ok(Math.abs((evaluate(rot,f(2)) as number))<1);assert.ok(Math.abs((evaluate(rot,f(18)) as number)-90)<1);
 const r2=run({layers:['b'],step:5,offset:90});assert.ok(r2);assert.ok(Math.abs((evaluate(L().transform.rotation,f(18)) as number)-180)<1);
 s.undo();assert.ok(Math.abs((evaluate(L().transform.rotation,f(18)) as number)-90)<1);s.undo();assert.equal(s.document,before);
 assert.throws(()=>run({layers:['b'],step:0}),/key step/);assert.throws(()=>run({layers:['b'],offset:200}),/offset/);
 s.dispatch({type:'layer.update',layer:'b',locked:true});assert.throws(()=>run({layers:['b']}),/locked/);
});
test('P223 bake modifiers: wiggle and loop become keys over the work area, modifiers removed, one undo step, errors',async()=>{
 const {modifierBakeSpecs,bakeTicks}=await import('./modifierBakeCommands');const {evaluateMod}=await import('./modifiers');const {evaluate}=await import('./interpolate');
 const run=(p?:unknown)=>modifierBakeSpecs()[0].run(p) as unknown;
 const s=open();setAnimationSession(s);s.setView({playhead:0});s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const C=()=>findComp(s.document!),L=()=>C().layers.find(l=>l.id==='b')!;
 assert.throws(()=>run({layers:['b']}),/no wiggle/);
 s.dispatch({type:'modifier.add',layer:'b',prop:'position',modifier:{type:'wiggle',amplitude:20,frequency:2,seed:7}} as never);
 const want=bakeTicks(C(),2),before=s.document;
 const ref=want.map(t=>evaluateMod(L().transform.position,t) as number[]);
 const r=run({layers:['b'],step:2}) as {properties:number};assert.ok(r.properties>=1);
 const p=L().transform.position;assert.equal(p.keys.length,want.length);assert.equal((p.modifiers??[]).length,0);
 want.forEach((t,i)=>{const v=evaluate(p,t) as number[];assert.ok(Math.abs(v[0]-ref[i][0])<0.01&&Math.abs(v[1]-ref[i][1])<0.01);});
 s.undo();assert.equal(s.document,before);
 assert.throws(()=>run({layers:['b'],step:0}),/key step/);
 s.dispatch({type:'layer.update',layer:'b',locked:true});assert.throws(()=>run({layers:['b']}),/locked/);
});
test('P224 export crop from layers: union over the work area with padding, clamped, unsized layers, errors',async()=>{
 const {exportCropSpecs,layerCrop,workAreaTicks}=await import('./exportCropCommands');const {exportState,resetExportSettings}=await import('./exportJob');
 const run=(p?:unknown)=>exportCropSpecs()[0].run(p) as {x:number;y:number;width:number;height:number};
 const s=open();setAnimationSession(s);s.setView({playhead:0});resetExportSettings();
 s.dispatch({type:'layer.add',kind:'solid',id:'b'});const c=findComp(s.document!);
 const l=c.layers.find(x=>x.id==='b')!;assert.ok(workAreaTicks(c).length>=2);
 s.dispatch({type:'layer.update',layer:'b',source:{...l.source,width:100,height:50}} as never);
 s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[300,200],t:0});s.dispatch({type:'prop.set',layer:'b',prop:'anchor',value:[0,0],t:0});
 const r=run({layers:['b'],padding:10,range:'frame'});assert.deepEqual([r.width,r.height],[120,70]);assert.deepEqual([r.x,r.y],[290,190]);
 assert.deepEqual(exportState().settings.crop,{x:290,y:190,width:120,height:70});
 const c2=findComp(s.document!);const big=layerCrop(c2,['b'],[0],5000);assert.deepEqual(big.crop,{x:0,y:0,width:c2.width,height:c2.height});
 assert.throws(()=>run({layers:['b'],padding:-1}),/padding/);assert.throws(()=>run({layers:['b'],range:'x'}),/range/);
 assert.equal(layerCrop(c2,['nope'],[0],0).crop,null);
});
test('P225 mirrored poses: apply flips x about canvas or pose centre and negates rotation, transition to a mirrored copy, errors',async()=>{
 const {poseSpecs,mirrorValue,mirrorAxis}=await import('./poseCommands');const {evaluate}=await import('./interpolate');
 assert.deepEqual(mirrorValue('position',[100,50],400),[700,50]);assert.equal(mirrorValue('rotation',25,0),-25);assert.equal(mirrorValue('rotation',0,0),0);assert.deepEqual(mirrorValue('scale',[1,2],9),[1,2]);
 const W=findComp(open().document!).width;const run=(i:number,p?:unknown)=>poseSpecs()[i].run(p) as unknown;
 const s=open();setAnimationSession(s);s.setView({playhead:0});s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const L=()=>findComp(s.document!).layers.find(l=>l.id==='b')!;
 s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[100,50],t:0});s.dispatch({type:'prop.set',layer:'b',prop:'rotation',value:30,t:0});
 run(0,{name:'A',layers:['b']});const pose=s.document!.poses!.items[0];assert.equal(mirrorAxis(findComp(s.document!),pose,'pose'),100);
 run(1,{id:'a',mirror:'canvas'});assert.deepEqual(evaluate(L().transform.position,0),[W-100,50]);assert.equal(evaluate(L().transform.rotation,0),-30);
 s.undo();assert.deepEqual(evaluate(L().transform.position,0),[100,50]);
 run(1,{id:'a',mirror:'pose'});assert.deepEqual(evaluate(L().transform.position,0),[100,50]);assert.equal(evaluate(L().transform.rotation,0),-30);
 s.undo();
 assert.throws(()=>run(1,{id:'a',mirror:'x'}),/Mirror/);
 assert.throws(()=>run(3,{from:'a',to:'a',frames:6}),/different/);
 run(3,{from:'a',to:'a',frames:6,mirror:'canvas'});
 const f=(n:number)=>frameToTick(n,{num:30,den:1});
 assert.deepEqual(evaluate(L().transform.position,f(0)),[100,50]);assert.deepEqual(evaluate(L().transform.position,f(6)),[W-100,50]);assert.equal(evaluate(L().transform.rotation,f(6)),-30);
});
test('P226 layer array: grid and circle offsets, copies placed, keyed positions move, one undo step, errors',async()=>{
 const {layerArraySpecs,arrayOffsets}=await import('./layerArrayCommands');const {evaluate}=await import('./interpolate');
 const g=arrayOffsets('grid',5,{columns:2,dx:10,dy:20});assert.deepEqual(g.map(o=>[o.x,o.y]),[[0,0],[10,0],[0,20],[10,20],[0,40]]);
 const ci=arrayOffsets('circle',4,{radius:100,rotate:true});assert.deepEqual([ci[0].x,ci[0].y,ci[0].rot],[0,0,0]);assert.deepEqual([ci[2].x,ci[2].y,ci[2].rot],[0,200,180]);
 const run=(p?:unknown)=>layerArraySpecs()[0].run(p) as unknown;
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const C=()=>findComp(s.document!);const n0=C().layers.length,before=s.document;
 s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[100,100],t:0});const b1=s.document;
 const r=run({layers:['b'],pattern:'grid',count:4,columns:2,dx:50,dy:60}) as {layers:number};assert.equal(r.layers,3);assert.equal(C().layers.length,n0+3);
 const pos=C().layers.filter(l=>l.name.endsWith('copy')).map(l=>evaluate(l.transform.position,0) as number[]).map(v=>v.join(',')).sort();assert.deepEqual(pos,['100,160','150,100','150,160']);
 s.undo();assert.equal(s.document,b1);
 s.dispatch({type:'key.add',layer:'b',prop:'position',t:0});s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[10,10],t:8000*10});
 run({layers:['b'],pattern:'circle',count:3,radius:50});const cp=C().layers.filter(l=>l.name.endsWith('copy'));assert.equal(cp.length,2);assert.ok(cp.every(l=>l.transform.position.keys.length===2));
 assert.throws(()=>run({layers:['b','a'],pattern:'grid',count:3}),/exactly one/);assert.throws(()=>run({layers:['b'],pattern:'grid',count:1}),/2 to/);assert.throws(()=>run({layers:['b'],pattern:'x',count:3}),/pattern/);
 s.dispatch({type:'layer.update',layer:'b',locked:true});assert.throws(()=>run({layers:['b'],pattern:'grid',count:3}),/locked/);
 void before;
});
test('P227 export check: missing image, offscreen, inactive, hidden and audio layers, crop frame',async()=>{
 const {preflight}=await import('./exportPreflight');const {exportCheck}=await import('./exportCheck');const {defaultExportSettings}=await import('./exportSettings');
 const s=open();setAnimationSession(s);
 for(const id of ['r','o','h','au','late'])s.dispatch({type:'layer.add',kind:'shape',id} as never);
 const C=()=>findComp(s.document!);const comp0=C();const range={in:comp0.workArea.in,out:comp0.workArea.out};
 const mk=(id:string,o:object)=>({...C().layers.find(l=>l.id===id)!,...o});
 const layers=[mk('r',{name:'R',kind:'raster',source:{assetId:'nope'}}),mk('o',{name:'O'}),mk('h',{name:'H',visible:false}),mk('au',{name:'AU',kind:'audio'}),mk('late',{name:'Late',inT:range.out+10,outT:range.out+20})] as never[];
 const box=(x:number)=>[{x0:x,y0:0,x1:x+10,y1:10}];
 const issues=preflight({layers,assetIds:new Set(),range,frame:{x:0,y:0,width:100,height:100},boxes:l=>l.id==='o'?box(500):[]});
 const by=Object.fromEntries(issues.map(i=>[i.code,i]));
 assert.equal(by.asset.severity,'error');assert.deepEqual(by.asset.layers,['R']);assert.deepEqual(by.offscreen.layers,['O']);assert.deepEqual(by.inactive.layers,['Late']);assert.deepEqual(by.hidden.layers,['H']);assert.deepEqual(by.audio.layers,['AU']);
 assert.equal(preflight({layers:[],assetIds:new Set(),range,frame:{x:0,y:0,width:1,height:1},boxes:()=>[]}).length,0);
 const hit=preflight({layers:[layers[1]],assetIds:new Set(),range,frame:{x:495,y:0,width:50,height:50},boxes:()=>box(500)});assert.equal(hit.length,0);
 const live=exportCheck(C(),s.document!.assets,defaultExportSettings());assert.ok(Array.isArray(live));
 const crop=exportCheck(C(),s.document!.assets,{...defaultExportSettings(),crop:{x:0,y:0,width:1,height:1}});assert.ok(crop.some(i=>i.code==='offscreen')||crop.length>=0);
});
test('P227 export check ignores null layers',async()=>{
 const {preflight}=await import('./exportPreflight');
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'null',id:'n'} as never);
 const l=findComp(s.document!).layers.find(x=>x.id==='n')!;const range={in:0,out:100000};
 assert.equal(preflight({layers:[{...l,visible:false},{...l,inT:1e9,outT:2e9}],assetIds:new Set(),range,frame:{x:0,y:0,width:10,height:10},boxes:()=>[{x0:500,y0:0,x1:510,y1:10}]}).length,0);
});
test('P228 close loop: end key gets the start value, equal values skipped, keys past the end skipped, undo, errors',async()=>{
 const {layerLoopSpecs,loopEnd}=await import('./layerLoopCommands');const {evaluate}=await import('./interpolate');
 const run=(p?:unknown)=>layerLoopSpecs()[0].run(p) as {properties:number};
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const C=()=>findComp(s.document!),L=()=>C().layers.find(l=>l.id==='b')!;const T=8000,t0=C().workArea.in,t1=loopEnd(C());
 assert.throws(()=>run({layers:['b']}),/has keys/);
 s.dispatch({type:'key.add',layer:'b',prop:'position',t:t0});s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[10,20],t:t0});s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[300,20],t:t0+10*T});
 s.dispatch({type:'key.add',layer:'b',prop:'rotation',t:t0});s.dispatch({type:'prop.set',layer:'b',prop:'rotation',value:5,t:t0});
 const before=s.document;const r=run({layers:['b']});assert.ok(r.properties>=1);
 assert.deepEqual(evaluate(L().transform.position,t1),[10,20]);assert.equal(L().transform.position.keys.some(k=>k.t===t1),true);assert.equal(L().transform.rotation.keys.length,1);
 assert.throws(()=>run({layers:['b']}),/already equal/);
 s.undo();assert.equal(s.document,before);
 s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[1,1],t:t1+T});assert.throws(()=>run({layers:['b']}),/past the end/);
 s.dispatch({type:'layer.update',layer:'b',locked:true});assert.throws(()=>run({layers:['b']}),/locked/);
});
test('P229 palette: colours with use counts, replace in fills and strokes in one undo step, locked kept, errors',async()=>{
 const {paletteOf,recolor}=await import('./palette');const {paletteSpecs}=await import('./paletteCommands');
 const run=(p?:unknown)=>paletteSpecs()[0].run(p) as {layers:number};
 const s=open();setAnimationSession(s);
 for(const id of ['p','q','r'])s.dispatch({type:'layer.add',kind:'shape',id} as never);
 for(const [id,c] of [['p','#ff0000'],['q','#FF0000'],['r','#00ff00']])s.dispatch({type:'layer.update',layer:id,source:{color:c}} as never);
 s.dispatch({type:'layer.stroke',layer:'r',stroke:{color:'#ff0000',width:2}} as never);
 const C=()=>findComp(s.document!),L=(id:string)=>C().layers.find(l=>l.id===id)!;
 const red=paletteOf(C().layers).find(x=>x.color==='#ff0000')!;assert.equal(red.layers,3);assert.ok(paletteOf(C().layers).length<=12);
 const before=s.document;
 s.dispatch({type:'layer.update',layer:'q',locked:true} as never);
 assert.equal(recolor(C().layers,'#ff0000','#0000ff').length,2);
 const r=run({from:'#ff0000',to:'#0000FF'});assert.equal(r.layers,2);
 assert.equal(L('p').source.color,'#0000ff');assert.equal(L('q').source.color,'#FF0000');assert.equal(L('r').stroke!.color,'#0000ff');assert.equal(L('r').source.color,'#00ff00');
 s.undo();assert.equal(L('p').source.color,'#ff0000');assert.equal(L('r').stroke!.color,'#ff0000');
 assert.throws(()=>run({from:'red',to:'#000000'}),/#rrggbb/);assert.throws(()=>run({from:'#ff0000',to:'#FF0000'}),/same/);assert.throws(()=>run({from:'#123456',to:'#000000'}),/No layer/);
 void before;
});
test('P230 squash and stretch: factors keep volume, keys follow speed, base scale kept, replace, undo, errors',async()=>{
 const {layerSquashSpecs,squashFactors}=await import('./layerSquashCommands');const {evaluate}=await import('./interpolate');
 assert.deepEqual(squashFactors(0,0,60),{x:1,y:1});const f=squashFactors(0,30,100);assert.ok(f.y>1&&f.x<1);assert.ok(Math.abs(f.x*f.y-1)<0.02);
 const g=squashFactors(30,0,100);assert.ok(g.x>1&&g.y<1);const big=squashFactors(0,9999,100);assert.ok(big.y<=Math.sqrt(2)+0.01);
 const run=(p?:unknown)=>layerSquashSpecs()[0].run(p) as {layers:number};
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const C=()=>findComp(s.document!),L=()=>C().layers.find(l=>l.id==='b')!;const T=8000;
 assert.throws(()=>run({layers:['b']}),/animated position/);
 s.dispatch({type:'key.add',layer:'b',prop:'position',t:0});s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[100,0],t:0});s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[100,600],t:10*T});
 s.dispatch({type:'key.add',layer:'b',prop:'scale',t:5*T});s.dispatch({type:'prop.set',layer:'b',prop:'scale',value:[50,50],t:5*T});
 const before=s.document;run({layers:['b'],amount:100,step:2});
 const sc=L().transform.scale;const mid=evaluate(sc,5*T) as number[];assert.ok(mid[1]>mid[0]);assert.ok(sc.keys.length>=5);assert.equal(sc.keys.some(k=>k.t===5*T&&k.v[0]===50&&k.v[1]===50),false);
 s.undo();assert.equal(s.document,before);
 assert.throws(()=>run({layers:['b'],amount:0}),/amount/);assert.throws(()=>run({layers:['b'],step:0}),/key step/);
 s.dispatch({type:'layer.update',layer:'b',locked:true});assert.throws(()=>run({layers:['b']}),/locked/);
});
test('P231 comp resize with content: fit/fill/center maths, keyed and static layers, children follow, one undo step, errors',async()=>{
 const {compResizeSpecs,resizeScale}=await import('./compResizeCommands');const {evaluate}=await import('./interpolate');
 assert.equal(resizeScale(800,450,1080,1080,'fit'),1.35);assert.equal(resizeScale(800,450,1080,1080,'fill'),2.4);assert.equal(resizeScale(800,450,1080,1080,'center'),1);
 const run=(p?:unknown)=>compResizeSpecs()[0].run(p) as {layers:number;scale:number};
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});s.dispatch({type:'layer.add',kind:'shape',id:'c'});
 const C=()=>findComp(s.document!),L=(id:string)=>C().layers.find(l=>l.id===id)!;
 const W=C().width,H=C().height;
 s.dispatch({type:'prop.set',layer:'b',prop:'position',value:[W/2+100,H/2],t:0});s.dispatch({type:'prop.set',layer:'b',prop:'scale',value:[100,100],t:0});
 s.dispatch({type:'layer.parent',layer:'c',parent:'b'} as never);
 const before=s.document;
 const r=run({width:W*2,height:H*2,mode:'fit'});assert.equal(r.scale,200);
 assert.equal(C().width,W*2);assert.deepEqual(evaluate(L('b').transform.position,0),[W+200,H]);assert.deepEqual(evaluate(L('b').transform.scale,0),[200,200]);
 s.undo();assert.equal(s.document,before);
 run({width:W+100,height:H,mode:'center'});assert.deepEqual(evaluate(L('b').transform.position,0),[W/2+100+50,H/2]);assert.deepEqual(evaluate(L('b').transform.scale,0),[100,100]);
 assert.throws(()=>run({width:W+100,height:H,mode:'center'}),/already/);assert.throws(()=>run({width:0,height:5,mode:'fit'}),/whole pixels/);assert.throws(()=>run({width:5,height:5,mode:'x'}),/mode/);
 s.dispatch({type:'layer.update',layer:'b',locked:true});assert.throws(()=>run({width:10,height:10,mode:'fit'}),/Unlock/);
});
test('P232 polygon and star shape layers: points, valid source, centred, one undo step, errors',async()=>{
 const {polygonPath}=await import('./polygonModel');const {polygonSpecs}=await import('./polygonCommands');const {validateDocument}=await import('./model');
 const tri=polygonPath(3,false,50);assert.equal(tri.points.length,3);assert.deepEqual(tri.points[0],{x:0.5,y:0});
 const st=polygonPath(5,true,40);assert.equal(st.points.length,10);assert.ok(Math.abs(st.points[1].y-(0.5+0.5*0.4*Math.sin(-Math.PI/2+Math.PI/5)))<1e-3);
 const run=(p?:unknown)=>polygonSpecs()[0].run(p) as {id:string};
 const s=open();setAnimationSession(s);const C=()=>findComp(s.document!),n0=C().layers.length,before=s.document;
 const r=run({sides:6,radius:100});const l=C().layers.find(x=>x.id===r.id)!;
 assert.equal(C().layers.length,n0+1);assert.equal(l.source.width,200);assert.equal(l.source.path!.points.length,6);assert.deepEqual(l.transform.position.value,[C().width/2-100,C().height/2-100]);assert.deepEqual(validateDocument(s.document),[]);
 s.undo();assert.equal(s.document,before);
 run({sides:5,star:true,inner:40});assert.equal(C().layers.length,n0+1);assert.equal(C().layers[0].source.path!.points.length,10);
 assert.throws(()=>run({sides:2}),/sides/);assert.throws(()=>run({sides:5,inner:5}),/inner/);assert.throws(()=>run({sides:5,radius:1}),/radius/);assert.throws(()=>run({sides:5,color:'red'}),/Colour/);
});
test('P233 snap keys to markers: nearest marker, max distance, one undo step, errors',async()=>{
 const {keyMarkerSpecs}=await import('./keyMarkerCommands');const run=keyMarkerSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);const c0=findComp(s.document!)!;const l=c0.layers[0].id;
 assert.throws(()=>run({}),/markers/i);
 s.dispatch({type:'markers.set',markers:[{id:'m1',t:c0.start+f(10),label:'a'},{id:'m2',t:c0.start+f(30),label:'b'}]});
 s.dispatch({type:'key.add',layer:l,prop:'rotation',t:c0.start+f(13)} as never);
 s.dispatch({type:'key.add',layer:l,prop:'rotation',t:c0.start+f(24)} as never);
 const ts=()=>findComp(s.document!)!.layers.find(x=>x.id===l)!.transform.rotation.keys.map(k=>k.t).sort((a,b)=>a-b);
 const sel=()=>s.selectKeys([{layer:l,prop:'rotation',t:c0.start+f(13)},{layer:l,prop:'rotation',t:c0.start+f(24)}]);
 sel();assert.throws(()=>run({maxFrames:2}),/close to a marker/);
 run({maxFrames:3});assert.deepEqual(ts(),[c0.start+f(10),c0.start+f(24)]);
 s.undo();assert.deepEqual(ts(),[c0.start+f(13),c0.start+f(24)]);
 sel();run({});assert.deepEqual(ts(),[c0.start+f(10),c0.start+f(30)]);
 assert.throws(()=>run({}),/already/);
});

test('P234 work area to the section between markers at the playhead, one undo step, errors',async()=>{
 const {markerWorkAreaSpecs}=await import('./markerWorkAreaCommands');const run=markerWorkAreaSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);const c0=findComp(s.document!)!;
 assert.throws(()=>run({}),/markers/i);
 s.dispatch({type:'markers.set',markers:[{id:'m1',t:f(10),label:'a'},{id:'m2',t:f(30),label:'b'}]});
 const wa=()=>findComp(s.document!)!.workArea;
 s.setView({playhead:f(15)});run({layers:['x']});assert.deepEqual([wa().in,wa().out],[f(10),f(30)]);
 assert.throws(()=>run({}),/already/);
 s.undo();assert.deepEqual([wa().in,wa().out],[c0.workArea.in,c0.workArea.out]);
 s.setView({playhead:f(2)});run({});assert.deepEqual([wa().in,wa().out],[0,f(10)]);
 s.setView({playhead:f(40)});run({});assert.deepEqual([wa().in,wa().out],[f(30),c0.duration]);
});

test('P235 layer time stretch: keys and out point scale about the in point, one undo step, refusals',async()=>{
 const {layerStretchSpecs}=await import('./layerStretchCommands');const run=layerStretchSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);const c0=findComp(s.document!)!;const L0=c0.layers.find(l=>l.transform.position.keys.length>1)!;
 const get=()=>findComp(s.document!)!.layers.find(l=>l.id===L0.id)!;
 const k0=L0.transform.position.keys.map(k=>k.t),span=L0.outT-L0.inT;
 run({percent:50,layers:[L0.id]});
 const l1=get();assert.equal(l1.inT,L0.inT);assert.ok(Math.abs((l1.outT-l1.inT)-span/2)<=frameToTick(1,{num:30,den:1}));
 assert.ok(l1.transform.position.keys.every((k,i)=>Math.abs(k.t-(L0.inT+(k0[i]-L0.inT)/2))<=frameToTick(1,{num:30,den:1})));
 s.undo();assert.deepEqual(get().transform.position.keys.map(k=>k.t),k0);assert.equal(get().outT,L0.outT);
 assert.throws(()=>run({percent:100,layers:[L0.id]}),/percent/);assert.throws(()=>run({percent:5,layers:[L0.id]}),/percent/);
 assert.throws(()=>run({percent:1000,layers:[L0.id]}),/No layer|leave/);
});

test('P236 Lottie export: layers, keys with easing, parenting, flat fills and a list of what is left out',async()=>{
 const {lottieFromComposition}=await import('./lottie');const {exportLottieFile}=await import('./exportSvg');
 const s=open();const c=findComp(s.document!)!;
 const r=lottieFromComposition(c),j=JSON.parse(r.json);
 assert.equal(j.v,'5.7.4');assert.equal(j.w,c.width);assert.equal(j.h,c.height);assert.equal(j.fr,30);assert.equal(j.op,Math.round(c.duration*30/240000));
 assert.ok(Array.isArray(j.layers)&&j.layers.length===r.layers&&r.layers>=1);
 const inds=j.layers.map((l:{ind:number})=>l.ind);assert.equal(new Set(inds).size,inds.length);
 for(const l of j.layers){assert.ok([1,3,4].includes(l.ty));assert.ok(l.ks&&l.ks.o&&l.ks.p&&l.ks.a&&l.ks.s&&l.ks.r);if(l.parent!==undefined)assert.ok(inds.includes(l.parent));}
 const text=c.layers.find(l=>l.kind==='text');if(text)assert.ok(r.left.includes('text')||c.layers.some(l=>l.parent===text.id));
 const kf=j.layers.flatMap((l:{ks:{p:{a:number;k:{t:number;s:number[];o?:{x:number[]};i?:{x:number[]}}[]}}})=>l.ks.p.a?l.ks.p.k:[]);
 assert.ok(kf.length>=2);assert.ok(kf.every((k:{t:number;s:number[]})=>typeof k.t==='number'&&k.s.length===3));
 assert.ok(kf.some((k:{o?:unknown;h?:number})=>k.o||k.h));
 const f=exportLottieFile(c,'My anim');assert.equal(f.fileName,'My_anim.json');assert.ok(f.blob.size>100);
 assert.throws(()=>exportLottieFile({...c,layers:c.layers.filter(l=>l.kind==='text')},'x'),/Lottie/);
});

test('P237 auto-key: off by default, static properties get one key at the playhead, one undo step, keyed ones are untouched',async()=>{
 const {setAutoKey,autoKeyOn}=await import('./autoKey');
 const s=open();setAnimationSession(s);const c0=findComp(s.document!)!;
 const L=c0.layers.find(l=>!l.transform.rotation.keys.length&&l.kind!=='audio')!;const get=()=>findComp(s.document!)!.layers.find(l=>l.id===L.id)!.transform.rotation;
 const t=c0.start+f(12);
 try{
  assert.equal(autoKeyOn(),false);
  s.dispatch(s.autoKeyed([{type:'prop.set',layer:L.id,prop:'rotation',value:30,t}]));
  assert.equal(get().keys.length,0);assert.equal(get().value,30);s.undo();
  setAutoKey(true);
  s.previewEdits([{type:'prop.set',layer:L.id,prop:'rotation',t,value:45}]);s.commitPreview();
  assert.deepEqual(get().keys.map(k=>[k.t,k.v]),[[t,45]]);
  s.undo();assert.equal(get().keys.length,0);
  s.dispatch(s.autoKeyed([{type:'prop.set',layer:L.id,prop:'rotation',value:10,t}]));
  const t2=c0.start+f(20);s.dispatch(s.autoKeyed([{type:'prop.set',layer:L.id,prop:'rotation',value:20,t:t2}]));
  assert.deepEqual(get().keys.map(k=>[k.t,k.v]),[[t,10],[t2,20]]);
 }finally{setAutoKey(false);}
 assert.equal(autoKeyOn(),false);
});

test('P238 send layers to another composition: copy keeps the original, move removes it, parents follow, misfits are skipped, one undo step',async()=>{
 const {layerSendSpecs}=await import('./layerSendCommands');const run=layerSendSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);const src0=findComp(s.document!)!;
 s.dispatch({type:'comp.add',id:'other',settings:{name:'Other'} as never});
 s.dispatch({type:'comp.select',comp:src0.id} as never);
 const src=findComp(s.document!)!;assert.equal(src.id,src0.id);
 const kids=src.layers.filter(l=>l.kind!=='audio'&&l.kind!=='comp').slice(0,2).map(l=>l.id);
 const other=()=>s.document!.compositions.find(c=>c.id==='other')!;
 const n0=other().layers.length;
 const r=run({comp:'other',layers:kids}) as {sent:number;skipped:number};
 assert.equal(r.sent+r.skipped,kids.length);assert.ok(r.sent>0,'at least one layer fits');assert.equal(other().layers.length,n0+r.sent);
 assert.equal(findComp(s.document!)!.layers.length,src.layers.length);
 assert.ok(other().layers.slice(0,r.sent).every(l=>!kids.includes(l.id)));
 s.undo();assert.equal(other().layers.length,n0);
 if(r.sent){const m=run({comp:'other',layers:kids,move:true}) as {sent:number};assert.equal(findComp(s.document!)!.layers.length,src.layers.length-m.sent);s.undo();assert.equal(findComp(s.document!)!.layers.length,src.layers.length);}
 assert.throws(()=>run({comp:src.id,layers:kids}),/different/);assert.throws(()=>run({comp:'nope',layers:kids}),/another/);
});

test('P240 camera: null at the centre, all unlocked top level layers hang from it, moves key it over the work area, one undo step each',async()=>{
 const {cameraSpecs,findCamera}=await import('./cameraCommands');const [add,move]=cameraSpecs().map(x=>x.run as (p?:unknown)=>unknown);
 const s=open();setAnimationSession(s);const c0=findComp(s.document!)!;
 assert.throws(()=>move({move:'pushIn'}),/camera first/i);
 const roots=c0.layers.filter(l=>l.parent===null&&!l.locked).map(l=>l.id);
 const r=add({}) as {id:string;attached:number};assert.equal(r.attached,roots.length);
 let c=findComp(s.document!)!;const cam=findCamera(c)!;assert.equal(cam.id,r.id);assert.deepEqual(cam.transform.position.value,[c0.width/2,c0.height/2]);assert.deepEqual(cam.transform.anchor.value,[c0.width/2,c0.height/2]);
 for(const id of roots)assert.equal(c.layers.find(l=>l.id===id)!.parent,cam.id);
 assert.throws(()=>add({}),/already/);
 move({move:'pushIn',amount:30});c=findComp(s.document!)!;const sc=findCamera(c)!.transform.scale.keys;
 assert.deepEqual(sc.map(k=>[k.t,k.v]),[[c.workArea.in,[100,100]],[c.workArea.out,[130,130]]]);
 s.undo();assert.equal(findCamera(findComp(s.document!)!)!.transform.scale.keys.length,0);
 move({move:'panLeft'});assert.equal(findCamera(findComp(s.document!)!)!.transform.position.keys.length,2);
 assert.throws(()=>move({move:'nope'}),/Unknown/);assert.throws(()=>move({move:'pushIn',amount:500}),/amount/);
 s.undo();s.undo();assert.equal(findCamera(findComp(s.document!)!),undefined);
 assert.equal(findComp(s.document!)!.layers.every(l=>l.parent===c0.layers.find(x=>x.id===l.id)?.parent),true);
});

test('P241 camera follow: the followed layer stays put in frame, linear keys, bounded, one undo step',async()=>{
 const {cameraSpecs,findCamera,MAX_FOLLOW_KEYS}=await import('./cameraCommands');const {worldMatrix}=await import('./scene');
 const specs=cameraSpecs(),add=specs[0].run as (p?:unknown)=>unknown,follow=specs[2].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);let c=findComp(s.document!)!;
 assert.throws(()=>follow({}),/camera first/i);add({});c=findComp(s.document!)!;
 const title=c.layers.find(l=>l.id==='a')!;s.dispatch([{type:'key.add',layer:'a',prop:'position',t:f(0)},{type:'key.add',layer:'a',prop:'position',t:f(30)},{type:'prop.set',layer:'a',prop:'position',t:f(30),value:[300,200] as never}]);
 assert.throws(()=>follow({layer:findCamera(c)!.id}),/itself/);
 s.setView({selectedLayer:title.id});const r=follow({}) as {keys:number};assert.ok(r.keys>=2&&r.keys<=MAX_FOLLOW_KEYS);
 c=findComp(s.document!)!;const cam=findCamera(c)!,tl=c.layers.find(l=>l.id===title.id)!;
 assert.ok(cam.transform.position.keys.length===r.keys&&cam.transform.position.keys.every(k=>k.interp==='linear'));
 const an=tl.transform.anchor.value as unknown as number[];const pt=(t:number)=>{const m=worldMatrix(c,tl,t);return [m[0]*an[0]+m[2]*an[1]+m[4],m[1]*an[0]+m[3]*an[1]+m[5]];};
 const p0=pt(c.workArea.in);for(const t of [c.workArea.out,Math.round(c.workArea.out/2)]){const p=pt(t);assert.ok(Math.abs(p[0]-p0[0])<1.5&&Math.abs(p[1]-p0[1])<1.5,`${t}: ${p} vs ${p0}`);}
 s.undo();assert.equal(findCamera(findComp(s.document!)!)!.transform.position.keys.length,0);
});

test('P242 camera shake and reset: seeded, bounded, rest at the ends, reset clears keys, one undo step each',async()=>{
 const {cameraSpecs,findCamera,MAX_FOLLOW_KEYS}=await import('./cameraCommands');
 const sp=cameraSpecs(),add=sp[0].run as (p?:unknown)=>unknown,move=sp[1].run as (p?:unknown)=>unknown,shake=sp[3].run as (p?:unknown)=>unknown,reset=sp[4].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);assert.throws(()=>shake({}),/camera first/i);add({});
 assert.throws(()=>shake({amount:0}),/1 to 100/);
 shake({amount:10});let c=findComp(s.document!)!;let cam=findCamera(c)!;const ks=cam.transform.position.keys;
 assert.ok(ks.length>=3&&ks.length<=MAX_FOLLOW_KEYS+1);assert.deepEqual(ks[0].v,[c.width/2,c.height/2]);assert.deepEqual(ks[ks.length-1].v,[c.width/2,c.height/2]);
 assert.ok(ks.every(k=>Math.abs((k.v as number[])[0]-c.width/2)<=10&&Math.abs((k.v as number[])[1]-c.height/2)<=10));
 const first=JSON.stringify(ks.map(k=>k.v));s.undo();assert.equal(findCamera(findComp(s.document!)!)!.transform.position.keys.length,0);
 shake({amount:10});assert.equal(JSON.stringify(findCamera(findComp(s.document!)!)!.transform.position.keys.map(k=>k.v)),first);
 move({move:'pushIn'});reset({});cam=findCamera(findComp(s.document!)!)!;
 assert.equal(cam.transform.position.keys.length+cam.transform.scale.keys.length,0);assert.deepEqual(cam.transform.scale.value,[100,100]);assert.deepEqual(cam.transform.position.value,[c.width/2,c.height/2]);
 assert.throws(()=>reset({}),/no keys/);
 s.undo();assert.equal(findCamera(findComp(s.document!)!)!.transform.scale.keys.length,2);
});

test('P243 layer labels: set, clear, validated, locked-safe, one undo step; old files unchanged',async()=>{
 const {layerLabelSpecs}=await import('./layerLabelCommands');const {validateDocument}=await import('./model');
 const label=layerLabelSpecs()[0].run as (p?:unknown)=>unknown;const s=open();setAnimationSession(s);const c0=findComp(s.document!)!;
 assert.ok(c0.layers.every(l=>l.label===undefined));
 const ids=c0.layers.map(l=>l.id);assert.throws(()=>label({label:'pink',layers:ids}),/Unknown/);
 label({label:'red',layers:ids});let c=findComp(s.document!)!;assert.ok(c.layers.every(l=>l.label==='red'));validateDocument(s.document!);
 assert.throws(()=>label({label:'red',layers:ids}),/already/);
 label({label:'blue',layers:[ids[0]]});c=findComp(s.document!)!;assert.equal(c.layers[0].label,'blue');assert.equal(c.layers[1]?.label??'red','red');
 s.undo();assert.equal(findComp(s.document!)!.layers[0].label,'red');
 label({label:'none',layers:ids});c=findComp(s.document!)!;assert.ok(c.layers.every(l=>!('label' in l)));
 assert.throws(()=>s.dispatch([{type:'layer.label',layers:['nope'],label:'red'}]),/./);
});

test('P244 timeline layer filter: words match name, kind and label; empty matches all; bounded',async()=>{
 const {layerMatches,MAX_FILTER_LENGTH}=await import('./layerFilter');
 const l={name:'Somnia / Title',kind:'text' as const,label:'red' as const};
 assert.ok(layerMatches(l,'')&&layerMatches(l,'   ')&&layerMatches(l,'title')&&layerMatches(l,'SOMNIA text')&&layerMatches(l,'red'));
 assert.ok(!layerMatches(l,'blue')&&!layerMatches(l,'title blue')&&!layerMatches({...l,label:undefined},'red'));
 assert.ok(layerMatches(l,'x'.repeat(MAX_FILTER_LENGTH+50))===false);
});

test('P245 spring modifier: rings out after the last key, continuous, decays, validated, bakeable, one undo step',async()=>{
 const {evaluateMod}=await import('./modifiers');const {validateModifiers}=await import('./modifierModel');
 const s=open();setAnimationSession(s);const c=findComp(s.document!)!;const l=c.layers.find(x=>x.id==='a')!;
 s.dispatch([{type:'key.add',layer:'a',prop:'opacity',t:f(0)},{type:'key.add',layer:'a',prop:'opacity',t:f(10)},{type:'prop.set',layer:'a',prop:'opacity',t:f(0),value:0},{type:'prop.set',layer:'a',prop:'opacity',t:f(10),value:100}]);
 const m={type:'spring' as const,amplitude:50,frequency:2,damping:4};
 assert.deepEqual(validateModifiers([m]),[]);assert.ok(validateModifiers([{...m,frequency:0}]).length&&validateModifiers([{...m,damping:99}]).length&&validateModifiers([{...m,amplitude:301}]).length);
 s.dispatch([{type:'modifier.add',layer:'a',prop:'opacity',modifier:m}]);
 const p=findComp(s.document!)!.layers.find(x=>x.id==='a')!.transform.opacity;
 assert.equal(evaluateMod(p,f(10)),100);assert.equal(evaluateMod(p,f(5)),evaluateMod({...p,modifiers:undefined},f(5)));
 const tq=f(10)+24000;assert.ok((evaluateMod(p,tq) as number)>100,'overshoots first');
 const late=evaluateMod(p,f(10)+2400000) as number;assert.ok(Math.abs(late-100)<0.05,`settles: ${late}`);
 let peak=0;for(let i=1;i<200;i++)peak=Math.max(peak,Math.abs((evaluateMod(p,f(10)+i*1200) as number)-100));assert.ok(peak<=50.001&&peak>10,`peak ${peak}`);
 const one=s.document!;s.dispatch([{type:'modifier.remove',layer:'a',prop:'opacity',index:0}]);s.undo();assert.deepEqual(s.document,one);
 assert.ok(l);
});

test('P246 unpack precomp: same picture, group null keeps the precomp transform, stack order kept, blockers explained, one undo step',async()=>{
 const {precompUnpackSpecs}=await import('./precompUnpackCommands');const {worldMatrix,multiplyMatrix}=await import('./scene');
 const unpack=precompUnpackSpecs()[0].run as (p?:unknown)=>unknown;
 const d0=applyEdits(base(),[{type:'layer.add',kind:'shape',id:'b'},{type:'layer.parent',layer:'b',parent:'a'},{type:'layer.add',kind:'solid',id:'top'},{type:'layer.add',kind:'solid',id:'low'},{type:'layer.reorder',layer:'low',index:3},{type:'precomp.make',layers:['a','b'],id:'pc',compId:'pcc',name:'Group'},{type:'prop.set',layer:'pc',prop:'position',t:f(0),value:[330,220]},{type:'prop.set',layer:'pc',prop:'rotation',t:f(0),value:12}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);
 const parent0=findComp(s.document!)!,child=s.document!.compositions.find(x=>x.id==='pcc')!;
 const times=[f(0),f(4),f(10)];
 const before=(id:string,t:number)=>multiplyMatrix(worldMatrix(parent0,parent0.layers.find(l=>l.id==='pc')!,t),worldMatrix(child,child.layers.find(l=>l.id===id)!,t));
 const order0=parent0.layers.map(l=>l.id);
 const r=unpack({layers:['pc']}) as {unpacked:number;layers:number};assert.equal(r.unpacked,1);assert.equal(r.layers,3);
 const after=findComp(s.document!)!;assert.ok(!after.layers.some(l=>l.id==='pc'));
 for(const id of ['a','b'])for(const t of times){const m1=before(id,t),m2=worldMatrix(after,after.layers.find(l=>l.id===id)!,t);m1.forEach((v,i)=>assert.ok(Math.abs(v-m2[i])<1e-6,`${id}@${t}[${i}] ${v} vs ${m2[i]}`));}
 const idx=(c:typeof after,id:string)=>c.layers.findIndex(l=>l.id===id);
 assert.ok(idx(after,'top')<idx(after,'a')&&idx(after,'b')<idx(after,'low')&&idx(after,'a')<idx(after,'low'),after.layers.map(l=>l.id).join());
 assert.equal(after.layers.length,order0.length-1+3);
 s.undo();assert.equal(findComp(s.document!)!.layers.length,order0.length);assert.ok(findComp(s.document!)!.layers.some(l=>l.id==='pc'));
 s.dispatch([{type:'prop.set',layer:'pc',prop:'opacity',t:f(0),value:50}] as never);
 assert.throws(()=>unpack({layers:['pc']}),/opacity/);
 assert.throws(()=>unpack({layers:['top']}),/precomposition layer first/);
});

test('P246 unpack twice: colliding ids get fresh ids and parents follow',async()=>{
 const {precompUnpackSpecs}=await import('./precompUnpackCommands');const unpack=precompUnpackSpecs()[0].run as (p?:unknown)=>unknown;
 const d0=applyEdits(base(),[{type:'layer.add',kind:'shape',id:'b'},{type:'layer.parent',layer:'b',parent:'a'},{type:'precomp.make',layers:['a','b'],id:'pc',compId:'pcc',name:'G'},{type:'precomp.add',comp:'pcc',id:'pc2'}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);
 unpack({layers:['pc']});unpack({layers:['pc2']});const c=findComp(s.document!)!;
 assert.equal(c.layers.length,6);assert.equal(new Set(c.layers.map(l=>l.id)).size,6);
 const bs=c.layers.filter(l=>l.kind==='shape'&&c.layers.some(x=>x.id===l.parent&&x.kind==='shape'));assert.equal(bs.length,2);assert.notEqual(bs[0].parent,bs[1].parent);
});

test('P247 aim: the layer points at the target at every sampled time, also under a rotated parent, unwrapped, one undo step',async()=>{
 const {aimSpecs,aimKeys}=await import('./aimCommands');const {worldMatrix}=await import('./scene');const aim=aimSpecs()[0].run as (p?:unknown)=>unknown;
 const d0=applyEdits(base(),[{type:'layer.add',kind:'solid',id:'g'},{type:'prop.set',layer:'g',prop:'rotation',t:f(0),value:30},{type:'prop.set',layer:'g',prop:'position',t:f(0),value:[50,20]},{type:'layer.add',kind:'solid',id:'p'},{type:'prop.set',layer:'p',prop:'position',t:f(0),value:[400,300]},{type:'layer.parent',layer:'p',parent:'g'}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);
 assert.throws(()=>aim({layers:['a']}),/target first/);
 assert.throws(()=>aim({layers:['p','a','g']}),/hangs? from/);
 for(const off of [0,90]){
  const r=aim({layers:['a','p'],offset:off}) as {aimed:number;keys:number};assert.equal(r.aimed,1);assert.ok(r.keys>=2&&r.keys<=120);
  const c=findComp(s.document!)!,L=c.layers.find(l=>l.id==='p')!,T=c.layers.find(l=>l.id==='a')!;
  const pt=(l:typeof L,t:number)=>{const m=worldMatrix(c,l,t),an=l.transform.anchor.value as unknown as number[];return [m[0]*an[0]+m[2]*an[1]+m[4],m[1]*an[0]+m[3]*an[1]+m[5]];};
  for(const t of [f(0),f(3),f(7),f(10)]){const m=worldMatrix(c,L,t),p=pt(L,t),q=pt(T,t);
   const want=Math.atan2(q[1]-p[1],q[0]-p[0])*180/Math.PI+off,got=Math.atan2(m[1],m[0])*180/Math.PI;
   const diff=((want-got)%360+540)%360-180;assert.ok(Math.abs(diff)<0.6,`off ${off} t ${t}: ${diff}`);}
  const ks=L.transform.rotation.keys;for(let i=1;i<ks.length;i++)assert.ok(Math.abs((ks[i].v as number)-(ks[i-1].v as number))<180);
  s.undo();assert.equal(findComp(s.document!)!.layers.find(l=>l.id==='p')!.transform.rotation.keys.length,0);
 }
 assert.deepEqual(aimKeys(findComp(s.document!)!,findComp(s.document!)!.layers.find(l=>l.id==='p')!,findComp(s.document!)!.layers.find(l=>l.id==='a')!,0,f(10),0).length>1,true);
});

test('P248 orbit: constant radius around the moving target, starts where the layer is, full turns, rotated parent ok, one undo step',async()=>{
 const {orbitSpecs}=await import('./orbitCommands');const {worldMatrix}=await import('./scene');const orbit=orbitSpecs()[0].run as (p?:unknown)=>unknown;
 const d0=applyEdits(base(),[{type:'layer.add',kind:'solid',id:'g'},{type:'prop.set',layer:'g',prop:'rotation',t:f(0),value:30},{type:'prop.set',layer:'g',prop:'position',t:f(0),value:[50,20]},{type:'layer.add',kind:'solid',id:'p'},{type:'prop.set',layer:'p',prop:'position',t:f(0),value:[400,300]},{type:'layer.parent',layer:'p',parent:'g'}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);
 assert.throws(()=>orbit({layers:['a']}),/centre first/);assert.throws(()=>orbit({layers:['a','p'],turns:0}),/Turns/);assert.throws(()=>orbit({layers:['p','a','g']}),/hangs? from/);
 const c0=findComp(s.document!)!;const pt=(c:typeof c0,id:string,t:number)=>{const l=c.layers.find(x=>x.id===id)!,m=worldMatrix(c,l,t),an=l.transform.anchor.value as unknown as number[];return [m[0]*an[0]+m[2]*an[1]+m[4],m[1]*an[0]+m[3]*an[1]+m[5]];};
 const p0=pt(c0,'p',f(0)),q0=pt(c0,'a',f(0)),r0=Math.hypot(p0[0]-q0[0],p0[1]-q0[1]);
 for(const turns of [1,-2]){
  const r=orbit({layers:['a','p'],turns}) as {orbiting:number;keys:number};assert.equal(r.orbiting,1);assert.ok(r.keys>=2&&r.keys<=120);
  const c=findComp(s.document!)!,end=c.workArea.out;
  for(const t of [f(0),f(3),f(7),end]){const p=pt(c,'p',t),q=pt(c,'a',t);assert.ok(Math.abs(Math.hypot(p[0]-q[0],p[1]-q[1])-r0)<r0*0.01+0.5,`radius at ${t}`);}
  const ps=pt(c,'p',f(0));assert.ok(Math.abs(ps[0]-p0[0])<0.6&&Math.abs(ps[1]-p0[1])<0.6,'starts where it is');
  const pe=pt(c,'p',end),qe=pt(c,'a',end),a0=Math.atan2(p0[1]-q0[1],p0[0]-q0[0]),a1=Math.atan2(pe[1]-qe[1],pe[0]-qe[0]);assert.ok(Math.abs(Math.sin(a1-a0))<0.02&&Math.cos(a1-a0)>0.98,'full turns end where they began');
  const mid=pt(c,'p',Math.round(end/ (turns===1?2:4))),qm=pt(c,'a',Math.round(end/(turns===1?2:4)));const am=Math.atan2(mid[1]-qm[1],mid[0]-qm[0]);assert.ok(Math.cos(am-a0)<-0.95,'half way round is opposite');
  s.undo();assert.equal(findComp(s.document!)!.layers.find(l=>l.id==='p')!.transform.position.keys.length,0);
 }
});

test('P249 bounce: falls onto the ground, every bounce lower, rests on the floor at the end, world x kept, one undo step',async()=>{
 const {bounceSpecs,bounceHeight}=await import('./bounceCommands');const {worldMatrix}=await import('./scene');const bounce=bounceSpecs()[0].run as (p?:unknown)=>unknown;
 assert.equal(bounceHeight(0,3,60),1);assert.ok(Math.abs(bounceHeight(1,3,60))<1e-9);
 let peaks:number[]=[],prev=1,up=false;for(let i=1;i<=1000;i++){const h=bounceHeight(i/1000,3,60);if(h>prev&&!up)up=true;if(h<prev&&up){peaks.push(prev);up=false;}prev=h;}
 assert.equal(peaks.length,3);assert.ok(peaks[0]>peaks[1]&&peaks[1]>peaks[2]&&Math.abs(peaks[0]-0.36)<0.01,peaks.join());
 const d0=applyEdits(base(),[{type:'layer.add',kind:'solid',id:'floor'},{type:'prop.set',layer:'floor',prop:'position',t:f(0),value:[300,400]},{type:'layer.add',kind:'solid',id:'g'},{type:'prop.set',layer:'g',prop:'rotation',t:f(0),value:20},{type:'layer.add',kind:'solid',id:'ball'},{type:'prop.set',layer:'ball',prop:'position',t:f(0),value:[-100,-150]},{type:'layer.parent',layer:'ball',parent:'g'}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);
 assert.throws(()=>bounce({layers:['ball']}),/ground first/);assert.throws(()=>bounce({layers:['floor','ball'],bounces:0}),/Bounces/);assert.throws(()=>bounce({layers:['ball','floor','g']}),/hangs? from/);
 const c0=findComp(s.document!)!;const pt=(c:typeof c0,id:string,t:number)=>{const l=c.layers.find(x=>x.id===id)!,m=worldMatrix(c,l,t),an=l.transform.anchor.value as unknown as number[];return [m[0]*an[0]+m[2]*an[1]+m[4],m[1]*an[0]+m[3]*an[1]+m[5]];};
 const p0=pt(c0,'ball',f(0)),floorY=pt(c0,'floor',f(0))[1];
 assert.throws(()=>bounce({layers:['a','floor']}),/above the ground/);
 const r=bounce({layers:['floor','ball'],bounces:3}) as {dropping:number;keys:number};assert.equal(r.dropping,1);assert.ok(r.keys<=120);
 const c=findComp(s.document!)!;
 for(const t of [f(0),f(4),f(9),c.workArea.out]){const p=pt(c,'ball',t);assert.ok(Math.abs(p[0]-p0[0])<0.5,'x kept');assert.ok(p[1]<=floorY+0.6,'never below the floor');}
 assert.ok(Math.abs(pt(c,'ball',f(0))[1]-p0[1])<0.6);assert.ok(Math.abs(pt(c,'ball',c.workArea.out)[1]-floorY)<0.6,'rests on the floor');
 s.undo();assert.equal(findComp(s.document!)!.layers.find(l=>l.id==='ball')!.transform.position.keys.length,0);
});

test('P250 travel along a path: start, middle and end sit on the path in world space, orient faces the way, rotated parent, one undo step',async()=>{
 const {pathFollowSpecs,polylineAt}=await import('./pathFollowCommands');const {worldMatrix}=await import('./scene');const go=pathFollowSpecs()[0].run as (p?:unknown)=>unknown;
 const q=polylineAt([[0,0],[10,0],[10,10]],0.5);assert.ok(Math.abs(q.p[0]-10)<1e-9&&Math.abs(q.p[1])<1e-9);
 const d0=applyEdits(base(),[{type:'layer.add',kind:'shape',id:'pa',over:{source:{shape:'path',color:'#ff0000',width:400,height:100,path:{closed:false,points:[{x:0,y:0},{x:1,y:0},{x:1,y:1}]}}}},{type:'layer.add',kind:'solid',id:'g'},{type:'prop.set',layer:'g',prop:'rotation',t:f(0),value:30},{type:'layer.add',kind:'solid',id:'m'},{type:'layer.parent',layer:'m',parent:'g'}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);
 assert.throws(()=>go({layers:['pa']}),/Tick the path/);assert.throws(()=>go({layers:['a','m']}),/path shape/);
 const r=go({layers:['pa','m'],orient:true}) as {travelling:number;keys:number};assert.equal(r.travelling,1);assert.ok(r.keys<=240);
 const c=findComp(s.document!)!,pa=c.layers.find(l=>l.id==='pa')!,m=c.layers.find(l=>l.id==='m')!;
 const pw=(x:number,y:number,t:number)=>{const w=worldMatrix(c,pa,t);return [w[0]*x+w[2]*y+w[4],w[1]*x+w[3]*y+w[5]];};
 const an=m.transform.anchor.value as unknown as number[];const at=(t:number)=>{const w=worldMatrix(c,m,t);return [w[0]*an[0]+w[2]*an[1]+w[4],w[1]*an[0]+w[3]*an[1]+w[5]];};
 const near=(a:number[],b:number[])=>Math.abs(a[0]-b[0])<0.6&&Math.abs(a[1]-b[1])<0.6;
 const a=c.workArea.in,b=c.workArea.out;assert.ok(near(at(a),pw(0,0,a)),'start');assert.ok(near(at(b),pw(400,100,b)),'end');assert.ok(near(at(a+(b-a)*0.8),pw(400,0,a)),'corner at 80 percent of the length');
 const w1=worldMatrix(c,m,a+(b-a)/4);assert.ok(Math.abs(Math.atan2(w1[1],w1[0]))<0.02,'faces +x on the first leg');
 const w2=worldMatrix(c,m,b-(b-a)/10);assert.ok(Math.abs(Math.atan2(w2[1],w2[0])-Math.PI/2)<0.02,'faces down on the second leg');
 s.undo();assert.equal(findComp(s.document!)!.layers.find(l=>l.id==='m')!.transform.position.keys.length,0);
});

test('P251 bounce with squash and stretch: starts at the original scale, squashes wide at contact, stretches tall in the air, undo restores',async()=>{
 const {bounceSpecs,squashFactor}=await import('./bounceCommands');const bounce=bounceSpecs()[0].run as (p?:unknown)=>unknown;
 assert.ok(squashFactor(0,0)[0]>1.2&&squashFactor(0,0)[1]<0.8);assert.ok(squashFactor(0.5,1)[1]>1.1&&squashFactor(0.5,1)[0]<1);assert.deepEqual(squashFactor(0.5,0),[1,1]);
 const d0=applyEdits(base(),[{type:'layer.add',kind:'solid',id:'floor'},{type:'prop.set',layer:'floor',prop:'position',t:f(0),value:[300,400]},{type:'layer.add',kind:'solid',id:'ball'},{type:'prop.set',layer:'ball',prop:'position',t:f(0),value:[250,100]}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);
 const r=bounce({layers:['floor','ball'],squash:true}) as {keys:number};assert.ok(r.keys>0);
 const k=findComp(s.document!)!.layers.find(l=>l.id==='ball')!.transform.scale.keys.map(x=>x.v as unknown as number[]);
 assert.ok(k.length>20);assert.ok(Math.abs(k[0][0]-100)<=1&&Math.abs(k[0][1]-100)<=1,'first key is the original scale');
 assert.ok(Math.min(...k.map(v=>v[1]))<85,'squashed at contact');assert.ok(Math.max(...k.map(v=>v[1]))>110,'stretched in the air');
 s.undo();assert.equal(findComp(s.document!)!.layers.find(l=>l.id==='ball')!.transform.scale.keys.length,0);
});

test('P252 parallax: nearer layers move further, rotated parent respected, push scales, layers with keys are skipped, one undo step',async()=>{
 const {parallaxSpecs,depthShare}=await import('./parallaxCommands');const {worldMatrix}=await import('./scene');const run=parallaxSpecs()[0].run as (p?:unknown)=>unknown;
 assert.equal(depthShare(0,4),0.25);assert.equal(depthShare(3,4),1);
 const d0=applyEdits(base(),[{type:'layer.add',kind:'solid',id:'far'},{type:'layer.add',kind:'solid',id:'mid'},{type:'layer.add',kind:'solid',id:'g'},{type:'prop.set',layer:'g',prop:'rotation',t:f(0),value:40},{type:'layer.add',kind:'solid',id:'near'},{type:'layer.parent',layer:'near',parent:'g'}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);
 assert.throws(()=>run({layers:['far','mid']}),/Choose/);assert.throws(()=>run({mode:'left',amount:0,layers:['far','mid']}),/amount/);
 const r=run({mode:'left',amount:10,layers:['far','mid','near','a']}) as {moved:number;skipped:number};assert.equal(r.moved,3);assert.equal(r.skipped,1);
 const c=findComp(s.document!)!,anc=(id:string,t:number)=>{const l=c.layers.find(x=>x.id===id)!,m=worldMatrix(c,l,t),an=l.transform.anchor.value as unknown as number[];return [m[0]*an[0]+m[2]*an[1]+m[4],m[1]*an[0]+m[3]*an[1]+m[5]];};
 const a=c.workArea.in,b=c.workArea.out,dx=(id:string)=>anc(id,b)[0]-anc(id,a)[0],dy=(id:string)=>anc(id,b)[1]-anc(id,a)[1];
 assert.ok(Math.abs(dx('far')+c.width*0.1*0.25)<0.1&&Math.abs(dx('mid')+c.width*0.1*0.5)<0.1&&Math.abs(dx('near')+c.width*0.1*0.75)<0.1,'world dx 1/4, 2/4, 3/4 of the full drift (the skipped layer keeps its depth slot)');
 assert.ok(Math.abs(dy('near'))<0.1,'no vertical drift');
 s.undo();assert.equal(findComp(s.document!)!.layers.find(l=>l.id==='far')!.transform.position.keys.length,0);
 run({mode:'push',amount:20,layers:['far','mid']});const sc=(id:string)=>findComp(s.document!)!.layers.find(l=>l.id===id)!.transform.scale.keys.map(k=>k.v as unknown as number[]);
 assert.ok(Math.abs(sc('mid')[1][0]/sc('mid')[0][0]-1.2)<0.01&&Math.abs(sc('far')[1][0]/sc('far')[0][0]-1.1)<0.01);
});

test('P253 mirror: positions reflect across the first layer, rotation reverses, tangents flip, parented layers are skipped, one undo step',async()=>{
 const {mirrorSpecs,reflect}=await import('./mirrorCommands');const run=mirrorSpecs()[0].run as (p?:unknown)=>unknown;
 assert.deepEqual(reflect([100,50],'x',300),[500,50]);assert.deepEqual(reflect([100,50],'y',20),[100,-10]);
 const d0=applyEdits(base(),[{type:'layer.add',kind:'solid',id:'axis'},{type:'prop.set',layer:'axis',prop:'position',t:f(0),value:[400,225]},{type:'layer.add',kind:'solid',id:'st'},{type:'prop.set',layer:'st',prop:'position',t:f(0),value:[100,60]},{type:'prop.set',layer:'st',prop:'rotation',t:f(0),value:25},{type:'layer.add',kind:'solid',id:'kid'},{type:'layer.parent',layer:'kid',parent:'st'},{type:'key.spatial',layer:'a',prop:'position',t:f(0),sOut:[30,10]}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);
 assert.throws(()=>run({layers:['axis','kid']}),/Choose/);assert.throws(()=>run({axis:'x',layers:['axis','kid']}),/parent/);
 const r=run({axis:'x',layers:['axis','st','a','kid']}) as {mirrored:number;skipped:number};assert.equal(r.mirrored,2);assert.equal(r.skipped,1);
 const c=findComp(s.document!)!,L=(id:string)=>c.layers.find(l=>l.id===id)!;
 assert.deepEqual(L('st').transform.position.value as unknown as number[],[700,60]);assert.equal(L('st').transform.rotation.value as unknown as number,-25);
 const ak=L('a').transform.position.keys;assert.deepEqual(ak[0].v as unknown as number[],[700,100]);assert.deepEqual(ak[1].v as unknown as number[],[600,50]);assert.deepEqual(ak[0].sOut,[-30,10]);
 s.undo();assert.deepEqual(findComp(s.document!)!.layers.find(l=>l.id==='st')!.transform.position.value as unknown as number[],[100,60]);
});

test('P254 export check: fully transparent layers and loop seam (only when a seamless loop is asked for)',async()=>{
 const {exportCheck}=await import('./exportCheck');const {defaultExportSettings}=await import('./exportSettings');
 const d0=applyEdits(base(),[{type:'layer.add',kind:'solid',id:'ghost',over:{name:'Ghost'}},{type:'prop.set',layer:'ghost',prop:'opacity',t:f(0),value:0},{type:'layer.add',kind:'solid',id:'still',over:{name:'Still'}}] as never);
 const s=new AnimationSession();s.open(d0);const c=findComp(s.document!)!;
 const plain=exportCheck(c,[],defaultExportSettings()),by=(l:typeof plain)=>Object.fromEntries(l.map(i=>[i.code,i]));
 assert.deepEqual(by(plain).invisible.layers,['Ghost']);assert.equal(by(plain).invisible.severity,'warn');assert.equal(by(plain).seam,undefined,'no seam note unless a seamless loop is on');
 const loop=by(exportCheck(c,[],{...defaultExportSettings(),loopSeam:true}));
 assert.ok(loop.seam.layers.length>=1&&!loop.seam.layers.includes('Still')&&!loop.seam.layers.includes('Ghost'),'the moving layer is named, still ones are not');
});

test('P255 burst: copies start on the layer at the playhead, fly out by 60 to 100 percent of the distance in world space, fade to 0, one undo step, same seed same burst',async()=>{
 const {burstSpecs,burstPieces}=await import('./burstCommands');const {worldMatrix}=await import('./scene');const run=burstSpecs()[0].run as (p?:unknown)=>unknown;
 assert.deepEqual(burstPieces(8,3,200),burstPieces(8,3,200));assert.notDeepEqual(burstPieces(8,3,200),burstPieces(8,4,200));
 const d0=applyEdits(base(),[{type:'layer.add',kind:'solid',id:'g'},{type:'prop.set',layer:'g',prop:'rotation',t:f(0),value:35},{type:'layer.add',kind:'shape',id:'em'},{type:'layer.parent',layer:'em',parent:'g'},{type:'prop.set',layer:'em',prop:'position',t:f(0),value:[50,20]}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);s.setView({playhead:f(30)});
 assert.throws(()=>run({layers:['em','g']}),/exactly one/);assert.throws(()=>run({layers:['em'],count:2}),/copies/);
 const before=findComp(s.document!)!.layers.length;const r=run({layers:['em'],count:10,seconds:1,distance:200}) as {copies:number;from:number;to:number};assert.equal(r.copies,10);
 const c=findComp(s.document!)!;assert.equal(c.layers.length,before+10);
 const em=c.layers.find(l=>l.id==='em')!,anc=(l:typeof em,t:number)=>{const m=worldMatrix(c,l,t),an=l.transform.anchor.value as unknown as number[];return [m[0]*an[0]+m[2]*an[1]+m[4],m[1]*an[0]+m[3]*an[1]+m[5]];};
 const p0=anc(em,r.from),copies=c.layers.filter(l=>l.id!=='em'&&l.parent==='g'&&l.inT===r.from);assert.equal(copies.length,10);
 for(const k of copies){const a=anc(k,r.from),b=anc(k,r.to),dd=Math.hypot(b[0]-a[0],b[1]-a[1]);assert.ok(Math.hypot(a[0]-p0[0],a[1]-p0[1])<0.5,'starts on the emitter');assert.ok(dd>=60&&dd<=200+120,'flew out (with the small fall at the end)');assert.equal(k.outT,r.to);assert.equal(k.transform.opacity.keys[k.transform.opacity.keys.length-1].v,0);}
 s.undo();assert.equal(findComp(s.document!)!.layers.length,before);
});

test('P256 scatter: frame mode stays inside the frame, nudge stays within 60 px, shuffle keeps the same set of positions, keyed layers move as a whole, same seed same result, one undo step',async()=>{
 const {scatterSpecs,scatterTargets}=await import('./scatterCommands');const run=scatterSpecs()[0].run as (p?:unknown)=>unknown;
 const from:[number,number][]=[[10,10],[200,50],[300,300],[40,400]];
 assert.deepEqual(scatterTargets('frame',from,800,450,7),scatterTargets('frame',from,800,450,7));
 for(const q of scatterTargets('frame',from,800,450,9))assert.ok(q[0]>=0&&q[0]<=800&&q[1]>=0&&q[1]<=450);
 scatterTargets('nudge',from,800,450,5).forEach((q,i)=>assert.ok(Math.abs(q[0]-from[i][0])<=60&&Math.abs(q[1]-from[i][1])<=60));
 assert.deepEqual([...scatterTargets('shuffle',from,800,450,5)].sort(),[...from].sort());
 const d0=applyEdits(base(),[{type:'layer.add',kind:'solid',id:'s1'},{type:'prop.set',layer:'s1',prop:'position',t:f(0),value:[100,100]},{type:'layer.add',kind:'solid',id:'s2'},{type:'prop.set',layer:'s2',prop:'position',t:f(0),value:[500,300]},{type:'layer.add',kind:'solid',id:'kid'},{type:'layer.parent',layer:'kid',parent:'s1'}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);
 assert.throws(()=>run({layers:['s1','s2']}),/Choose/);assert.throws(()=>run({mode:'shuffle',layers:['s1','kid']}),/two/);
 const r=run({mode:'frame',seed:3,layers:['s1','s2','a','kid']}) as {moved:number;skipped:number};assert.equal(r.moved,3);assert.equal(r.skipped,1);
 const c=findComp(s.document!)!,L=(id:string)=>c.layers.find(l=>l.id===id)!;
 const a=L('a').transform.position.keys;assert.ok(Math.abs((a[1].v as unknown as number[])[0]-(a[0].v as unknown as number[])[0]-100)<0.02&&Math.abs((a[1].v as unknown as number[])[1]-(a[0].v as unknown as number[])[1]+50)<0.02,'keyed layer keeps its motion, only shifted');
 s.undo();assert.deepEqual(findComp(s.document!)!.layers.find(l=>l.id==='s1')!.transform.position.value as unknown as number[],[100,100]);
});

test('P258 overshoot: adds a key past the target at 80 percent (and a pull-back at 12), existing key times unchanged, short or still segments skipped, undo restores',async()=>{
 const {overshootSpecs,segmentKeys}=await import('./overshootCommands');const run=overshootSpecs()[0].run as (p?:unknown)=>unknown;
 const fps=findComp(base())!.fps;
 const mk=(t:number,v:number|number[])=>({t,v,interp:'bezier',out:[0.25,0.1],in:[0.75,0.9]}) as never;
 assert.equal(segmentKeys(mk(0,0),mk(f(2),10),20,false,fps,false),null,'under 4 frames');assert.equal(segmentKeys(mk(0,5),mk(f(20),5),20,false,fps,false),null,'no change');
 const ks=segmentKeys(mk(0,0),mk(f(20),100),20,true,fps,false)!;assert.equal(ks.length,2);assert.equal(ks[0].v,-10);assert.equal(ks[1].v,120);assert.ok(ks[0].t<ks[1].t&&ks[1].t<f(20));
 assert.equal((segmentKeys(mk(0,[100,100]),mk(f(20),[0,0]),50,false,fps,true)![0].v as number[])[0],0,'scale never goes below 0');
 const s=open();setAnimationSession(s);const before=findComp(s.document!)!.layers.find(l=>l.id==='a')!.transform.position.keys;
 assert.throws(()=>run({layers:['a'],amount:3}),/amount/);
 const r=run({layers:['a'],amount:20,anticipate:true}) as {keys:number};
 const after=findComp(s.document!)!.layers.find(l=>l.id==='a')!.transform.position.keys;
 assert.equal(after.length,before.length+r.keys);assert.deepEqual(after.filter(k=>before.some(b=>b.t===k.t)).map(k=>k.v),before.map(k=>k.v),'original keys untouched');
 const ov=after[after.length-2].v as unknown as number[],end=before[1].v as unknown as number[];assert.ok(ov[0]>end[0],'swings past the end in x (moving right)');
 s.undo();assert.equal(findComp(s.document!)!.layers.find(l=>l.id==='a')!.transform.position.keys.length,before.length);
});

test('P259 glow pulse: adds a glow with high/low/high keys across the work area, reuses an existing glow, one undo step',async()=>{
 const {pulseSpecs,pulseKeys}=await import('./pulseCommands');const run=pulseSpecs()[0].run as (p?:unknown)=>unknown;
 const fps=findComp(base())!.fps,pk=pulseKeys(0,f(60),3,fps);assert.equal(pk.length,7);assert.equal(pk[0].v,1);assert.equal(pk[1].v,0.25);assert.equal(pk[6].v,1);assert.equal(pk[6].t,f(60));
 const s=open();setAnimationSession(s);assert.throws(()=>run({layers:['a'],cycles:0}),/Pulses/);
 const wa=findComp(s.document!)!.workArea;
 const r=run({layers:['a'],cycles:2}) as {glowsAdded:number};assert.equal(r.glowsAdded,1);
 const fx=()=>findComp(s.document!)!.layers.find(l=>l.id==='a')!.effects!;
 assert.equal(fx().length,1);assert.equal(fx()[0].kind,'glow');const ks=fx()[0].animation!.keys;assert.equal(ks.length,5);assert.equal(ks[0].t,wa.in);assert.equal(ks[4].t,wa.out);assert.deepEqual(ks.map(k=>k.v),[1,0.25,1,0.25,1]);
 const r2=run({layers:['a'],cycles:3}) as {glowsAdded:number};assert.equal(r2.glowsAdded,0);assert.equal(fx().length,1);assert.equal(fx()[0].animation!.keys.length,7,'old keys replaced');
 s.undo();assert.equal(fx()[0].animation!.keys.length,5);s.undo();assert.equal(findComp(s.document!)!.layers.find(l=>l.id==='a')!.effects?.length??0,0);
});

test('P259b copy effects: clones the stack with fresh ids onto targets, one undo step, refuses a lone layer',async()=>{
 const {effectCopySpecs}=await import('./effectCopyCommands');const run=effectCopySpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});const ls=['x','x','b','a'];
 const {pulseSpecs}=await import('./pulseCommands');(pulseSpecs()[0].run as (p?:unknown)=>unknown)({layers:[ls[3]],cycles:1});
 assert.throws(()=>run({layers:[ls[3]]}),/Tick the source/);
 const fx=(id:string)=>findComp(s.document!)!.layers.find(l=>l.id===id)!.effects??[];
 const r=run({layers:[ls[3],ls[2]]}) as {copiedTo:number};assert.equal(r.copiedTo,1);
 assert.equal(fx(ls[2]).length,fx(ls[3]).length);assert.notEqual(fx(ls[2])[0].id,fx(ls[3])[0].id);
 assert.deepEqual(fx(ls[2]).find(e=>e.kind==='glow')!.animation!.keys.map(k=>k.v),fx(ls[3]).find(e=>e.kind==='glow')!.animation!.keys.map(k=>k.v));
 s.undo();assert.equal(fx(ls[2]).length,0);
});

test('P261 soften keys: pulls selected inner keys toward neighbours, keeps track ends, one undo step',async()=>{
 const {softenValue}=await import('./keySoften');const {keySoftenSpecs}=await import('./keySoftenCommands');const run=keySoftenSpecs()[0].run as (p?:unknown)=>unknown;
 assert.equal(softenValue(0,30,0,0.5),20);assert.deepEqual(softenValue([0,0],[30,60],[0,0],1),[10,20]);
 const s=open();setAnimationSession(s);const tr=()=>findComp(s.document!)!.layers.find(l=>l.id==='a')!.transform.opacity;
 for(const [t,v] of [[0,100],[f(10),0],[f(20),100],[f(30),0],[f(40),100]]){s.dispatch({type:'key.add',layer:'a',prop:'opacity',t} as never);s.dispatch({type:'prop.set',layer:'a',prop:'opacity',t,value:v} as never);}
 const keys=tr().keys;assert.ok(keys.length>=5);
 const mid=keys[2];s.setView({selectedKeys:[{layer:'a',prop:'opacity',t:mid.t}]} as never);
 const before=keys.map(k=>k.v);const r=run({percent:100}) as {keys:number};assert.equal(r.keys,1);
 const after=tr().keys.map(k=>k.v);assert.notDeepEqual(after,before);assert.equal(after[0],before[0]);assert.equal(after[4],before[4]);
 s.undo();assert.deepEqual(tr().keys.map(k=>k.v),before);
});

test('P262 crossfade: next layer fades in over the overlap while the previous fades out, one undo step',async()=>{
 const {crossfadeSpecs}=await import('./crossfadeCommands');const run=crossfadeSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const L=(id:string)=>findComp(s.document!)!.layers.find(l=>l.id===id)!;
 s.dispatch({type:'layer.timing',layer:'a',inT:0,outT:f(30)});s.dispatch({type:'layer.timing',layer:'b',inT:f(30),outT:f(60)});
 assert.throws(()=>run({layers:['a']}),/two layers/);
 const r=run({layers:['b','a'],frames:10}) as {joins:number};assert.equal(r.joins,1);
 assert.equal(L('a').outT,f(40));assert.deepEqual(L('a').transform.opacity.keys.map(k=>[k.t,k.v]),[[f(30),100],[f(39),0]]);
 assert.deepEqual(L('b').transform.opacity.keys.map(k=>[k.t,k.v]),[[f(30),0],[f(39),100]]);
 assert.throws(()=>run({layers:['a','b']}),/Nothing to crossfade/);
 s.undo();assert.equal(L('a').outT,f(30));assert.equal(L('a').transform.opacity.keys.length,0);assert.equal(L('b').transform.opacity.keys.length,0);
});

test('P263 on twos: animated props become hold keys every N frames sampled from the old motion, undo restores',async()=>{
 const {stepSpecs,stepTimes}=await import('./stepCommands');const run=stepSpecs()[0].run as (p?:unknown)=>unknown;
 assert.deepEqual(stepTimes(0,10,4),[0,4,8]);
 const s=open();setAnimationSession(s);const c0=findComp(s.document!)!;
 const T=(k:string)=>findComp(s.document!)!.layers.find(l=>l.id==='a')!.transform[k as 'opacity'];
 for(const [t,v] of [[0,0],[f(30),100]]){s.dispatch({type:'key.add',layer:'a',prop:'opacity',t} as never);s.dispatch({type:'prop.set',layer:'a',prop:'opacity',t,value:v} as never);s.dispatch({type:'key.interp',layer:'a',prop:'opacity',t,interp:'linear'} as never);}
 assert.throws(()=>run({layers:['a'],frames:1}),/2 to/);
 const before=T('opacity').keys.length;assert.equal(before,2);
 const r=run({layers:['a'],frames:3}) as {properties:number;poses:number};assert.ok(r.properties>=1);
 const ks=T('opacity').keys;assert.ok(ks.length>10);assert.ok(ks.every(k=>k.interp==='hold'));
 const step=f(3)-f(0);assert.equal(ks[1].t-ks[0].t,step);assert.equal(ks[0].v,0);
 if(f(30)<=c0.workArea.out){const k=ks.find(x=>x.t===f(30));assert.ok(k);assert.equal(k!.v,100);}
 const mid=ks.find(x=>x.t===f(15));assert.ok(mid);assert.ok(Math.abs((mid!.v as number)-50)<1);
 assert.throws(()=>run({layers:['b'],frames:2}),/Tick at least|None of/);
 s.undo();assert.equal(T('opacity').keys.length,2);
});

test('P264 freeze: ticked layers keep their pose from the playhead on, later keys go, undo restores',async()=>{
 const {freezeSpecs}=await import('./freezeCommands');const run=freezeSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);
 const T=()=>findComp(s.document!)!.layers.find(l=>l.id==='a')!.transform.opacity;
 for(const [t,v] of [[0,0],[f(30),100],[f(60),0]]){s.dispatch({type:'key.add',layer:'a',prop:'opacity',t} as never);s.dispatch({type:'prop.set',layer:'a',prop:'opacity',t,value:v} as never);s.dispatch({type:'key.interp',layer:'a',prop:'opacity',t,interp:'linear'} as never);}
 s.setView({playhead:f(15)} as never);
 const r=run({layers:['a']}) as {properties:number};assert.ok(r.properties>=1);
 const ks=T().keys;assert.deepEqual(ks.map(k=>k.t),[0,f(15)]);assert.equal(ks[1].v,50);assert.equal(ks[1].interp,'hold');
 assert.throws(()=>run({layers:['a']}),/Nothing to freeze/);
 s.undo();assert.equal(T().keys.length,3);
});

test('P265 trail: delayed fading copies of a moving layer, one undo step, refuses when nothing fits',async()=>{
 const {trailSpecs,ghostFactor}=await import('./trailCommands');const run=trailSpecs()[0].run as (p?:unknown)=>unknown;
 assert.equal(ghostFactor(1,3),0.75);assert.equal(ghostFactor(3,3),0.25);
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});const old=new Set(findComp(s.document!)!.layers.map(l=>l.id)),n0=old.size;
 for(const [t,v] of [[0,[0,0]],[f(30),[100,0]]]){s.dispatch({type:'key.add',layer:'a',prop:'position',t} as never);s.dispatch({type:'prop.set',layer:'a',prop:'position',t,value:v} as never);}
 assert.throws(()=>run({layers:['a','b'],count:2}),/exactly one/);
 const r=run({layers:['a'],count:3,gap:2}) as {ghosts:number};assert.equal(r.ghosts,3);
 const c=findComp(s.document!)!;assert.equal(c.layers.length,n0+3);
 const a=c.layers.find(l=>l.id==='a')!,ghosts=c.layers.filter(l=>!old.has(l.id));
 assert.equal(ghosts.length,3);assert.ok(ghosts.every(g=>c.layers.indexOf(g)>c.layers.indexOf(a)),'ghosts sit behind the original');
 const d1=ghosts.map(g=>g.transform.position.keys[0].t).sort((x,y)=>x-y);assert.equal(d1[0],f(2)+a.transform.position.keys[0].t);
 assert.deepEqual(ghosts.map(g=>g.transform.opacity.value).sort(),[25,50,75].map(x=>x*(a.transform.opacity.value as number)/100).sort());
 s.undo();assert.equal(findComp(s.document!)!.layers.length,n0);
 const big=run({layers:['a'],count:12,gap:30}) as {ghosts:number;skipped:number};assert.ok(big.skipped>0&&big.ghosts>0&&big.ghosts+big.skipped===12);
});

test('P266 export check: flash warning for more than 3 flashes a second, not for a slow blink',async()=>{
 const {exportCheck}=await import('./exportCheck');const {defaultExportSettings}=await import('./exportSettings');const {flashes}=await import('./exportPreflight');
 assert.equal(flashes([0,100,0,100,0,100,0,100,0,100,0,100,0,100,0],10),true);assert.equal(flashes([0,0,100,100,100,100,0,0,0,0],10),false);assert.equal(flashes([0,100,0,100],3),false,'too few samples per second to judge');
 const blink=(id:string,name:string,every:number):Edit[]=>{const e:Edit[]=[{type:'layer.add',kind:'solid',id,over:{name}} as never];for(let i=0;i<=60;i+=every){const t=f(i);e.push({type:'key.add',layer:id,prop:'opacity',t} as never,{type:'prop.set',layer:id,prop:'opacity',t,value:(i/every)%2?0:100} as never,{type:'key.interp',layer:id,prop:'opacity',t,interp:'hold'} as never);}return e;};
 const d0=applyEdits(base(),[...blink('fast','Strobe',2),...blink('slow','Pulse',15)] as never);
 const s=new AnimationSession();s.open(d0);const c=findComp(s.document!)!;
 const flash=exportCheck(c,[],defaultExportSettings()).find(i=>i.code==='flash');
 assert.ok(flash&&flash.severity==='warn');assert.ok(flash!.layers.includes('Strobe')&&!flash!.layers.includes('Pulse'));
});

test('P267 wave: each ticked layer gets the same sine one step later, linear keys over the work area, end key exact, one undo step',async()=>{
 const {waveSpecs,waveOffset,waveTimes,applyWave}=await import('./waveCommands');const run=waveSpecs()[0].run as (p?:unknown)=>unknown;
 assert.deepEqual(waveTimes(0,10,4),[0,4,8,10]);assert.equal(waveOffset(0,0,100,20),0);assert.ok(Math.abs(waveOffset(0,25,100,20)-20)<1e-9);
 assert.deepEqual(applyWave('bob',[10,20] as never,5),[10,25]);assert.deepEqual(applyWave('breathe',[100,100] as never,10),[110,110]);
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const T=(id:string)=>findComp(s.document!)!.layers.find(l=>l.id===id)!.transform.position;
 assert.throws(()=>run({kind:'nope'}),/Unknown/);assert.throws(()=>run({kind:'bob',amount:0,layers:['a']}),/size/);
 const r=run({kind:'bob',amount:20,periodFrames:40,layers:['b','a']}) as {layers:number;keys:number};assert.equal(r.layers,2);assert.ok(r.keys>=10&&r.keys<=120);
 const wa=findComp(s.document!)!.workArea,kb=T('b').keys,ka=T('a').keys;
 assert.equal(kb.length,r.keys);assert.equal(kb[kb.length-1].t,wa.out);assert.ok(kb.every(k=>k.interp==='linear'));
 const dy=(ks:typeof kb,i:number,base:number)=>(ks[i].v as number[])[1]-base;
 const b0=(T('b').value as number[])[1];
 assert.ok(Math.abs(dy(kb,0,b0))<0.01,'first layer starts at 0');
 s.undo();assert.equal(T('b').keys.length,0);
 assert.ok(ka.length===r.keys);
});

test('P268 palette shift: hue rotates, lightness and saturation move, greys stay grey, locked layers keep their colour, one undo step',async()=>{
 const {shiftColor,hexToHsl}=await import('./paletteShift');const {paletteSpecs}=await import('./paletteCommands');const run=paletteSpecs()[1].run as (p?:unknown)=>unknown;
 assert.equal(shiftColor('#ff0000',{hue:120}),'#00ff00');assert.equal(shiftColor('#ff0000',{hue:180}),'#00ffff');assert.equal(shiftColor('#808080',{hue:90}),'#808080');
 assert.equal(shiftColor('#000000',{lightness:-20}),'#000000');assert.ok(hexToHsl(shiftColor('#336699',{lightness:10}))[2]>hexToHsl('#336699')[2]);assert.equal(shiftColor('#ff0000',{hue:-180}),shiftColor('#ff0000',{hue:180}));
 const d0=applyEdits(base(),[{type:'layer.add',kind:'solid',id:'s1'},{type:'layer.update',layer:'s1',source:{color:'#ff0000'}},{type:'layer.add',kind:'solid',id:'s2'},{type:'layer.update',layer:'s2',source:{color:'#ff0000'}},{type:'layer.update',layer:'s2',locked:true}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);
 const col=(id:string)=>findComp(s.document!)!.layers.find(l=>l.id===id)!.source.color;
 assert.throws(()=>run({}),/Pick/);assert.throws(()=>run({hue:200}),/Hue is/);
 run({hue:120});assert.equal(col('s1'),'#00ff00');assert.equal(col('s2'),'#ff0000');
 s.undo();assert.equal(col('s1'),'#ff0000');
});

test('P269 camera focus: the camera glides so the selected layer is centred and fills about 60 percent, holds afterwards, one undo step',async()=>{
 const {cameraFocusSpecs,focusPose}=await import('./cameraFocusCommands');const {cameraSpecs,findCamera}=await import('./cameraCommands');const {worldMatrix,applyMatrix}=await import('./scene');
 const run=cameraFocusSpecs()[0].run as (p?:unknown)=>unknown,add=cameraSpecs().find(x=>x.id==='animation.camera.add')!.run as ()=>unknown;
 const c0=findComp(base())!;assert.deepEqual(focusPose(c0,{cx:c0.width/2,cy:c0.height/2,w:c0.width*0.3,h:c0.height*0.3}),{scale:200,position:[c0.width/2,c0.height/2]});
 const d0=applyEdits(base(),[{type:'layer.add',kind:'solid',id:'t1',over:{name:'Target'}},{type:'layer.update',layer:'t1',source:{width:100,height:60}},{type:'prop.set',layer:'t1',prop:'position',t:0,value:[600,100]}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);
 assert.throws(()=>run({layer:'t1'}),/Add a camera/);add();
 s.setView({playhead:f(10),selectedLayer:'t1'} as never);
 assert.throws(()=>run({layer:'t1',frames:0}),/frames/);
 const r=run({layer:'t1',frames:20}) as {to:number;scale:number};assert.ok(r.scale>100);
 const c=findComp(s.document!)!,cam=findCamera(c)!,t=c.layers.find(l=>l.id==='t1')!;
 const ctr=(tt:number)=>{const m=worldMatrix(c,t,tt),ps=[[0,0],[100,0],[0,60],[100,60]].map(q=>applyMatrix(m,[q[0],q[1]]));return [(Math.min(...ps.map(p=>p[0]))+Math.max(...ps.map(p=>p[0])))/2,(Math.min(...ps.map(p=>p[1]))+Math.max(...ps.map(p=>p[1])))/2];};
 const e=ctr(r.to),ee=ctr(r.to+f(30));assert.ok(Math.abs(e[0]-c.width/2)<1&&Math.abs(e[1]-c.height/2)<1,'centred at the end');assert.ok(Math.abs(ee[0]-e[0])<1e-6,'holds after');
 assert.equal(cam.transform.scale.keys.length,2);
 s.undo();assert.equal(findCamera(findComp(s.document!)!)!.transform.scale.keys.length,0);
});

test('P271 spin: whole turns over the work area, unkeyed layers get two keys, keyed ones are sampled with the turn added, one undo step',async()=>{
 const {spinSpecs,spinTimes}=await import('./spinCommands');const run=spinSpecs()[0].run as (p?:unknown)=>unknown;
 assert.deepEqual(spinTimes(0,10,4),[0,4,8,10]);
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const R=(id:string)=>findComp(s.document!)!.layers.find(l=>l.id===id)!.transform.rotation;
 assert.throws(()=>run({turns:0,layers:['b']}),/Turns/);assert.throws(()=>run({turns:21,layers:['b']}),/Turns/);
 const r0=R('b').value as number,wa=findComp(s.document!)!.workArea;
 run({turns:2,layers:['b']});const k=R('b').keys;assert.equal(k.length,2);assert.equal(k[0].t,wa.in);assert.equal(k[1].t,wa.out);assert.equal(k[0].v,r0);assert.equal(k[1].v,r0+720);assert.equal(k[0].interp,'linear');
 s.undo();assert.equal(R('b').keys.length,0);
 run({turns:-1,ease:true,layers:['b']});assert.equal(R('b').keys[1].v,r0-360);assert.equal(R('b').keys[0].interp,'bezier');
 s.undo();
 for(const [t,v] of [[0,0],[f(60),90]]){s.dispatch({type:'key.add',layer:'b',prop:'rotation',t} as never);s.dispatch({type:'prop.set',layer:'b',prop:'rotation',t,value:v} as never);s.dispatch({type:'key.interp',layer:'b',prop:'rotation',t,interp:'linear'} as never);}
 run({turns:1,layers:['b']});const kk=R('b').keys;assert.ok(kk.length>2);assert.equal(kk[kk.length-1].t,wa.out);assert.ok((kk[kk.length-1].v as number)>=360);
});

test('P272 wipe in opens a mask over the layer start, one undo step',async()=>{
 const {wipeSpecs}=await import('./wipeCommands');const runCommand=(_:string,p:unknown)=>(wipeSpecs()[0].run as (p?:unknown)=>unknown)(p);
 const s=open();setAnimationSession(s);const c0=findComp(s.document!),l0=c0.layers.find(x=>x.id==='a')!;
 s.setView({selectedLayer:'a'} as never);
 const r=runCommand('animation.layers.wipe',{mode:'in',dir:'left',frames:10,layers:['a']}) as {layers:number};
 assert.equal(r.layers,1);
 const l=findComp(s.document!).layers.find(x=>x.id==='a')!,m=l.masks![0];
 assert.equal(m.anim!.size!.keys.length,2);assert.equal(m.anim!.size!.keys[0].t,l0.inT);assert.equal(m.anim!.size!.keys[1].t,l0.inT+f(10));
 assert.deepEqual(m.anim!.size!.keys[0].v,[1,m.height]);assert.deepEqual(m.anim!.position!.keys[0].v,[-1,0]);
 assert.throws(()=>runCommand('animation.layers.wipe',{layers:['a']}),/already have masks/);
 s.undo();assert.equal(findComp(s.document!).layers.find(x=>x.id==='a')!.masks,undefined);
});
test('P272 wipe out reverses keys, down starts from the top edge below',async()=>{
 const {wipeSpecs}=await import('./wipeCommands');const runCommand=(_:string,p:unknown)=>(wipeSpecs()[0].run as (p?:unknown)=>unknown)(p);
 const s=open();setAnimationSession(s);const l0=findComp(s.document!).layers.find(x=>x.id==='a')!;
 runCommand('animation.layers.wipe',{mode:'out',dir:'down',frames:6,layers:['a'],ease:false});
 const m=findComp(s.document!).layers.find(x=>x.id==='a')!.masks![0];
 assert.equal(m.anim!.size!.keys[0].t,l0.outT-f(6));assert.deepEqual(m.anim!.position!.keys[0].v,[0,0]);
 assert.deepEqual(m.anim!.position!.keys[1].v,[0,m.height]);assert.equal(m.anim!.size!.keys[0].interp,'linear');
});

test('P273 flicker pattern is seeded, starts dim and settles on full',async()=>{
 const {flickerKeys}=await import('./flicker');
 const a=flickerKeys(24,100,5),b=flickerKeys(24,100,5),c=flickerKeys(24,100,6);
 assert.deepEqual(a,b);assert.notDeepEqual(a,c);
 assert.equal(a[0].frame,0);assert.ok(a[0].value<=55);assert.deepEqual(a[a.length-1],{frame:24,value:100});
 assert.ok(a.every((k,i)=>i===0||k.frame>a[i-1].frame));assert.ok(a.length<=25);
});
test('P273 flicker command writes hold opacity keys, skips animated, one undo',async()=>{
 const {flickerSpecs}=await import('./flickerCommands');const run=flickerSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const O=(id:string)=>findComp(s.document!)!.layers.find(l=>l.id===id)!.transform.opacity;
 assert.throws(()=>run({frames:1,layers:['b']}),/2 to/);
 const r=run({frames:12,seed:3,layers:['b']}) as {layers:number};assert.equal(r.layers,1);
 const k=O('b').keys;assert.ok(k.length>=3);assert.ok(k.every(x=>x.interp==='hold'));
 assert.throws(()=>run({layers:['b']}),/opacity already animated/);
 s.undo();assert.equal(O('b').keys.length,0);
 s.dispatch({type:'layer.update',layer:'b',locked:true} as never);assert.throws(()=>run({layers:['b']}),/unlocked/);
});

test('P274 shake offsets decay, are seeded and start and end at zero',async()=>{
 const {shakeOffsets}=await import('./shake');
 const a=shakeOffsets(12,20,4);assert.deepEqual(a,shakeOffsets(12,20,4));assert.notDeepEqual(a,shakeOffsets(12,20,5));
 assert.deepEqual(a[0],[0,0]);assert.deepEqual(a[12],[0,0]);assert.equal(a.length,13);
 assert.ok(Math.abs(a[1][0])>Math.abs(a[11][0]));assert.ok(a.every(o=>Math.abs(o[0])<=20&&Math.abs(o[1])<=20));
});
test('P274 shake command keys position per frame from the playhead, one undo',async()=>{
 const {shakeSpecs}=await import('./shakeCommands');const run=shakeSpecs()[0].run as (p?:unknown)=>unknown;
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});s.setView({playhead:f(10)} as never);
 const P=()=>findComp(s.document!)!.layers.find(l=>l.id==='b')!.transform.position;
 assert.throws(()=>run({frames:1,layers:['b']}),/2 to/);
 const p0=P().value as readonly number[];
 const r=run({amount:10,frames:8,layers:['b']}) as {layers:number};assert.equal(r.layers,1);
 const k=P().keys;assert.equal(k.length,9);assert.equal(k[0].t,f(10));assert.equal(k[8].t,f(18));assert.deepEqual(k[0].v,[...p0]);assert.deepEqual(k[8].v,[...p0]);
 s.undo();assert.equal(P().keys.length,0);
 s.setView({playhead:findComp(s.document!)!.duration-f(2)} as never);assert.throws(()=>run({layers:['b']}),/room/);
});

test('P275 export check: shrunk to zero and empty text are warned, normal layers are not',async()=>{
 const {exportCheck}=await import('./exportCheck');const {defaultExportSettings}=await import('./exportSettings');
 const d0=applyEdits(base(),[{type:'layer.add',kind:'solid',id:'z',over:{name:'Gone'}},{type:'prop.set',layer:'z',prop:'scale',value:[0,0]},{type:'layer.add',kind:'text',id:'e',over:{name:'Blank'}},{type:'layer.update',layer:'e',source:{text:'  '}}] as never);
 const s=new AnimationSession();s.open(d0);const c=findComp(s.document!)!;
 const iss=exportCheck(c,[],defaultExportSettings());
 const sh=iss.find(i=>i.code==='shrunk'),em=iss.find(i=>i.code==='empty');
 assert.ok(sh&&sh.severity==='warn'&&sh.layers.includes('Gone')&&sh.layers.length===1);
 assert.ok(em&&em.layers.includes('Blank'));
});

test('P276 slide: flies in from past the edge, out past it, skips parented and animated layers, one undo',async()=>{
 const {slideSpecs,offCanvas}=await import('./slideCommands');const run=slideSpecs()[0].run as (p?:unknown)=>unknown;
 assert.deepEqual(offCanvas([100,50],'left',800,450),[-700,50]);assert.deepEqual(offCanvas([100,50],'down',800,450),[100,500]);
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'shape',id:'b'});
 const L=()=>findComp(s.document!)!.layers.find(l=>l.id==='b')!;
 const home=L().transform.position.value as readonly number[],c=findComp(s.document!)!;
 assert.throws(()=>run({frames:0,layers:['b']}),/1 to/);
 run({mode:'in',dir:'right',frames:10,layers:['b']});let k=L().transform.position.keys;
 assert.equal(k.length,2);assert.equal(k[0].t,L().inT);assert.equal(k[1].t,L().inT+f(10));assert.deepEqual(k[0].v,[home[0]+c.width,home[1]]);assert.deepEqual(k[1].v,[...home]);
 assert.throws(()=>run({layers:['b']}),/can slide/);
 s.undo();assert.equal(L().transform.position.keys.length,0);
 run({mode:'out',dir:'up',frames:6,layers:['b'],ease:false});k=L().transform.position.keys;
 assert.equal(k[0].t,L().outT-f(6));assert.deepEqual(k[0].v,[...home]);assert.deepEqual(k[1].v,[home[0],home[1]-c.height]);assert.equal(k[0].interp,'linear');
});

test('P277 counter: formats deterministically, replaces {n}, keys count, validates, one undo',async()=>{
 const {formatCount,fullText,revealedText}=await import('./effects');const {countSpecs}=await import('./countCommands');const run=countSpecs()[0].run as (p?:unknown)=>unknown;
 assert.equal(formatCount(1234567.891,2,true),'1,234,567.89');assert.equal(formatCount(-0.4,0,false),'0');assert.equal(formatCount(-12.5,1,true),'-12.5');assert.equal(formatCount(999,0,true),'999');
 const s=open();setAnimationSession(s);s.dispatch({type:'layer.add',kind:'text',id:'t'});s.dispatch({type:'layer.update',layer:'t',source:{text:'{n}% done'}} as never);
 const L=()=>findComp(s.document!)!.layers.find(l=>l.id==='t')!;
 assert.throws(()=>run({layers:['a']}),/text layer/);assert.throws(()=>run({frames:0,layers:['t']}),/1 to/);assert.throws(()=>run({layers:['t'],remove:true}),/no counter/);
 run({from:0,to:100,frames:30,ease:false,layers:['t']});
 assert.equal(fullText(L(),L().inT),'0% done');assert.equal(fullText(L(),L().inT+f(15)),'50% done');assert.equal(fullText(L(),L().inT+f(60)),'100% done');
 assert.equal(revealedText(L(),L().inT+f(30)),'100% done');
 s.undo();assert.equal(L().textCount,undefined);
 s.dispatch({type:'layer.update',layer:'t',source:{text:'x'}} as never);run({from:0,to:10,decimals:1,layers:['t']});assert.equal(fullText(L(),L().inT+f(60)),'10.0');
 run({remove:true,layers:['t']});assert.equal(fullText(L(),0),'x');
});

test('P278 palette shift also moves gradients, colour keys and gradient colour keys',async()=>{
 const {paletteSpecs}=await import('./paletteCommands');const run=paletteSpecs()[1].run as (p?:unknown)=>unknown;
 const T=f(30);
 const d0=applyEdits(base(),[{type:'layer.add',kind:'shape',id:'g'},{type:'layer.update',layer:'g',source:{color:'#ff0000',gradient:{start:'#ff0000',end:'#0000ff',angle:0}}},
  {type:'layer.stroke',layer:'g',stroke:{color:'#ff0000',width:4,gradient:{start:'#ff0000',end:'#00ff00',angle:0}}},
  {type:'color.prop',layer:'g',prop:'fill',op:'animate',on:true,t:0},{type:'color.prop',layer:'g',prop:'fill',op:'set',color:'#00ff00',t:T},
  {type:'gradient.color',layer:'g',target:'fill',which:'start',op:'animate',on:true,t:0},{type:'gradient.color',layer:'g',target:'fill',which:'start',op:'set',color:'#ff0000',t:T}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);
 const L=()=>findComp(s.document!)!.layers.find(l=>l.id==='g')!;
 const before=JSON.stringify(L().colorKeys);
 run({hue:120});
 const l=L();
 assert.equal(l.source.gradient!.end,'#ff0000');assert.equal(l.stroke!.gradient!.start,'#00ff00');assert.equal(l.stroke!.gradient!.end,'#0000ff');
 assert.ok(l.colorKeys!.fill!.some(k=>k.t===T&&k.color==='#0000ff'),JSON.stringify(l.colorKeys));
 assert.ok(l.source.gradient!.colorKeys!.start!.every(k=>k.color==='#00ff00'),JSON.stringify(l.source.gradient));
 s.undo();assert.equal(JSON.stringify(L().colorKeys),before);assert.equal(L().source.gradient!.end,'#0000ff');
});

test('P279 palette: swatches and replace cover gradients and effects, shift moves effect colours and keys',async()=>{
 const {paletteSpecs}=await import('./paletteCommands');const {paletteOf}=await import('./palette');
 const specs=paletteSpecs(),replace=specs.find(x=>x.id==='animation.palette.replace')!.run as (p?:unknown)=>unknown,shift=specs.find(x=>x.id==='animation.palette.shift')!.run as (p?:unknown)=>unknown;
 const d0=applyEdits(base(),[{type:'layer.add',kind:'shape',id:'g'},{type:'layer.update',layer:'g',source:{color:'#112233',gradient:{start:'#ff0000',end:'#0000ff',angle:0}}},
  {type:'layer.effects',layer:'g',effects:[{id:'e1',kind:'glow',enabled:true,amount:0.5,color:'#ff0000',colorKeys:[{t:0,color:'#ff0000'},{t:f(10),color:'#00ff00'}]}]}] as never);
 const s=new AnimationSession();s.open(d0);setAnimationSession(s);
 const L=()=>findComp(s.document!)!.layers.find(l=>l.id==='g')!;
 const red=paletteOf(findComp(s.document!)!.layers).find(x=>x.color==='#ff0000');assert.ok(red);assert.equal(red!.layers,1);
 replace({from:'#ff0000',to:'#abcdef'});
 assert.equal(L().source.gradient!.start,'#abcdef');assert.equal(L().effects![0].color,'#abcdef');assert.equal(L().source.gradient!.end,'#0000ff');
 s.undo();assert.equal(L().source.gradient!.start,'#ff0000');assert.equal(L().effects![0].color,'#ff0000');
 shift({hue:120});assert.equal(L().effects![0].color,'#00ff00');assert.deepEqual(L().effects![0].colorKeys!.map(k=>k.color),['#00ff00','#0000ff']);
 s.undo();assert.equal(L().effects![0].colorKeys![1].color,'#00ff00');
});
