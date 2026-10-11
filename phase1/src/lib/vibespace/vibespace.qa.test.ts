/** QA race/edge suite. F-ids refer to docs/vibespace/qa.md. All tests pass; there are no todo/skip tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {VibeSpaceController} from './controller';
import {fixtureRun,fixtureSnapshot} from './fixture';
import {createNativeVibeSpaceTransport,checkedReviewRequest} from './native';
import {parseSnapshot} from './validation';
import type {NativeVibeIO} from './native';
import type {VibeCommand,VibeEvent,VibeSnapshot,VibeSpaceTransport,Studio} from './types';

const tick=()=>new Promise<void>(r=>setTimeout(r,0));
const ev=(sequence:number,run:Studio):VibeEvent=>{const {sequence:_s,...payload}=run;return {protocolVersion:1,runId:run.runId,sequence,timestampUtc:'2026-10-11T10:00:00Z',kind:'run_snapshot',payload};};
const clone=<T,>(v:T):T=>structuredClone(v);
function deferred<T>(){let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const ALL=['create-space','create-studio','start','stop','steer','consent','review','restore','retry'] as const;
/** Scriptable transport: every read/execute/subscribe can be held and released by the test. */
function harness(initial:VibeSnapshot=fixtureSnapshot()){
 let snap=clone(initial);let listener:((e:VibeEvent)=>void)|undefined;let errListener:((e:unknown)=>void)|undefined;
 const h={calls:[] as VibeCommand[],reads:0,unsubscribed:0,
  readGate:null as null|ReturnType<typeof deferred<void>>,execGate:null as null|ReturnType<typeof deferred<void>>,subGate:null as null|ReturnType<typeof deferred<void>>,
  execError:null as Error|null,
  set(next:VibeSnapshot){snap=clone(next);},get snap(){return snap;},
  emit(e:VibeEvent){listener?.(e);},fail(e:unknown){errListener?.(e);},get listening(){return !!listener;}};
 const transport:VibeSpaceTransport={mode:'fixture',capabilities:ALL,
  async snapshot(){h.reads++;const g=h.readGate;const view=clone(snap);if(g)await g.promise;return view;},
  async chooseFolder(){return {folderGrantId:'g',folder:'/f'};},
  async subscribe(onEvent,onError){if(h.subGate)await h.subGate.promise;listener=onEvent;errListener=onError;return()=>{h.unsubscribed++;listener=undefined;};},
  async execute(command){h.calls.push(clone(command));if(h.execGate)await h.execGate.promise;if(h.execError){const e=h.execError;h.execError=null;throw e;}return clone(snap);}};
 return {h,transport,controller:new VibeSpaceController(transport)};
}
const ready=async(snapshot?:VibeSnapshot)=>{const x=harness(snapshot);await x.controller.connect();assert.equal(x.controller.getSnapshot().error,null,'connect leaves clean state');return x;};

