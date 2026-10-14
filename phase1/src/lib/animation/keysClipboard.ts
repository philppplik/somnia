import type {Edit} from './edit';
import type {Layer,TransformKey} from './model';
import type {MaskKeysClip} from './masks';
/** One clipboard model for transform and mask keys: relative times, values and ease, with the value type that decides where they fit. */
export type KeysClip=MaskKeysClip;
/** Copies the keys of one transform property at the given times. */
export function copyTransformKeys(layer:Layer,prop:TransformKey,ts:readonly number[]):KeysClip{
 const p=layer.transform[prop],ks=p.keys.filter(k=>ts.includes(k.t));if(!ks.length)throw Error('No keys selected.');
 return {type:p.type as 'scalar'|'vec2',keys:ks.map(k=>({dt:k.t-ks[0].t,v:k.v,interp:k.interp,out:k.out,in:k.in}))};
}
/** Edits that paste `clip` on a transform property with the first key at `t` (one undo step through dispatch). Refuses another value type. */
export function pasteTransformEdits(layer:Layer,prop:TransformKey,t:number,clip:KeysClip):Edit[]{
 if(layer.transform[prop].type!==clip.type)throw Error('The copied keys have another value type.');
 const start:Edit[]=layer.transform[prop].keys.length?[]:[{type:'prop.animate',layer:layer.id,prop,on:true,t}];
 return [...start,...clip.keys.flatMap(k=>[{type:'prop.set' as const,layer:layer.id,prop,t:t+k.dt,value:k.v},{type:'key.interp' as const,layer:layer.id,prop,t:t+k.dt,interp:k.interp,out:k.out,in:k.in}])];
}
