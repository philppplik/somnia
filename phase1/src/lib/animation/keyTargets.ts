import type {Edit} from './edit';
import {findComp,findLayer,TRANSFORM_KEYS,type AnimationDocument,type Layer,type LayerMask,type MaskProp,type Property,type TransformKey} from './model';
import {editMaskKeys,easeMaskKeys} from './masks';
import {EASE_PRESETS,type EasePreset} from './graph';
/**
 * One key model for every animated property of a layer. A target says where the keys live (a transform property or a mask property);
 * the adapter functions below read them and turn a gesture into edits, so graph editors, selection and clipboards need not know the difference.
 */
export type KeyTarget={kind:'transform';prop:TransformKey}|{kind:'mask';mask:string;prop:MaskProp};
export interface TargetKey{target:KeyTarget;t:number}
export const MASK_PROPS=['position','size','feather','opacity'] as const;
export const targetId=(g:KeyTarget)=>g.kind==='transform'?`t:${g.prop}`:`m:${g.mask}:${g.prop}`;
export const sameTarget=(a:KeyTarget,b:KeyTarget)=>targetId(a)===targetId(b);
export const sameTargetKey=(a:TargetKey,b:TargetKey)=>a.t===b.t&&sameTarget(a.target,b.target);
/** The animated property a target points at, if it still exists. */
export function propertyOf(layer:Layer,g:KeyTarget):Property|undefined{
 if(g.kind==='transform')return layer.transform[g.prop];
 return layer.masks?.find(m=>m.id===g.mask)?.anim?.[g.prop];
}
/** Every target of a layer that has at least one key, in display order (transform first, then masks). */
export function animatedTargets(layer:Layer):KeyTarget[]{
 return [...TRANSFORM_KEYS.filter(p=>layer.transform[p].keys.length>0).map(prop=>({kind:'transform',prop}) as KeyTarget),
  ...(layer.masks??[]).flatMap(m=>MASK_PROPS.filter(p=>m.anim?.[p]?.keys.length).map(prop=>({kind:'mask',mask:m.id,prop}) as KeyTarget))];
}
export const allTargetKeys=(layer:Layer):TargetKey[]=>animatedTargets(layer).flatMap(target=>propertyOf(layer,target)!.keys.map(k=>({target,t:k.t})));
/** Drops references to keys that no longer exist (after undo or delete). */
export const pruneTargetKeys=(layer:Layer|undefined,sel:readonly TargetKey[]):TargetKey[]=>layer?sel.filter(r=>propertyOf(layer,r.target)?.keys.some(k=>k.t===r.t)):[];
/** Click semantics shared with the transform graph: plain click replaces, additive toggles. */
export function toggleTargetKey(sel:readonly TargetKey[],k:TargetKey,additive:boolean):TargetKey[]{
 const has=sel.some(x=>sameTargetKey(x,k));
 if(!additive)return has&&sel.length===1?[...sel]:[k];
 return has?sel.filter(x=>!sameTargetKey(x,k)):[...sel,k];
}
const maskRefs=(sel:readonly TargetKey[])=>sel.filter((r):r is {target:Extract<KeyTarget,{kind:'mask'}>;t:number}=>r.target.kind==='mask');
const transformRefs=(sel:readonly TargetKey[])=>sel.flatMap(r=>r.target.kind==='transform'?[{layer:'',prop:r.target.prop,t:r.t}]:[]);
/** Applies `fn` to the masks that own selected keys and returns them as one `layer.masks` edit; mask edits replace the whole list, so they must be combined. */
function masksEdit(layer:Layer,sel:readonly TargetKey[],fn:(m:LayerMask,prop:MaskProp,ts:number[])=>LayerMask):Edit[]{
 const refs=maskRefs(sel);if(!refs.length)return [];
 const masks=(layer.masks??[]).map(m=>{
  let out=m;
  for(const prop of MASK_PROPS){const ts=refs.filter(r=>r.target.mask===m.id&&r.target.prop===prop).map(r=>r.t);if(ts.length)out=fn(out,prop,ts);}
  return out;});
 return [{type:'layer.masks',layer:layer.id,masks}];
}
/** Moves the selected keys of any mix of targets by `delta` ticks in one edit list (one undo step), keeping values and eases. Throws when a key would collide. */
export function moveTargetKeys(doc:AnimationDocument,layerId:string,sel:readonly TargetKey[],delta:number):Edit[]{
 const comp=findComp(doc),layer=comp&&findLayer(comp,layerId);if(!comp||!layer)throw Error('Select a layer.');
 if(!Number.isFinite(delta))throw Error('Delta must be a number.');
 if(delta===0||!sel.length)return [];
 const tr=transformRefs(sel).map(r=>({...r,layer:layerId}));
 return [...(tr.length?[{type:'keys.move',keys:tr,delta} as Edit]:[]),
  ...masksEdit(layer,sel,(m,prop,ts)=>{const p=m.anim![prop]!;return editMaskKeys(m,prop,ts.map(t=>({t,to:t+delta,v:p.keys.find(k=>k.t===t)!.v})),comp);})];
}
/** Applies an ease preset to the selected keys of any mix of targets in one edit list. */
export function easeTargetKeys(doc:AnimationDocument,layerId:string,sel:readonly TargetKey[],preset:EasePreset):Edit[]{
 const comp=findComp(doc),layer=comp&&findLayer(comp,layerId);if(!comp||!layer)throw Error('Select a layer.');
 const e=EASE_PRESETS[preset];if(!e)throw Error('Unknown ease preset.');
 const tr=transformRefs(sel).map(r=>({...r,layer:layerId}));
 return [...(tr.length?[{type:'keys.interp',keys:tr,interp:e.interp,...('out' in e?{out:e.out,in:e.in}:{})} as Edit]:[]),
  ...masksEdit(layer,sel,(m,prop,ts)=>easeMaskKeys(m,prop,ts,preset))];
}
/** Position of a key on a 0..1 scale of its own property (first channel), so properties with different units share one graph. */
export function normalizedValue(v:Property['value'],bounds:{min:number;max:number}):number{
 const n=Array.isArray(v)?v[0]:(v as number);return bounds.max===bounds.min?0.5:(n-bounds.min)/(bounds.max-bounds.min);
}
/** The value range of a property's keys (first channel), widened a little so flat curves still have height. */
export function keyBounds(p:Property):{min:number;max:number}{
 const vs=p.keys.map(k=>Array.isArray(k.v)?k.v[0]:(k.v as number));let min=Math.min(...vs),max=Math.max(...vs);
 if(max-min<1e-9){min-=1;max+=1;}return {min,max};
}
