import type {Awareness} from 'y-protocols/awareness';
import {safeUser,type SafeUser} from '../awarenessSafe';
/** Concept 3.2 presence for decks: the slide each peer is viewing, scoped to one shared file. */
export interface PeerSlidePresence{clientId:number;user:SafeUser;slide:number}
export const SLIDE_FIELD='officeSlide';
/** Publish my slide for `file`; pass null to clear (deck closed, session ended). */
export function announceSlide(a:Awareness,file:string|null,slide:number):void{
 if(!file||!Number.isSafeInteger(slide)||slide<0){a.setLocalStateField(SLIDE_FIELD,null);return;}
 a.setLocalStateField(SLIDE_FIELD,{file,slide});}
/** Remote viewers on `file`, sanitised: unknown shapes and out-of-range slides are dropped. */
export function peerSlides(a:Awareness,file:string):PeerSlidePresence[]{
 const out:PeerSlidePresence[]=[];
 a.getStates().forEach((state,id)=>{
  if(id===a.clientID)return;
  const raw=state?.[SLIDE_FIELD];
  if(!raw||typeof raw!=='object')return;
  const r=raw as Record<string,unknown>;
  if(r.file!==file||!Number.isSafeInteger(r.slide)||(r.slide as number)<0||(r.slide as number)>=100000)return;
  out.push({clientId:id,user:safeUser(state.user,id),slide:r.slide as number});});
 return out;}
