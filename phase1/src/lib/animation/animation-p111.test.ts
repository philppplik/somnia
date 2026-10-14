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