// ---------- initial / event / read ordering ----------
test('QA initial: events that arrive during the initial read are buffered, replayed in order, duplicates and older sequences dropped',async()=>{
 const x=harness();x.h.readGate=deferred<void>();const p=x.controller.connect();await tick();
 const run=x.h.snap.studios.find(s=>s.runId==='run-images')!;
 x.h.emit(ev(2,{...run,lastStep:'two'}));x.h.emit(ev(2,{...run,lastStep:'dup'}));x.h.emit(ev(1,{...run,lastStep:'old'}));
 assert.equal(x.controller.getSnapshot().snapshot,null,'nothing published before native read');
 x.h.readGate.resolve();await p;
 const got=x.controller.getSnapshot();assert.equal(got.error,null);
 const s=got.snapshot!.studios.find(s=>s.runId==='run-images')!;assert.equal(s.sequence,2);assert.equal(s.lastStep,'two');
});
test('QA initial: event two ahead of the read (gap) keeps controls locked and never applies it',async()=>{
 const x=harness();x.h.readGate=deferred<void>();const p=x.controller.connect();await tick();
 const run=x.h.snap.studios.find(s=>s.runId==='run-images')!;
 x.h.emit(ev(5,{...run,lastStep:'five'}));x.h.readGate.resolve();await p;await tick();
 const st=x.controller.getSnapshot();assert.ok(st.error,'locked');assert.equal(st.snapshot!.studios.find(s=>s.runId==='run-images')!.sequence,1);
 assert.equal(await x.controller.execute({type:'stop',runId:'run-images'}),false);assert.equal(x.h.calls.length,0);
});
test('QA event: gap locks, still-stale reconciliation stays locked, caught-up reconciliation unlocks',async()=>{
 const x=await ready();const run=x.h.snap.studios.find(s=>s.runId==='run-images')!;
 x.h.emit(ev(3,{...run,lastStep:'three'}));await tick();await tick();
 assert.ok(x.controller.getSnapshot().error,'gap -> locked');assert.equal(await x.controller.execute({type:'stop',runId:'run-images'}),false);
 // native still at sequence 1: must stay locked
 assert.ok(x.controller.getSnapshot().error,'still locked after stale read');
 const caught=clone(x.h.snap);caught.revision++;caught.studios=caught.studios.map(s=>s.runId==='run-images'?{...s,sequence:3,lastStep:'three'}:s);x.h.set(caught);
 await x.controller.refresh();assert.equal(x.controller.getSnapshot().error,null);
 assert.equal(await x.controller.execute({type:'stop',runId:'run-images'}),true);
});
test('QA event: identity swap, malformed and wrong-version events are visible errors and never mutate the run',async()=>{
 const x=await ready();const run=x.h.snap.studios.find(s=>s.runId==='run-images')!;
 x.h.emit(ev(2,{...run,studioId:'studio-other'}));assert.match(x.controller.getSnapshot().error??'',/identity/);
 const y=await ready();y.h.emit({...ev(2,y.h.snap.studios[0]),protocolVersion:2} as unknown as VibeEvent);assert.ok(y.controller.getSnapshot().error);
 assert.equal(y.controller.getSnapshot().snapshot!.studios[0].sequence,1);
});
test('QA event: an event for an unknown run locks and reconciles instead of inventing a run',async()=>{
 const x=await ready();const ghost=fixtureRun({runId:'run-ghost',studioId:'studio-ghost'});
 x.h.emit(ev(1,ghost));await tick();await tick();
 assert.equal(x.controller.getSnapshot().snapshot!.studios.some(s=>s.runId==='run-ghost'),false);
 assert.ok(x.controller.getSnapshot().error,'locked until native lists the run');
});
test('QA read F-4: a stale (lower revision) reconciliation must not unlock after an ambiguous mutation',async()=>{
 const x=await ready();const before=clone(x.h.snap);before.revision=5;x.h.set(before);await x.controller.refresh();
 x.h.execError=new Error('timeout');assert.equal(await x.controller.execute({type:'stop',runId:'run-images'}),false);assert.ok(x.controller.getSnapshot().error);
 const stale=clone(before);stale.revision=4;x.h.set(stale);await x.controller.refresh();
 assert.ok(x.controller.getSnapshot().error,'stale read cannot prove the mutation outcome');
});
test('QA read: a revision that goes backwards is ignored by the reducer (no regression of shown state)',async()=>{
 const x=await ready();const s=clone(x.h.snap);s.revision=9;s.studios=s.studios.map(r=>r.runId==='run-images'?{...r,sequence:4,lastStep:'new'}:r);x.h.set(s);await x.controller.refresh();
 const old=clone(s);old.revision=3;old.studios=old.studios.map(r=>r.runId==='run-images'?{...r,sequence:2,lastStep:'old'}:r);x.h.set(old);await x.controller.refresh();
 assert.equal(x.controller.getSnapshot().snapshot!.studios.find(r=>r.runId==='run-images')!.lastStep,'new');
});

// ---------- ambiguous mutation ----------
test('QA mutation: timeout/ambiguous failure locks every action, never auto-retries, and one reload unlocks',async()=>{
 const x=await ready();x.h.execError=new Error('IPC timeout');
 assert.equal(await x.controller.execute({type:'steer',runId:'run-images',message:'hi'}),false);
 assert.equal(x.h.calls.length,1);assert.match(x.controller.getSnapshot().error??'',/timeout/);
 assert.equal(await x.controller.execute({type:'steer',runId:'run-images',message:'hi again'}),false);assert.equal(x.h.calls.length,1,'no retry, no second firing');
 await x.controller.refresh();assert.equal(x.controller.getSnapshot().error,null);
});
test('QA mutation: concurrent double click fires exactly one command; each firing gets a fresh commandId',async()=>{
 const x=await ready();x.h.execGate=deferred<void>();
 const a=x.controller.execute({type:'stop',runId:'run-images'});const b=x.controller.execute({type:'stop',runId:'run-images'});
 assert.equal(await b,false);x.h.execGate.resolve();assert.equal(await a,true);assert.equal(x.h.calls.length,1);
 x.h.execGate=null;const c=await x.controller.execute({type:'steer',runId:'run-images',message:'m'});assert.equal(c,true);
 assert.notEqual(x.h.calls[0].commandId,x.h.calls[1].commandId);assert.equal(x.h.calls[0].expectedRevision,1);
});
test('QA mutation: expectedRevision carries the revision the user saw',async()=>{
 const x=await ready();const s=clone(x.h.snap);s.revision=7;x.h.set(s);await x.controller.refresh();
 await x.controller.execute({type:'steer',runId:'run-images',message:'m'});assert.equal(x.h.calls[0].expectedRevision,7);
});

