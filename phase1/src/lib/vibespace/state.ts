import {hasPartialStream} from './streamPresentation';
import type {Studio,VibeEvent,VibeSnapshot,StudioState} from './types';
import {parseSnapshot,parseEvent} from './validation';
export interface VibeViewState {snapshot:VibeSnapshot|null;loading:boolean;pending:boolean;error:string|null}
export const initialVibeState:VibeViewState={snapshot:null,loading:true,pending:false,error:null};
export type ViewAction={type:'snapshot';snapshot:VibeSnapshot}|{type:'event';event:VibeEvent}|{type:'pending';pending:boolean}|{type:'error';message:string}|{type:'clear-error'};
export function vibeReducer(state:VibeViewState,action:ViewAction):VibeViewState{
 if(action.type==='event'){
  parseEvent(action.event);
  if(!state.snapshot)return state;
  const current=state.snapshot.studios.find(s=>s.runId===action.event.runId);
  if(!current)return {...state,error:'An unknown run changed. Reload Vibe Space to reconcile.'};
  if(action.event.payload.studioId!==current.studioId||action.event.payload.spaceId!==current.spaceId)return {...state,error:'Run identity changed. Reload Vibe Space to reconcile.'};
  if(action.event.sequence<=current.sequence)return state;
  if(action.event.sequence!==current.sequence+1)return {...state,error:'Run event sequence gap. Reload Vibe Space to reconcile.'};
  return {...state,snapshot:{...state.snapshot,studios:state.snapshot.studios.map(s=>s.runId===action.event.runId?{...action.event.payload,sequence:action.event.sequence}:s)}};
 }
 if(action.type==='snapshot'){
  const snapshot=parseSnapshot(action.snapshot);
  if(state.snapshot&&snapshot.revision<state.snapshot.revision)return state;
  const studios=snapshot.studios.map(s=>{const old=state.snapshot?.studios.find(o=>o.runId===s.runId);return old&&old.sequence>s.sequence?old:s;});
  return {...state,snapshot:{...snapshot,studios},loading:false};
 }
 if(action.type==='clear-error')return {...state,error:null};
 if(action.type==='pending')return {...state,pending:action.pending,error:action.pending?null:state.error};
 return {...state,loading:false,error:action.message};
}
export function studioState(studio:Studio):StudioState{
 if(studio.reviewState==='applied')return 'applied';if(studio.reviewState==='discarded')return 'discarded';
 if(studio.reviewState==='ready'||studio.reviewState==='conflict')return 'ready';
 if(studio.pendingConsents.length)return 'needs-you';
 if(['failed','crashed','stopped','paused','done'].includes(studio.executionState))return studio.executionState as StudioState;
 if(studio.executionState==='pending')return 'draft';return 'running';
}
export function studioControls(studio:Studio,pending:boolean){
 const active=['running','claimed','paused'].includes(studio.executionState);
 return {stop:active&&studio.capabilities.stop&&!pending,steer:active&&studio.capabilities.steer&&!pending,
 consent:active&&!!studio.pendingConsents.length&&!pending,
 review:['ready','conflict'].includes(studio.reviewState)&&studio.executionState==='done'&&!hasPartialStream(studio)&&!!studio.review&&!pending,
 restore:!active&&studio.capabilities.restore&&!pending,
 retry:['failed','crashed'].includes(studio.executionState)&&!!studio.failure?.retryable&&!pending};
}
export function canApply(studio:Studio,paths:string[],pending:boolean):boolean{
 const review=studio.review;
 return studioControls(studio,pending).review&&studio.capabilities.apply&&!!review&&paths.length>0&&new Set(paths).size===paths.length&&paths.every(path=>review.files.some(f=>f.path===path&&!f.conflict)&&!review.conflicts.includes(path));
}
/** Retry is only offered for the Studio's latest run and only while native reports canStart. */
export function canRetry(snapshot:VibeSnapshot,studio:Studio):boolean{
 const session=snapshot.sessions.find(s=>s.studioId===studio.studioId&&s.spaceId===studio.spaceId);
 return studioControls(studio,false).retry&&!!session&&session.canStart&&session.latestRunId===studio.runId;
}
/** Apply needs selectable non-conflict files; discard may only name files in the shown review (the UI sends none). */
export function reviewPathsAllowed(studio:Studio,decision:'apply'|'discard',paths:string[]):boolean{
 if(decision==='apply')return canApply(studio,paths,false);
 const review=studio.review;
 return !!review&&new Set(paths).size===paths.length&&paths.every(p=>review.files.some(f=>f.path===p));
}
export function duration(ms:number):string{const seconds=Math.floor(ms/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
export function costLabel(studio:Studio):string|null{
 const cost=studio.usage?.costUsd;
 if(studio.model.locality==='local'||cost===null||cost===undefined||!Number.isFinite(cost)||cost<=0)return null;
 return `USD ${cost.toFixed(cost<0.01?4:2)}`;
}

export function reviewedHunksAllowed(studio:Studio,details:import('./types').ReviewDetails,paths:string[],hunks:import('./types').HunkSelection[]):boolean {
 if(details.revision!==studio.review?.revision||!studio.capabilities.apply||!studioControls(studio,false).review||studio.review.conflicts.length||!paths.length&&!hunks.length)return false;
 if(new Set([...paths,...hunks.map(h=>h.path)]).size!==paths.length+hunks.length)return false;
 return paths.every(p=>studio.review!.files.some(f=>f.path===p&&!f.conflict))&&hunks.every(s=>{const f=details.files.find(f=>f.path===s.path);return studio.review!.files.some(f=>f.path===s.path&&!f.conflict)&&!!f&&s.hunkIds.length>0&&new Set(s.hunkIds).size===s.hunkIds.length&&s.hunkIds.every(id=>f.hunks.some(h=>h.id===id));});
}
