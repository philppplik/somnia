import test from 'node:test';
import assert from 'node:assert/strict';
import {VibeSpaceController} from './controller';
import {fixtureRun,fixtureSnapshot,createFixtureVibeSpaceTransport} from './fixture';
import {parseEvent,parseSnapshot,parseRun,parseReply,validateCommand} from './validation';
import {canApply,costLabel,initialVibeState,studioControls,studioState,vibeReducer} from './state';
import type {VibeEvent,VibeSnapshot,VibeCommand} from './types';
const event=(sequence:number,run=fixtureRun()):VibeEvent=>{const {sequence:_s,...payload}=run;return {protocolVersion:1,runId:run.runId,sequence,timestampUtc:'2026-10-11T10:00:00Z',kind:'run_snapshot',payload};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('wire v1: strict credential-free projections, null fields and exact nested keys',()=>{
 assert.ok(parseSnapshot(fixtureSnapshot()));
 const {sequence,...run}=fixtureRun();assert.ok(parseReply({protocolVersion:1,sequence,snapshot:run}));
 assert.throws(()=>parseRun({...run,apiKey:'secret'}));
 assert.throws(()=>parseRun({...run,model:{...run.model,token:'secret'}}));
 assert.throws(()=>parseRun({...run,pendingConsents:[{requestId:'r',action:'a',scope:'s',reason:'r',allowForRun:true,newScope:'/'}]}));
 assert.throws(()=>parseReply({protocolVersion:2,sequence,snapshot:run}));
 assert.throws(()=>parseEvent({...event(2),runId:'wrong'}));
 assert.throws(()=>parseEvent({...event(2),sequence:-1}));
 assert.throws(()=>parseRun({...run,capabilities:{...run.capabilities,purchase:true}}));
});
test('DTO guards: unknown autonomy, invalid cost, duplicate files or binary-as-text',()=>{
 const snapshot=fixtureSnapshot();assert.throws(()=>parseSnapshot({...snapshot,spaces:[{...snapshot.spaces[0],autonomy:'always-write'}]}));
 const {sequence:_s,...run}=fixtureRun();
 assert.throws(()=>parseRun({...run,usage:{...run.usage,costUsd:Infinity}}));
 assert.throws(()=>parseRun({...run,review:{...run.review,files:[run.review!.files[0],run.review!.files[0]]}}));
 assert.throws(()=>parseRun({...run,review:{...run.review,files:[{...run.review!.files[0],binary:true}]}}));
});
test('command validation rejects credential and scope extensions, empty apply',()=>{
 const base={commandId:'c',expectedRevision:1,runId:'r'};
 assert.throws(()=>validateCommand({...base,type:'consent',requestId:'q',choice:'allow_once',newScope:'/'} as VibeCommand));
 assert.throws(()=>validateCommand({...base,type:'review',reviewRevision:'v',decision:'apply',paths:[]}));
 assert.throws(()=>validateCommand({commandId:'c',expectedRevision:1,type:'create-studio',spaceId:'p',goal:'g',model:{provider:'x',model:'m',locality:'cloud',key:'secret'}} as VibeCommand));
});
test('reducer ignores late/duplicate events, blocks gaps and does not regress terminal snapshots',()=>{
 const snapshot=fixtureSnapshot();let state=vibeReducer(initialVibeState,{type:'snapshot',snapshot});
 const applied=fixtureRun({reviewState:'applied'});state=vibeReducer(state,{type:'event',event:event(2,applied)});
 const same=state;state=vibeReducer(state,{type:'event',event:event(1)});assert.equal(state,same);
 state=vibeReducer(state,{type:'snapshot',snapshot:{...snapshot,revision:2}});assert.equal(state.snapshot!.studios[0].reviewState,'applied');
 state=vibeReducer(state,{type:'event',event:event(4)});assert.match(state.error!,/gap/);assert.equal(state.snapshot!.studios[0].sequence,2);
});
test('controls honor capabilities, pending locks, consent and conflicts',()=>{
 const run=fixtureRun();assert.ok(canApply(run,['index.html'],false));assert.ok(!canApply(run,['about.html'],false));assert.ok(!canApply(run,['index.html'],true));assert.ok(!canApply({...run,capabilities:{...run.capabilities,apply:false}},['index.html'],false));
 assert.ok(!studioControls(run,false).stop);assert.ok(studioControls(fixtureSnapshot().studios[2],false).stop);assert.ok(!studioControls(fixtureSnapshot().studios[2],true).stop);
 assert.equal(studioState(fixtureSnapshot().studios[1]),'needs-you');
 assert.equal(costLabel({...run,usage:{...run.usage!,costUsd:0}}),null);assert.equal(costLabel({...run,model:{...run.model,locality:'local'}}),null);assert.match(costLabel(run)!,/0.04/);
});
test('initial read races buffered events safely, stale events cannot undo stop',async()=>{
 const transport=createFixtureVibeSpaceTransport('test');let resolve!:(s:VibeSnapshot)=>void;
 transport.snapshot=()=>new Promise(r=>{resolve=r;});const c=new VibeSpaceController(transport);const connect=c.connect();await tick();
 transport.emit(event(2,fixtureRun({executionState:'stopped',reviewState:'none',review:null})));resolve(fixtureSnapshot());await connect;
 assert.equal(c.getSnapshot().snapshot!.studios[0].executionState,'stopped');transport.emit(event(1));assert.equal(c.getSnapshot().snapshot!.studios[0].executionState,'stopped');c.disconnect();
});
test('gap invokes readSnapshot, effects lock until reconciliation',async()=>{
 const transport=createFixtureVibeSpaceTransport('test');const c=new VibeSpaceController(transport);await c.connect();let resolve!:(s:VibeSnapshot)=>void;
 transport.snapshot=()=>new Promise(r=>{resolve=r;});transport.emit(event(4));await tick();
 assert.match(c.getSnapshot().error!,/reconciliation/);assert.equal(await c.execute({type:'stop',runId:'run-images'}),false);
 const fresh=fixtureSnapshot();fresh.revision=2;fresh.studios[0].sequence=4;resolve(fresh);await tick();assert.equal(c.getSnapshot().error,null);assert.equal(c.getSnapshot().snapshot!.studios[0].sequence,4);c.disconnect();
});
test('native failures are visible, no silent fallback; explicit fixture environment required',async()=>{
 assert.throws(()=>createFixtureVibeSpaceTransport('production' as 'test'));
 const transport=createFixtureVibeSpaceTransport('test');transport.snapshot=async()=>{throw new Error('Native unavailable');};const c=new VibeSpaceController(transport);await c.connect();assert.equal(c.getSnapshot().error,'Native unavailable');assert.equal(c.getSnapshot().snapshot,null);c.disconnect();
});
test('cancel, steer, consent and errors preserve explicit command intent',async()=>{
 const t=createFixtureVibeSpaceTransport('test');const c=new VibeSpaceController(t);await c.connect();
 assert.equal(await c.execute({type:'steer',runId:'run-images',message:'Keep existing colors'}),true);assert.equal(t.calls[0].type,'steer');
 assert.equal(await c.execute({type:'consent',runId:'run-network',requestId:'request-1',choice:'deny'}),true);assert.deepEqual(Object.keys(t.calls[1]).sort(),['choice','commandId','expectedRevision','requestId','runId','type']);
 assert.equal(await c.execute({type:'stop',runId:'run-images'}),true);assert.equal(c.getSnapshot().snapshot!.studios.find(s=>s.runId==='run-images')!.executionState,'stopped');
 t.failNext=new Error('Write conflict');assert.equal(await c.execute({type:'review',runId:'run-copy',reviewRevision:'review-1',decision:'apply',paths:['index.html']}),false);assert.equal(c.getSnapshot().error,'Write conflict');assert.equal(c.getSnapshot().snapshot!.studios[0].reviewState,'ready');c.disconnect();
});
test('invalid protocol during initial read remains a visible resync error',async()=>{
 const t=createFixtureVibeSpaceTransport('test');let resolve!:(s:VibeSnapshot)=>void;t.snapshot=()=>new Promise(r=>{resolve=r;});const c=new VibeSpaceController(t);const p=c.connect();await tick();
 t.emit({...event(2),protocolVersion:2} as unknown as VibeEvent);resolve(fixtureSnapshot());await p;
 assert.match(c.getSnapshot().error!,/version/);assert.equal(await c.execute({type:'stop',runId:'run-images'}),false);c.disconnect();
});
test('duplicate commands blocked while pending, unmounted response cannot publish',async()=>{
 const t=createFixtureVibeSpaceTransport('test');const c=new VibeSpaceController(t);await c.connect();let resolve!:(s:VibeSnapshot)=>void;t.execute=()=>new Promise(r=>{resolve=r;});
 const first=c.execute({type:'stop',runId:'run-images'});assert.equal(await c.execute({type:'stop',runId:'run-images'}),false);
 c.disconnect();resolve({...fixtureSnapshot(),revision:2});assert.equal(await first,false);assert.equal(c.getSnapshot().snapshot!.revision,1);
});
test('same runId cannot migrate to another studio or space, effect requests stay locked',async()=>{
 const t=createFixtureVibeSpaceTransport('test');const c=new VibeSpaceController(t);await c.connect();
 t.emit(event(2,fixtureRun({studioId:'other-studio'})));assert.match(c.getSnapshot().error!,/identity/);assert.equal(c.getSnapshot().snapshot!.studios[0].studioId,'studio-copy');assert.equal(await c.execute({type:'stop',runId:'run-images'}),false);c.disconnect();
});
test('controller enforces consent scope and review conflict gates for any injected transport',async()=>{
 const t=createFixtureVibeSpaceTransport('test');const c=new VibeSpaceController(t);await c.connect();
 assert.equal(await c.execute({type:'consent',runId:'run-network',requestId:'request-1',choice:'allow_for_run'}),false);assert.equal(t.calls.length,0);
 await c.connect();assert.equal(await c.execute({type:'review',runId:'run-copy',reviewRevision:'review-1',decision:'apply',paths:['about.html']}),false);assert.equal(t.calls.length,0);c.disconnect();
});

test('plain-object native rejections keep their stable id and no paths',async()=>{
 const transport=createFixtureVibeSpaceTransport('test');
 transport.snapshot=async()=>{throw {id:'SOM-FS-006',code:'vibespace_ownership_or_recovery',message:'Vibe Space is owned by another GUI/CLI; close it before opening'};};
 const c=new VibeSpaceController(transport);await c.connect();
 assert.match(c.getSnapshot().error??'',/SOM-FS-006/);
 assert.match(c.getSnapshot().error??'',/owned by another/);
 transport.snapshot=async()=>{throw {id:'X-1',message:'C:\\Users\\me\\secret'};};
 const d=new VibeSpaceController(transport);await d.connect();
 assert.doesNotMatch(d.getSnapshot().error??'',/Users/);
 c.disconnect();d.disconnect();
});
test('persisted partial transcript snapshots reconcile by sequence without replay or retarget',async()=>{
 const fixture=fixtureRun({executionState:'running',review:null,reviewState:'none',messages:[{id:'stream-1',role:'assistant_streaming',text:'first',timestampUtc:'2026-10-11T10:00:00Z'}]});const snapshot=fixtureSnapshot();snapshot.studios[0]=fixture;const transport=createFixtureVibeSpaceTransport('test',snapshot);const controller=new VibeSpaceController(transport);await controller.connect();transport.emit(event(2,{...fixture,messages:[{...fixture.messages[0],text:'first second'}]}));transport.emit(event(2,{...fixture,messages:[{...fixture.messages[0],text:'DUPLICATE'}]}));const run=controller.getSnapshot().snapshot!.studios.find(s=>s.runId===fixture.runId)!;assert.equal(run.messages[0].text,'first second');transport.emit(event(3,{...fixture,executionState:'stopped',messages:[{...fixture.messages[0],role:'assistant_incomplete',text:'first second'}]}));assert.equal(controller.getSnapshot().snapshot!.studios[0].messages[0].role,'assistant_incomplete');controller.disconnect();
});