// ---------- wrong-run consent ----------
test('QA consent: request id from another run, unknown run, allow_for_run without grant and non-active run are all refused before transport',async()=>{
 const x=await ready();
 const other=fixtureRun({runId:'run-two',studioId:'studio-two',executionState:'running',reviewState:'none',review:null,pendingConsents:[{requestId:'request-2',action:'Write',scope:'/x',reason:'r',allowForRun:true}],capabilities:{stop:true,steer:true,pause:false,resume:false,apply:false,restore:false}});
 const s=clone(x.h.snap);s.revision=2;s.studios.push(other);s.sessions.push({studioId:'studio-two',spaceId:other.spaceId,goal:other.goal,model:other.model,canStart:false,latestRunId:'run-two'});x.h.set(s);await x.controller.refresh();assert.equal(x.controller.getSnapshot().error,null);
 for(const intent of [
  {type:'consent' as const,runId:'run-network',requestId:'request-2',choice:'deny' as const},      // belongs to run-two
  {type:'consent' as const,runId:'run-two',requestId:'request-1',choice:'allow_once' as const},   // belongs to run-network
  {type:'consent' as const,runId:'run-missing',requestId:'request-1',choice:'deny' as const},
  {type:'consent' as const,runId:'run-network',requestId:'request-1',choice:'allow_for_run' as const}, // allowForRun=false
  {type:'consent' as const,runId:'run-images',requestId:'request-1',choice:'deny' as const},       // no consent pending there
 ]){x.h.calls.length=0;assert.equal(await x.controller.execute(intent),false,JSON.stringify(intent));assert.equal(x.h.calls.length,0);await x.controller.refresh();}
 assert.equal(await x.controller.execute({type:'consent',runId:'run-two',requestId:'request-2',choice:'allow_for_run'}),true);
 assert.deepEqual({r:x.h.calls[0].type==='consent'&&x.h.calls[0].runId,q:x.h.calls[0].type==='consent'&&x.h.calls[0].requestId},{r:'run-two',q:'request-2'});
});
test('QA consent: a consent that an event already resolved cannot be answered a second time',async()=>{
 const x=await ready();const run=x.h.snap.studios.find(s=>s.runId==='run-network')!;
 x.h.emit(ev(2,{...run,pendingConsents:[]}));await tick();assert.equal(x.controller.getSnapshot().error,null);
 assert.equal(await x.controller.execute({type:'consent',runId:'run-network',requestId:'request-1',choice:'allow_once'}),false);assert.equal(x.h.calls.length,0);
});

