import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeVibeSpaceTransport} from './native';
import {fixtureRun,fixtureSnapshot} from './fixture';
import type {NativeVibeIO} from './native';
import type {VibeSnapshot,VibeCommand,VibeEvent} from './types';
function setup(){
 let snapshot=fixtureSnapshot();let handler:((event:{payload:unknown})=>void)|undefined;
 const calls:{command:string;args?:Record<string,unknown>}[]=[];
 const io:NativeVibeIO={invoke:async(command,args)=>{calls.push({command,args});return command==='vibespace_choose_folder'?{folderGrantId:'native-grant',folder:'/native/folder'}:null;},listen:async(channel,onEvent)=>{assert.equal(channel,'somnia://vibespace-run');handler=onEvent;return()=>{handler=undefined;};}};
 const t=createNativeVibeSpaceTransport({io,capabilities:['start','create-space','create-studio','stop','steer','consent','review','restore','retry'],listSpaces:async()=>snapshot.spaces,listStudios:async()=>snapshot.sessions,createStudio:async request=>{calls.push({command:'vibespace_create_studio',args:{request}});return {studioId:'new',...request,canStart:true,latestRunId:null};},readSnapshot:async()=>({revision:snapshot.revision,spaces:snapshot.spaces,models:snapshot.models,runs:snapshot.studios.map(({sequence,...run})=>({protocolVersion:1,sequence,snapshot:run}))}),reviewRequest:command=>({runId:command.runId,paths:command.paths,expectedRevision:command.reviewRevision})});
 return {t,calls,emit:(payload:unknown)=>handler?.({payload}),set:(value:VibeSnapshot)=>{snapshot=value;}};
}
const base={commandId:'command-1',expectedRevision:1};
test('native exact requests: grant, model reference, immutable consent parameters',async()=>{
 const {t,calls}=setup();await t.snapshot();assert.deepEqual(await t.chooseFolder(),{folderGrantId:'native-grant',folder:'/native/folder'});
 await t.execute({...base,type:'create-space',name:'Space',folderGrantId:'native-grant'});
 assert.deepEqual(calls.at(-1),{command:'vibespace_create_space',args:{request:{name:'Space',folderGrantId:'native-grant'}}});
 await t.execute({...base,type:'create-studio',spaceId:'space-demo',goal:'Goal',model:{provider:'ollama',model:'configured',locality:'local'}});
 assert.deepEqual(calls.at(-1)?.args,{request:{spaceId:'space-demo',goal:'Goal',model:{provider:'ollama',model:'configured',locality:'local'}}});
 await t.execute({...base,type:'consent',runId:'run-network',requestId:'request-1',choice:'deny'});
 assert.deepEqual(calls.at(-1),{command:'vibespace_decide_consent',args:{request:{runId:'run-network',requestId:'request-1',choice:'deny'}}});
 await assert.rejects(t.execute({...base,type:'consent',runId:'run-network',requestId:'request-1',choice:'allow_for_run'}),/Consent request changed/);
 await assert.rejects(t.execute({...base,type:'consent',runId:'run-network',requestId:'request-1',choice:'deny',newScope:'/'} as VibeCommand),/command fields/);
});
test('review baseline, conflicts and checkpoint restore validated before native mutation',async()=>{
 const {t,calls}=setup();await t.snapshot();
 await assert.rejects(t.execute({...base,type:'review',runId:'run-copy',reviewRevision:'old',decision:'apply',paths:['index.html']}),/Review changed/);
 await assert.rejects(t.execute({...base,type:'review',runId:'run-copy',reviewRevision:'review-1',decision:'apply',paths:['about.html']}),/conflicts/);assert.equal(calls.length,0);
 await t.execute({...base,type:'review',runId:'run-copy',reviewRevision:'review-1',decision:'apply',paths:['index.html']});assert.equal(calls.at(-1)?.command,'vibespace_apply_run');
 await assert.rejects(t.execute({...base,type:'restore',runId:'run-copy',checkpointId:'unknown'}),/not restorable/);
 await t.execute({...base,type:'restore',runId:'run-copy',checkpointId:'cp-start'});assert.deepEqual(calls.at(-1)?.args,{request:{runId:'run-copy',checkpointId:'cp-start'}});
});
test('capabilities, bad events and sequence gaps lock direct adapter effects',async()=>{
 const {t,calls,emit}=setup();await t.snapshot();let error:unknown;await t.subscribe(()=>{},e=>{error=e;});
 await assert.rejects(t.execute({...base,type:'stop',runId:'run-copy'}),/does not support/);
 const {sequence:_s,...run}=fixtureRun();emit({protocolVersion:1,runId:'wrong',sequence:2,timestampUtc:'2026-10-11T10:00:00Z',kind:'run_snapshot',payload:run});assert.ok(error);
 await assert.rejects(t.execute({...base,type:'stop',runId:'run-images'}),/reconciliation/);assert.equal(calls.length,0);
 await t.snapshot();emit({protocolVersion:1,runId:'run-copy',sequence:5,timestampUtc:'2026-10-11T10:00:00Z',kind:'run_snapshot',payload:run});await assert.rejects(t.execute({...base,type:'stop',runId:'run-images'}),/reconciliation/);
});
test('native read does not regress event projection or introduce fixtures after failure',async()=>{
 const {t,emit}=setup();await t.snapshot();await t.subscribe(()=>{},()=>{});
 const {sequence:_s,...run}=fixtureRun({reviewState:'applied'});emit({protocolVersion:1,runId:run.runId,sequence:2,timestampUtc:'2026-10-11T10:00:00Z',kind:'run_snapshot',payload:run} satisfies VibeEvent);
 assert.equal((await t.snapshot()).studios[0].reviewState,'applied');
 const failing=createNativeVibeSpaceTransport({capabilities:[],listSpaces:async()=>[],listStudios:async()=>[],createStudio:async()=>{throw new Error('unavailable');},readSnapshot:async()=>{throw new Error('Native absent');},reviewRequest:()=>({})});await assert.rejects(failing.snapshot(),/Native absent/);assert.equal(failing.mode,'native');
});
test('start and retry target persistent Studio and create a new run natively',async()=>{
 const {t,calls,set}=setup();const snapshot=fixtureSnapshot();snapshot.sessions.push({studioId:'studio-new',spaceId:'space-demo',goal:'New',model:fixtureRun().model,canStart:true,latestRunId:null});set(snapshot);await t.snapshot();
 await t.execute({...base,type:'start',studioId:'studio-new'});assert.deepEqual(calls.at(-1),{command:'vibespace_start_run',args:{request:{studioId:'studio-new',requestId:'command-1',retryOfRunId:null}}});
 await t.execute({...base,type:'retry',runId:'run-failed'});assert.deepEqual(calls.at(-1),{command:'vibespace_start_run',args:{request:{studioId:'studio-failed',requestId:'command-1',retryOfRunId:'run-failed'}}});
});
test('an event gap cannot be unlocked by a stale direct native read',async()=>{
 const {t,emit,set}=setup();await t.snapshot();await t.subscribe(()=>{},()=>{});const {sequence:_s,...run}=fixtureRun();emit({protocolVersion:1,runId:run.runId,sequence:9,timestampUtc:'2026-10-11T10:00:00Z',kind:'run_snapshot',payload:run});
 await assert.rejects(t.snapshot(),/not reconciled/);await assert.rejects(t.execute({...base,type:'stop',runId:'run-images'}),/reconciliation/);
 const fresh=fixtureSnapshot();fresh.revision=2;fresh.studios[0].sequence=9;set(fresh);await t.snapshot();await t.execute({...base,type:'stop',runId:'run-images'});
});
