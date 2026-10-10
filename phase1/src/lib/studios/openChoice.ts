import type {OpenInput} from './openCoordinator';
import type {OpenResolution} from './openResolver';
import type {OpenHandler} from './openHandlers';
import type {StudioId} from './registry';
export interface OpenChoice {name:string;reason:string;candidates:OpenHandler[];suggested?:StudioId}
let current:OpenChoice|null=null;
let finish:((studio:StudioId|null)=>void)|null=null;
const listeners=new Set<()=>void>();
export const getOpenChoice=()=>current;
export const subscribeOpenChoice=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export function answerOpenChoice(studio:StudioId|null){
 if(studio&&!current?.candidates.some(h=>h.studioId===studio))return;
 const resolve=finish;finish=null;current=null;listeners.forEach(fn=>fn());resolve?.(studio);
}
export function askOpenStudio(input:OpenInput,resolution:Extract<OpenResolution,{status:'choose-handler'|'safe-text-offer'|'unsupported'|'invalid'}>,suggested?:StudioId):Promise<StudioId|null>{
 // A newer intake cancels the older unanswered choice. No bytes or URLs enter UI state.
 answerOpenChoice(null);
 const candidates=resolution.status==='safe-text-offer'?[resolution.handler]:resolution.status==='choose-handler'?resolution.candidates:[];
 return new Promise(resolve=>{finish=resolve;current={name:input.name,reason:resolution.reason,candidates,suggested};listeners.forEach(fn=>fn());});
}