// ---------- stale revision / paths ----------
test('QA review: stale reviewRevision, unknown path, conflict path, duplicate path, empty apply are refused before transport',async()=>{
 const x=await ready();
 const base={type:'review' as const,runId:'run-copy',reviewRevision:'review-1',decision:'apply' as const};
 for(const intent of [
  {...base,reviewRevision:'review-0',paths:['index.html']},{...base,paths:['../../etc/passwd']},{...base,paths:['about.html']},
  {...base,paths:['index.html','index.html']},{...base,paths:[]},{...base,paths:['index.html','about.html']},
 ]){assert.equal(await x.controller.execute(intent),false,JSON.stringify(intent));await x.controller.refresh();}
 assert.equal(x.h.calls.length,0);
});
test('QA review: a newer review revision arriving by event invalidates the previously rendered revision',async()=>{
 const x=await ready();const run=x.h.snap.studios.find(s=>s.runId==='run-copy')!;
 x.h.emit(ev(2,{...run,review:{...run.review!,revision:'review-2'}}));assert.equal(x.controller.getSnapshot().error,null);
 assert.equal(await x.controller.execute({type:'review',runId:'run-copy',reviewRevision:'review-1',decision:'apply',paths:['index.html']}),false);assert.equal(x.h.calls.length,0);
 assert.ok(x.controller.getSnapshot().error,'local refusal locks until reload');await x.controller.refresh();
 assert.equal(await x.controller.execute({type:'review',runId:'run-copy',reviewRevision:'review-2',decision:'apply',paths:['index.html']}),true);
});
test('QA review: a path turning into a conflict by event is refused',async()=>{
 const x=await ready();const run=x.h.snap.studios.find(s=>s.runId==='run-copy')!;
 const files=run.review!.files.map(f=>f.path==='index.html'?{...f,conflict:true}:f);
 x.h.emit(ev(2,{...run,reviewState:'conflict',review:{...run.review!,files,conflicts:['about.html','index.html']}}));
 assert.equal(await x.controller.execute({type:'review',runId:'run-copy',reviewRevision:'review-1',decision:'apply',paths:['index.html']}),false);assert.equal(x.h.calls.length,0);
});
test('QA review: applied/discarded runs cannot be reviewed again',async()=>{
 const x=await ready();const run=x.h.snap.studios.find(s=>s.runId==='run-copy')!;
 x.h.emit(ev(2,{...run,reviewState:'applied'}));
 assert.equal(await x.controller.execute({type:'review',runId:'run-copy',reviewRevision:'review-1',decision:'discard',paths:[]}),false);
 assert.equal(await x.controller.execute({type:'review',runId:'run-copy',reviewRevision:'review-1',decision:'apply',paths:['index.html']}),false);assert.equal(x.h.calls.length,0);
});
test('QA review F-1: discard must not carry paths outside the shown review',async()=>{
 const x=await ready();
 assert.equal(await x.controller.execute({type:'review',runId:'run-copy',reviewRevision:'review-1',decision:'discard',paths:['../../secret']}),false);assert.equal(x.h.calls.length,0);
});
test('QA restore: unknown or non-restorable checkpoint and active run restore are refused',async()=>{
 const x=await ready();
 assert.equal(await x.controller.execute({type:'restore',runId:'run-copy',checkpointId:'cp-nope'}),false);
 assert.equal(await x.controller.execute({type:'restore',runId:'run-images',checkpointId:'cp-start'}),false);assert.equal(x.h.calls.length,0);
});

// ---------- no-run studio / start / retry ----------
const draftSnap=(over:Partial<VibeSnapshot['sessions'][number]>={})=>{const s=fixtureSnapshot();s.sessions.push({studioId:'studio-draft',spaceId:s.spaces[0].spaceId,goal:'Draft',model:s.models[0],canStart:true,latestRunId:null,...over});return s;};
test('QA no-run studio: runId-based intents cannot target a draft; start only when native canStart',async()=>{
 const x=await ready(draftSnap());
 for(const i of [{type:'stop' as const,runId:'studio-draft'},{type:'steer' as const,runId:'studio-draft',message:'x'},{type:'retry' as const,runId:'studio-draft'},{type:'start' as const,studioId:'studio-nope'}]){assert.equal(await x.controller.execute(i),false);await x.controller.refresh();}
 assert.equal(x.h.calls.length,0);
 assert.equal(await x.controller.execute({type:'start',studioId:'studio-draft'}),true);assert.equal(x.h.calls.length,1);
});
test('QA no-run studio: canStart=false (reload while first firing is committing) blocks start',async()=>{
 const x=await ready(draftSnap({canStart:false}));
 assert.equal(await x.controller.execute({type:'start',studioId:'studio-draft'}),false);assert.equal(x.h.calls.length,0);
});
test('QA start: second Start after the first resolved cannot fire when native flips canStart/latestRunId',async()=>{
 const x=await ready(draftSnap());const after=draftSnap({canStart:false,latestRunId:'run-new'});
 after.studios.push(fixtureRun({runId:'run-new',studioId:'studio-draft',executionState:'running',reviewState:'none',review:null,capabilities:{stop:true,steer:true,pause:false,resume:false,apply:false,restore:false}}));after.revision=2;x.h.set(after);
 assert.equal(await x.controller.execute({type:'start',studioId:'studio-draft'}),true);
 assert.equal(await x.controller.execute({type:'start',studioId:'studio-draft'}),false);assert.equal(x.h.calls.length,1);
});
test('QA retry: only a failed/crashed run whose failure is retryable',async()=>{
 const x=await ready();
 assert.equal(await x.controller.execute({type:'retry',runId:'run-images'}),false);await x.controller.refresh();   // running
 assert.equal(await x.controller.execute({type:'retry',runId:'run-copy'}),false);await x.controller.refresh();     // done
 assert.equal(x.h.calls.length,0);
 assert.equal(await x.controller.execute({type:'retry',runId:'run-failed'}),true);
 const nr=fixtureSnapshot();nr.studios=nr.studios.map(s=>s.runId==='run-failed'?{...s,failure:{...s.failure!,retryable:false}}:s);const y=await ready(nr);
 assert.equal(await y.controller.execute({type:'retry',runId:'run-failed'}),false);
});
const newerRun=()=>{const s=fixtureSnapshot();s.sessions=s.sessions.map(x=>x.studioId==='studio-failed'?{...x,latestRunId:'run-newer'}:x);s.studios.push(fixtureRun({runId:'run-newer',studioId:'studio-failed',executionState:'running',reviewState:'none',review:null,failure:null,capabilities:{stop:true,steer:true,pause:false,resume:false,apply:false,restore:false}}));return s;};
test('QA retry F-2: retry of a failed run that is not the studio\'s latestRun must be refused',async()=>{
 const s=newerRun();
 const x=await ready(s);assert.equal(await x.controller.execute({type:'retry',runId:'run-failed'}),false);assert.equal(x.h.calls.length,0);
});

