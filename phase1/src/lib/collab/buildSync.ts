import type {Awareness} from 'y-protocols/awareness';
import {APP_BUILD} from './buildId';
/** Awareness field carrying the build string. Untrusted input: peers report their own. */
const FIELD='app';
/** Announce our build for the session (engine determinism rule, concept 7.4). */
export function announceBuild(a:Awareness,build:string=APP_BUILD):void{a.setLocalStateField(FIELD,build);}
/** The build a peer announced, sanitised; null when absent, malformed, or 'dev'. */
export function buildOfState(raw:unknown):string|null{
 if(typeof raw!=='string')return null;
 const v=raw.trim();
 return /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(v)&&v!=='dev'?v:null;
}
/** Builds currently announced in the room, keyed by client id (self excluded). */
export function peerBuilds(a:Awareness):Map<number,string>{
 const out=new Map<number,string>();
 a.getStates().forEach((s,id)=>{if(id===a.clientID)return;const b=buildOfState(s?.[FIELD]);if(b)out.set(id,b);});
 return out;
}
/** Client ids whose announced build differs from ours. Office sync must refuse these peers. */
export function buildMismatches(a:Awareness,own:string=APP_BUILD):number[]{
 const mine=buildOfState(own);if(!mine)return [];
 const out:number[]=[];for(const [id,b] of peerBuilds(a))if(b!==mine)out.push(id);
 return out;
}
