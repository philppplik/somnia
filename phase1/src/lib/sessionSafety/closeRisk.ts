import {liveFor} from './recoveryIndex';
/**
 * Close guard input. Closing the app window is the one way to leave a dirty Documents/Sheets session, so the guard asks first.
 * What it says depends on whether every dirty session already has a verified recovery checkpoint of its current revision.
 */
export interface CloseRisk{
 /** File names with unsaved edits. */
 dirty:string[];
 /** Subset whose newest edits are not covered by a verified checkpoint (checkpoint failed, pinned, or still pending). */
 unprotected:string[];
}
export const closeRisk=(studio:string):CloseRisk=>{
 const dirty:string[]=[],unprotected:string[]=[];
 for(const s of liveFor(studio)){
  if(!s.isDirty())continue;const name=s.id.slice(studio.length+1);dirty.push(name);
  if(!s.cp.isCurrent()||s.cp.pinned)unprotected.push(name);
 }
 return{dirty,unprotected};
};
export type CloseVerdict='allow'|'confirm-recoverable'|'confirm-unprotected';
export const closeVerdict=(r:CloseRisk):CloseVerdict=>r.dirty.length===0?'allow':r.unprotected.length>0?'confirm-unprotected':'confirm-recoverable';
export interface CloseGuardText{recoverable:(names:string)=>string;unprotected:(names:string)=>string}
/**
 * Returns true when the close must be blocked. Nothing dirty: never blocks and never asks. Otherwise the user confirms with a message
 * that states honestly whether a recovery copy exists. `confirm` is window.confirm in the app and injected in tests.
 */
export function windowCloseBlocked(studio:string,text:CloseGuardText,confirm:(message:string)=>boolean,risk:CloseRisk=closeRisk(studio)):boolean{
 const v=closeVerdict(risk);if(v==='allow')return false;
 const list=(v==='confirm-unprotected'?risk.unprotected:risk.dirty).join(', ');
 return !confirm(v==='confirm-unprotected'?text.unprotected(list):text.recoverable(list));
}