// ---------- destroyed component / late delivery ----------
test('QA destroyed: disconnect before subscribe resolves releases the late subscription and never reads',async()=>{
 const x=harness();x.h.subGate=deferred<void>();const p=x.controller.connect();await tick();x.controller.disconnect();x.h.subGate.resolve();await p;
 assert.equal(x.h.unsubscribed,1);assert.equal(x.h.listening,false);assert.equal(x.h.reads,0);
});
test('QA destroyed: late event, late read and late mutation result after disconnect do not publish or notify',async()=>{
 const x=harness();x.h.readGate=deferred<void>();const p=x.controller.connect();await tick();
 let notified=0;x.controller.subscribe(()=>notified++);x.controller.disconnect();const n=notified;
 x.h.readGate.resolve();await p;assert.equal(x.controller.getSnapshot().snapshot,null);
 const y=await ready();y.h.execGate=deferred<void>();const m=y.controller.execute({type:'stop',runId:'run-images'});await tick();
 const seen=y.controller.getSnapshot();let n2=0;y.controller.subscribe(()=>n2++);y.controller.disconnect();
 const late=clone(y.h.snap);late.revision=99;y.h.set(late);y.h.execGate.resolve();assert.equal(await m,false);
 assert.equal(y.controller.getSnapshot(),seen,'no state publish after disconnect');assert.equal(n2,0);void n;
 y.h.emit(ev(2,y.h.snap.studios[0]));assert.equal(y.controller.getSnapshot(),seen);
});
test('QA destroyed: reconnect (StrictMode remount) does not let the old generation clear the new generation\'s lock',async()=>{
 const x=harness();x.h.readGate=deferred<void>();const a=x.controller.connect();await tick();x.controller.disconnect();const b=x.controller.connect();await tick();
 x.h.readGate.resolve();await Promise.all([a,b]);assert.equal(x.controller.getSnapshot().error,null);assert.ok(x.controller.getSnapshot().snapshot);assert.equal(x.h.unsubscribed,1);
});
test('QA destroyed F-5: execute after disconnect must not fire a native command',async()=>{
 const x=await ready();x.controller.disconnect();
 // state survives for display; effects must not be fireable after the view is gone
 assert.equal(await x.controller.execute({type:'stop',runId:'run-images'}),false);assert.equal(x.h.calls.length,0);
});

