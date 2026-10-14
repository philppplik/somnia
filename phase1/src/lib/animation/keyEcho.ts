import type {Edit} from './edit';
import type {ClipItem,Composition,KeyRef,Keyframe} from './model';
import {frameToTick,snapToFrame} from './time';
export const MAX_ECHO_FRAMES=600,MAX_ECHO_KEYS=600;
const bad=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
/** Copy the selected transform keys `frames` later (negative: earlier); the originals stay. Copies outside the composition are dropped; a copy landing on an existing key replaces it. */
export function echoEdits(c:Composition,refs:readonly KeyRef[],frames:number):Edit[]{
 if(!Number.isInteger(frames)||frames===0||Math.abs(frames)>MAX_ECHO_FRAMES)return bad(`Shift by 1 to ${MAX_ECHO_FRAMES} frames, earlier or later.`);
 const live=refs.filter(r=>c.layers.find(l=>l.id===r.layer)?.transform[r.prop].keys.some(k=>k.t===r.t));
 if(!live.length)return bad('Select keys to echo.');
 const shift=frameToTick(Math.abs(frames),c.fps)*Math.sign(frames),lo=c.start,hi=c.start+c.duration,first=Math.min(...live.map(r=>r.t)),edits:Edit[]=[];let total=0;
 for(const layer of c.layers){
  const mine=live.filter(r=>r.layer===layer.id);if(!mine.length)continue;
  const items:ClipItem[]=[];
  for(const r of mine){
   const k=layer.transform[r.prop].keys.find(x=>x.t===r.t)!,abs=snapToFrame(k.t+shift,c.fps);
   if(abs<lo||abs>hi)continue;
   items.push({prop:r.prop,dt:abs-first,key:{...k,t:abs} as Keyframe});
  }
  if(!items.length)continue;total+=items.length;if(total>MAX_ECHO_KEYS)return bad('Too many keys to echo.');
  edits.push({type:'keys.paste',layer:layer.id,items,t:first});
 }
 if(!edits.length)return bad('The echoes would fall outside the composition.');
 return edits;
}
