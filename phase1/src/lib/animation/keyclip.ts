import {findComp,findLayer,type AnimationDocument,type ClipItem,type KeyRef} from './model';
import {snapToFrame} from './time';
/** In-app key clipboard. Keys keep their relative timing, easing and spatial tangents. One source layer per copy. */
export interface KeyClip{items:readonly ClipItem[];span:number}
let clip:KeyClip|null=null;
export const getKeyClip=()=>clip;
export const setKeyClip=(c:KeyClip|null)=>{clip=c;};
export class ClipError extends Error{}
/** Builds clipboard data from selected keys. Throws ClipError when nothing valid is selected or keys come from several layers. */
export function copyKeys(doc:AnimationDocument,refs:readonly KeyRef[]):KeyClip{
 const comp=findComp(doc);if(!comp)throw new ClipError('No active composition.');
 const live=refs.filter(r=>findLayer(comp,r.layer)?.transform[r.prop].keys.some(k=>k.t===r.t));
 if(!live.length)throw new ClipError('Select keys to copy.');
 if(new Set(live.map(r=>r.layer)).size>1)throw new ClipError('Select keys from one layer to copy.');
 const layer=findLayer(comp,live[0].layer)!;
 const keys=live.map(r=>({prop:r.prop,key:layer.transform[r.prop].keys.find(k=>k.t===r.t)!}));
 const first=Math.min(...keys.map(k=>k.key.t)),last=Math.max(...keys.map(k=>k.key.t));
 const items=keys.map(({prop,key})=>({prop,dt:key.t-first,key:{...key}})).sort((a,b)=>a.dt-b.dt||a.prop.localeCompare(b.prop));
 return {items,span:last-first};
}
/** Refs of the pasted keys, for selecting them after a paste. */
export function pastedRefs(layer:string,c:KeyClip,t:number,fps:{num:number;den:number}):KeyRef[]{
 return c.items.map(i=>({layer,prop:i.prop,t:snapToFrame(t+i.dt,fps)}));
}