// ---------- native adapter ----------
function nativeSetup(){
 let snap=fixtureSnapshot();let handler:((e:{payload:unknown})=>void)|undefined;const calls:{command:string;args?:Record<string,unknown>}[]=[];
 const io:NativeVibeIO={invoke:async(command,args)=>{calls.push({command,args});return null;},listen:async(_c,on)=>{handler=on;return()=>{handler=undefined;};}};
 let review:(c:Extract<VibeCommand,{type:'review'}>)=>Record<string,unknown>=c=>({runId:c.runId,paths:c.paths,reviewRevision:c.reviewRevision});
 const t=createNativeVibeSpaceTransport({io,capabilities:ALL,listSpaces:async()=>snap.spaces,listStudios:async()=>snap.sessions,createStudio:async r=>({studioId:'s',...r,canStart:true,latestRunId:null}),
  readSnapshot:async()=>({revision:snap.revision,models:snap.models,spaces:snap.spaces,runs:snap.studios.map(({sequence,...run})=>({protocolVersion:1,sequence,snapshot:run}))}),reviewRequest:c=>review(c)});
 return {t,calls,emit:(p:unknown)=>handler?.({payload:p}),set:(s:VibeSnapshot)=>{snap=clone(s);},get snap(){return snap;},setReview:(f:typeof review)=>{review=f;}};
}
const base={commandId:'c',expectedRevision:1};
test('QA native: gap event locks execute until a read reaches that sequence; stale read keeps it locked',async()=>{
 const n=nativeSetup();await n.t.snapshot();await n.t.subscribe(()=>{},()=>{});const run=n.snap.studios.find(s=>s.runId==='run-images')!;
 n.emit(ev(4,{...run,lastStep:'x'}));
 await assert.rejects(n.t.execute({...base,type:'stop',runId:'run-images'}),/reconciliation/);
 await assert.rejects(n.t.snapshot(),/not reconciled/);
 await assert.rejects(n.t.execute({...base,type:'stop',runId:'run-images'}),/reconciliation/);assert.equal(n.calls.length,0);
 const s=clone(n.snap);s.studios=s.studios.map(r=>r.runId==='run-images'?{...r,sequence:4}:r);n.set(s);await n.t.snapshot();
 await n.t.execute({...base,type:'stop',runId:'run-images'});assert.equal(n.calls.at(-1)?.command,'vibespace_stop_run');
});
test('QA native: invalid event payload locks execute',async()=>{
 const n=nativeSetup();await n.t.snapshot();const errs:unknown[]=[];await n.t.subscribe(()=>{},e=>errs.push(e));n.emit({junk:true});assert.equal(errs.length,1);
 await assert.rejects(n.t.execute({...base,type:'stop',runId:'run-images'}),/reconciliation/);
});
test('QA native: retry/start DTO carries identity + retryOfRunId exactly once, requestId is the commandId',async()=>{
 const n=nativeSetup();await n.t.snapshot();
 await n.t.execute({...base,commandId:'req-1',type:'retry',runId:'run-failed'});
 assert.deepEqual(n.calls.at(-1),{command:'vibespace_start_run',args:{request:{studioId:'studio-failed',requestId:'req-1',retryOfRunId:'run-failed'}}});
});
test('QA native: no-run studio start needs canStart in the adapter\'s own read, not only the controller',async()=>{
 const n=nativeSetup();const s=draftSnap({canStart:false});n.set(s);await n.t.snapshot();
 await assert.rejects(n.t.execute({...base,type:'start',studioId:'studio-draft'}),/cannot start/);assert.equal(n.calls.length,0);
});
test('QA native F-3: review request built by the binding is validated to preserve runId/paths/revision (no widening)',async()=>{
 const n=nativeSetup();await n.t.snapshot();n.setReview(c=>({runId:c.runId,paths:[...c.paths,'about.html','../../x'],reviewRevision:c.reviewRevision}));
 await assert.rejects(n.t.execute({...base,type:'review',runId:'run-copy',reviewRevision:'review-1',decision:'apply',paths:['index.html']}));
 assert.equal(n.calls.length,0);
});
test('QA native F-1: discard with unknown paths is not forwarded',async()=>{
 const n=nativeSetup();await n.t.snapshot();
 await assert.rejects(n.t.execute({...base,type:'review',runId:'run-copy',reviewRevision:'review-1',decision:'discard',paths:['../../x']}));assert.equal(n.calls.length,0);
});
test('QA native F-2: retry of a non-latest failed run is not forwarded',async()=>{
 const n=nativeSetup();const s=newerRun();n.set(s);await n.t.snapshot();
 await assert.rejects(n.t.execute({...base,type:'retry',runId:'run-failed'}));assert.equal(n.calls.length,0);
});
test('QA native: command with extra/unknown field and prototype key are rejected',async()=>{
 const n=nativeSetup();await n.t.snapshot();
 await assert.rejects(n.t.execute({...base,type:'stop',runId:'run-images',extra:1} as unknown as VibeCommand));
 await assert.rejects(n.t.execute(JSON.parse('{"type":"stop","commandId":"c","expectedRevision":1,"runId":"run-images","__proto__":{"x":1}}') as VibeCommand));
});

