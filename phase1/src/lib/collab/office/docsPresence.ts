import type {Awareness} from 'y-protocols/awareness';
import {safeUser,type SafeUser} from '../awarenessSafe';
/** Concept 3.2 presence for documents: the caret block/offset of every peer, scoped to one shared file. */
export interface PeerCaret{clientId:number;user:SafeUser;block:number;off:number}
export const CARET_FIELD='officeCaret';
/** Publish my caret for `file`; pass null to clear (document closed, session ended). */
export function announceCaret(a:Awareness,file:string|null,block:number,off:number):void{
 if(!file||!Number.isSafeInteger(block)||!Number.isSafeInteger(off)||block<0||off<0){a.setLocalStateField(CARET_FIELD,null);return;}
 a.setLocalStateField(CARET_FIELD,{file,block,off});}
/** Remote carets on `file`, sanitised: unknown shapes and out-of-range values are dropped. */
export function peerCarets(a:Awareness,file:string):PeerCaret[]{
 const out:PeerCaret[]=[];
 a.getStates().forEach((state,id)=>{
  if(id===a.clientID)return;
  const raw=state?.[CARET_FIELD];
  if(!raw||typeof raw!=='object')return;
  const r=raw as Record<string,unknown>;
  if(r.file!==file||!Number.isSafeInteger(r.block)||!Number.isSafeInteger(r.off))return;
  if((r.block as number)<0||(r.off as number)<0||(r.off as number)>1_000_000)return;
  out.push({clientId:id,user:safeUser(state.user,id),block:r.block as number,off:r.off as number});});
 return out;}
