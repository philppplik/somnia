import type {OpenInput} from './openHandlers';
import type {OpenResolution} from './openResolver';
import type {OpenHandler} from './openHandlers';
import type {RoutedOpenOffer} from '../extensions/openRouter';
import type {StudioId} from './registry';
/** What the user picked in the open-choice dialog: a built-in Studio or an extension open offer (never a silent winner). */
export type OpenPick=StudioId|{extensionOffer:string};
export interface OpenChoice {mode:'choose-handler'|'safe-text-offer';name:string;reason:string;candidates:OpenHandler[];suggested?:StudioId;
 /** Extension offers for the validated kind, priority-capped below built-ins. Shown for the user to pick, never suggested. */
 offers:readonly RoutedOpenOffer[]}
let current:OpenChoice|null=null;
let finish:((pick:OpenPick|null)=>void)|null=null;
const listeners=new Set<()=>void>();
export const getOpenChoice=()=>current;
export const subscribeOpenChoice=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export function answerOpenChoice(pick:OpenPick|null){
 if(pick&&typeof pick==='object'){if(!current?.offers.some(o=>o.id===pick.extensionOffer))return;}
 else if(pick&&!current?.candidates.some(h=>h.studioId===pick))return;
 const resolve=finish;finish=null;current=null;listeners.forEach(fn=>fn());resolve?.(pick);
}
export function askOpenStudio(input:OpenInput,resolution:Extract<OpenResolution,{status:'choose-handler'|'safe-text-offer'}>,suggested?:StudioId,offers:readonly RoutedOpenOffer[]=[]):Promise<OpenPick|null>{
 // A newer intake cancels the older unanswered choice. No bytes or URLs enter UI state.
 answerOpenChoice(null);
 const candidates=resolution.status==='safe-text-offer'?[resolution.handler]:resolution.candidates;
 return new Promise(resolve=>{finish=resolve;current={mode:resolution.status,name:input.name,reason:resolution.reason,candidates,suggested:suggested??(resolution.status==='safe-text-offer'?resolution.handler.studioId:undefined),offers};listeners.forEach(fn=>fn());});
}