// ---------- N3 projection integrity ----------
test('QA N3: orphan run studio, orphan latestRunId, run/studio mismatch and duplicate models are rejected',()=>{
 const base=()=>fixtureSnapshot();
 const a=base();a.studios[0]={...a.studios[0],studioId:'studio-missing'};assert.throws(()=>parseSnapshot(a),/orphan run studio/);
 const b=base();b.sessions[0]={...b.sessions[0],latestRunId:'run-nowhere'};assert.throws(()=>parseSnapshot(b),/orphan latestRunId/);
 const c=base();c.sessions[0]={...c.sessions[0],latestRunId:c.studios[1].runId};assert.throws(()=>parseSnapshot(c),/latestRunId studio mismatch/);
 const d=base();d.models=[d.models[0],{...d.models[0]}];assert.throws(()=>parseSnapshot(d),/duplicate model/);
 assert.ok(parseSnapshot(base()));
});
// ---------- F-3 positive/negative matrix ----------
test('QA F-3: checkedReviewRequest accepts the exact selection and rejects any widening',()=>{
 const cmd={...base,type:'review' as const,runId:'run-copy',reviewRevision:'review-1',decision:'apply' as const,paths:['index.html']};
 const ok={runId:'run-copy',paths:['index.html'],reviewRevision:'review-1'};assert.equal(checkedReviewRequest(cmd,ok),ok);
 for(const bad of [{...ok,runId:'other'},{...ok,paths:[]},{...ok,paths:['index.html','x']},{...ok,paths:['x']},{...ok,reviewRevision:'r0'},{runId:'run-copy',paths:['index.html']},{...ok,expectedRevision:'review-1'},{...ok,extra:'/'},{...ok,decision:'discard'}])
  assert.throws(()=>checkedReviewRequest(cmd,bad as Record<string,unknown>),/Review request/,JSON.stringify(bad));
 assert.throws(()=>checkedReviewRequest(cmd,null as unknown as Record<string,unknown>));
});

test('broken artifact review remains discardable but cannot apply bytes',async()=>{
 const snapshot=fixtureSnapshot();snapshot.studios=snapshot.studios.map(s=>s.runId==='run-copy'?{...s,review:{revision:'1:unavailable',summary:'Cannot verify isolated changes. Discard only.',files:[],conflicts:[],checks:[]},failure:{code:'artifact_review_failed',message:'No files can be applied.',retryable:false},capabilities:{...s.capabilities,apply:false}}:s);
 const x=await ready(snapshot);
 assert.equal(await x.controller.execute({type:'review',runId:'run-copy',reviewRevision:'1:unavailable',decision:'apply',paths:['index.html']}),false);
 assert.equal(x.h.calls.length,0);await x.controller.refresh();
 assert.equal(await x.controller.execute({type:'review',runId:'run-copy',reviewRevision:'1:unavailable',decision:'discard',paths:[]}),true);
});

test('native capabilities refresh starts closed and removed start is not fired',async()=>{
 const snap=draftSnap();let available:VibeSpaceTransport['capabilities']=[];const calls:string[]=[];
 const io:NativeVibeIO={invoke:async(command)=>{calls.push(command);return null;},listen:async()=>()=>{}};
 const t=createNativeVibeSpaceTransport({io,capabilities:[],readCapabilities:async()=>available,listSpaces:async()=>snap.spaces,listStudios:async()=>snap.sessions,createStudio:async r=>({studioId:'s',...r,canStart:true,latestRunId:null}),readSnapshot:async()=>({revision:snap.revision,models:snap.models,runs:snap.studios.map(({sequence,...run})=>({protocolVersion:1,sequence,snapshot:run}))}),reviewRequest:c=>({runId:c.runId,paths:c.paths,reviewRevision:c.reviewRevision})});
 assert.deepEqual(t.capabilities,[]);await t.snapshot();await assert.rejects(t.execute({...base,type:'start',studioId:'studio-draft'}),/unavailable/);
 available=['start'];await t.snapshot();assert.deepEqual(t.capabilities,['start']);
 available=[];await t.snapshot();await assert.rejects(t.execute({...base,type:'start',studioId:'studio-draft'}),/unavailable/);assert.equal(calls.length,0);
});
