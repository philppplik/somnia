import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {VibeCommand, VibeSpaceTransport, VibeSnapshot,SpaceSummary,StudioSummary,ModelRef} from './types';
import {canRetry,reviewPathsAllowed,studioControls,reviewedHunksAllowed} from './state';
import {parseReviewDetails,parseEvent,parseFolderGrant,parseReadProjection,parseStudioSummaries,parseSpaceSummaries,validateCommand} from './validation';

export const nativeCommands = {
 'create-space':'vibespace_create_space','create-studio':'vibespace_create_studio',
 start:'vibespace_start_run',stop:'vibespace_stop_run',steer:'vibespace_steer_run',consent:'vibespace_decide_consent',
 restore:'vibespace_restore_checkpoint',retry:'vibespace_start_run',
} as const;
/** Binding is explicit: the integrator normalizes native read projections to this UI contract.
 * No inferred availability, execution loop, credential handling or fixture fallback here.
 */
export interface NativeVibeBindings {
 /** Test injection only; defaults to native Tauri, not a fallback. */
 io?: NativeVibeIO;
 capabilities: VibeSpaceTransport['capabilities'];
 readCapabilities?: () => Promise<VibeSpaceTransport['capabilities']>;
 readSnapshot: () => Promise<unknown>;
 listSpaces: () => Promise<SpaceSummary[]>;
 listStudios: () => Promise<StudioSummary[]>;
 createStudio: (request:{spaceId:string;goal:string;model:ModelRef}) => Promise<StudioSummary>;
 /** Native apply receives selected paths and review baseline, never a generic tool call. */
 reviewRequest: (command: Extract<VibeCommand,{type:'review'}>, snapshot: VibeSnapshot) => Record<string,unknown>;
}
export interface NativeVibeIO {invoke:(command:string,args?:Record<string,unknown>)=>Promise<unknown>;listen:(channel:string,onEvent:(event:{payload:unknown})=>void)=>Promise<()=>void>}
export function createNativeVibeSpaceTransport(bindings: NativeVibeBindings): VibeSpaceTransport {
 const io=bindings.io??{invoke,listen:(channel:string,onEvent:(event:{payload:unknown})=>void)=>listen<unknown>(channel,onEvent)};
 let current: VibeSnapshot | null = null;
 let capabilities=bindings.capabilities;
 let invalid=false;
 const requiredSequences=new Map<string,number>();
 const refresh=async()=>{
  if(bindings.readCapabilities)capabilities=await bindings.readCapabilities();
  const collection=await bindings.readSnapshot() as Record<string,unknown>;
  const spaces=parseSpaceSummaries(await bindings.listSpaces());
  const sessions=parseStudioSummaries(await bindings.listStudios());
  const fresh=parseReadProjection({...collection,spaces,sessions});
  const studios=fresh.studios.map(s=>{const old=current?.studios.find(o=>o.runId===s.runId);return old&&old.sequence>s.sequence?old:s;});
  current={...fresh,studios};
  for(const [runId,sequence] of requiredSequences){if(!current.studios.some(s=>s.runId===runId&&s.sequence>=sequence)){invalid=true;throw new Error('Native read has not reconciled the event sequence gap.');}}
  requiredSequences.clear();invalid=false;return current;
 };
 return {
  async reviewDetails(runId){
   const studio=current?.studios.find(s=>s.runId===runId);if(!studio)throw new Error('Load the target run.');
   const timeline=await io.invoke('vibespace_run_timeline',{request:{runId}});
   const hunks=studio.review?await io.invoke('vibespace_review_hunks',{request:{runId}}):null;
   return parseReviewDetails(hunks,timeline);
  },
  mode:'native',get capabilities(){return capabilities;},snapshot:refresh,
  async chooseFolder(){const grant=await io.invoke('vibespace_choose_folder');return grant===null?null:parseFolderGrant(grant);},
  async subscribe(onEvent,onError){
   return io.listen('somnia://vibespace-run',event=>{
    try{const parsed=parseEvent(event.payload);if(current){const old=current.studios.find(s=>s.runId===parsed.runId);if(old&&(old.studioId!==parsed.payload.studioId||old.spaceId!==parsed.payload.spaceId))throw new Error('Native run identity changed. Reconciliation required.');if(old&&parsed.sequence===old.sequence+1)current={...current,studios:current.studios.map(s=>s.runId===parsed.runId?{...parsed.payload,sequence:parsed.sequence}:s)};}const old=current?.studios.find(s=>s.runId===parsed.runId);if(!old||parsed.sequence>old.sequence+1){invalid=true;requiredSequences.set(parsed.runId,Math.max(requiredSequences.get(parsed.runId)??0,parsed.sequence));}onEvent(parsed);}catch(error){invalid=true;onError(error);}
   });
  },
  async execute(command:VibeCommand){
   validateCommand(command);
   if(invalid)throw new Error('Native events need reconciliation before acting.');
   if(!capabilities.includes(command.type))throw new Error(`Vibe Space action unavailable: ${command.type}`);
   if(command.type==='start'&&!current?.sessions.some(s=>s.studioId===command.studioId&&s.canStart))throw new Error('Studio cannot start. Reload native state.');
   if('runId' in command){
    const studio=current?.studios.find(s=>s.runId===command.runId);
    if(!studio)throw new Error('Load the target run before acting.');
    const controls=studioControls(studio,false);
    if(command.type==='stop'&&!controls.stop||command.type==='steer'&&!controls.steer||command.type==='restore'&&!controls.restore||command.type==='retry'&&!(current&&canRetry(current,studio)))throw new Error('This run does not support the requested action.');
    if(command.type==='consent'){
     const consent=studio.pendingConsents.find(c=>c.requestId===command.requestId);
     if(!controls.consent||!consent||command.choice==='allow_for_run'&&!consent.allowForRun)throw new Error('Consent request changed. Reload and review it again.');
    }
    if(command.type==='review'&&(!controls.review||studio.review?.revision!==command.reviewRevision||!reviewPathsAllowed(studio,command.decision,command.paths)))throw new Error('Review changed or contains conflicts. Reload and review it again.');
    if((command.type==='request-changes'||command.type==='apply-hunks')&&(!controls.review||studio.review?.revision!==command.reviewRevision))throw new Error('Review changed. Reload before acting.');
    if(command.type==='restore'&&!studio.checkpoints.some(c=>c.checkpointId===command.checkpointId&&c.restorable))throw new Error('Checkpoint is not restorable.');
   }
   // Each DTO contains only exact wire fields. Consent cannot change targets or args.
   switch(command.type){
    case 'create-space':await io.invoke(nativeCommands[command.type],{request:{name:command.name,folderGrantId:command.folderGrantId}});break;
    case 'create-studio':parseStudioSummaries([await bindings.createStudio({spaceId:command.spaceId,goal:command.goal,model:command.model})]);break;
    case 'consent':await io.invoke(nativeCommands[command.type],{request:{runId:command.runId,requestId:command.requestId,choice:command.choice}});break;
    case 'request-changes':await io.invoke('vibespace_request_changes',{request:{runId:command.runId,reviewRevision:command.reviewRevision,requestId:command.commandId,message:command.message}});break;
    case 'apply-hunks':{
     const studio=current!.studios.find(s=>s.runId===command.runId)!;
     const details=parseReviewDetails(await io.invoke('vibespace_review_hunks',{request:{runId:command.runId}}),[]);
     if(!reviewedHunksAllowed(studio,details,command.paths,command.hunks))throw new Error('Hunk selection changed or conflicts. Reload before applying.');
     await io.invoke('vibespace_apply_hunks',{request:{runId:command.runId,reviewRevision:command.reviewRevision,paths:command.paths,hunks:command.hunks}});break;
    }
    case 'review':
     if(!current)throw new Error('Load Vibe Space before reviewing changes.');
     await io.invoke(command.decision==='apply'?'vibespace_apply_run':'vibespace_discard_run',{request:checkedReviewRequest(command,bindings.reviewRequest(command,current))});break;
    case 'steer':await io.invoke(nativeCommands[command.type],{request:{runId:command.runId,message:command.message}});break;
    case 'restore':await io.invoke(nativeCommands[command.type],{request:{runId:command.runId,checkpointId:command.checkpointId}});break;
    case 'start':await io.invoke(nativeCommands.start,{request:{studioId:command.studioId,requestId:command.commandId,retryOfRunId:null}});break;
    case 'retry':{
     const studio=current?.studios.find(s=>s.runId===command.runId);
     if(!studio)throw new Error('Load the Studio before retrying it.');
     await io.invoke(nativeCommands.retry,{request:{studioId:studio.studioId,requestId:command.commandId,retryOfRunId:studio.runId}});break;
    }
    case 'stop':await io.invoke(nativeCommands[command.type],{request:{runId:command.runId}});break;
   }
   return refresh();
  },
 };
}

const reviewRequestKeys=['runId','paths','reviewRevision','expectedRevision','baselineRevision','revision','decision'];
const reviewRevisionKeys=['reviewRevision','expectedRevision','baselineRevision','revision'];
/** The binding maps names only. It must carry exactly the reviewed run, revision and selection (discard: none or the same shown files). */
export function checkedReviewRequest(command:Extract<VibeCommand,{type:'review'}>,request:Record<string,unknown>):Record<string,unknown>{
 const bad=(why:string):never=>{throw new Error(`Review request does not match the reviewed selection: ${why}`);};
 if(!request||typeof request!=='object'||Array.isArray(request))return bad('shape');
 const extra=Object.keys(request).filter(k=>!reviewRequestKeys.includes(k));if(extra.length)bad(`unexpected field ${extra[0]}`);
 if(request.runId!==command.runId)bad('runId');
 const paths=request.paths;if(!Array.isArray(paths)||paths.length!==command.paths.length||paths.some((p,i)=>p!==command.paths[i]))bad('paths');
 const revisions=reviewRevisionKeys.filter(k=>k in request);if(revisions.length!==1||request[revisions[0]]!==command.reviewRevision)bad('revision');
 if('decision' in request&&request.decision!==command.decision)bad('decision');
 return request;
}
