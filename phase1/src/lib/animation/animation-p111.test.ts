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
