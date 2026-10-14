import type {Edit} from './edit';
import {findComp,findLayer,PROP_META,TRANSFORM_KEYS,type AnimationDocument,type Layer,type LayerMask,type MaskProp,type Property,type TransformKey} from './model';
import {editMaskKeys,easeMaskKeys,copyMaskKeys,pasteMaskKeys,removeMaskKey} from './masks';
import {copyTransformKeys,pasteTransformEdits,type KeysClip} from './keysClipboard';
import {snapToFrame} from './time';
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
 const n=typeof v==='number'?v:Array.isArray(v)&&typeof v[0]==='number'?v[0]:0;return bounds.max===bounds.min?0.5:(n-bounds.min)/(bounds.max-bounds.min);
}
/** The value range of a property's keys (first channel), widened a little so flat curves still have height. */
export function keyBounds(p:Property):{min:number;max:number}{
 const vs=p.keys.map(k=>Array.isArray(k.v)?k.v[0]:(k.v as number));let min=Math.min(...vs),max=Math.max(...vs);
 if(max-min<1e-9){min-=1;max+=1;}return {min,max};
}

export const MASK_BOUNDS:Record<MaskProp,[number,number]>={position:[-16384,16384],size:[1,16384],feather:[0,64],opacity:[0,100]};
/** Clamps a value to the limits of its property. */
export function clampTarget(g:KeyTarget,n:number):number{
 if(g.kind==='mask'){const [lo,hi]=MASK_BOUNDS[g.prop];return Math.min(hi,Math.max(lo,n));}
 const m=PROP_META[g.prop];return Math.min(m.max??Infinity,Math.max(m.min??-Infinity,n));
}
const withFirst=(v:Property['value'],n:number):Property['value']=>Array.isArray(v)?[n,v[1]] as unknown as Property['value']:n;
const firstOf=(v:Property['value'])=>typeof v==='number'?v:Array.isArray(v)&&typeof v[0]==='number'?v[0]:0;
/**
 * Moves the selected keys by `delta` ticks and adds `dv(target)` to their first channel (clamped, rounded to 0.01) in one edit list.
 * Keys keep their ease. Used by value drags and keyboard nudges of the Mixed graph.
 */
export function editTargetKeys(doc:AnimationDocument,layerId:string,sel:readonly TargetKey[],delta:number,dv:(g:KeyTarget)=>number):Edit[]{
 const comp=findComp(doc),layer=comp&&findLayer(comp,layerId);if(!comp||!layer)throw Error('Select a layer.');
 if(!Number.isFinite(delta))throw Error('Delta must be a number.');
 const newV=(r:TargetKey)=>{const k=propertyOf(layer,r.target)?.keys.find(x=>x.t===r.t);if(!k)throw Error('Key no longer exists.');return withFirst(k.v,Math.round(clampTarget(r.target,firstOf(k.v)+dv(r.target))*100)/100);};
 const tr=sel.filter(r=>r.target.kind==='transform');
 const moves=moveTargetKeys(doc,layerId,sel.filter(r=>r.target.kind==='transform'),delta);
 const sets:Edit[]=tr.map(r=>({type:'prop.set',layer:layerId,prop:(r.target as {prop:TransformKey}).prop,t:r.t+delta,value:newV(r)}));
 const mk=maskRefs(sel);
 const masks:Edit[]=mk.length?masksEdit(layer,sel,(m,prop,ts)=>{return editMaskKeys(m,prop,ts.map(t=>{const r={target:{kind:'mask',mask:m.id,prop} as KeyTarget,t};return {t,to:t+delta,v:newV(r)};}),comp);}):[];
 return [...moves,...sets,...masks];
}
/** Copies keys of any mix of targets; times are relative to the earliest key. */
export interface MultiClip{items:readonly {target:KeyTarget;offset:number;clip:KeysClip}[]}
export function copyTargetKeys(layer:Layer,sel:readonly TargetKey[]):MultiClip{
 if(!sel.length)throw Error('No keys selected.');
 const first=Math.min(...sel.map(r=>r.t));const ids=[...new Set(sel.map(r=>targetId(r.target)))];
 return {items:ids.map(id=>{const rs=sel.filter(r=>targetId(r.target)===id),g=rs[0].target,ts=rs.map(r=>r.t).sort((a,b)=>a-b);
  const clip=g.kind==='transform'?copyTransformKeys(layer,g.prop,ts):copyMaskKeys(layer.masks!.find(m=>m.id===g.mask)!,g.prop,ts);
  return {target:g,offset:ts[0]-first,clip};})};
}
/** Edits that paste a multi clip with its first key at `t` on the same properties (one undo step). Refuses missing or mistyped targets. */
export function pasteTargetKeys(doc:AnimationDocument,layerId:string,t:number,clip:MultiClip):Edit[]{
 const comp=findComp(doc),layer=comp&&findLayer(comp,layerId);if(!comp||!layer)throw Error('Select a layer.');
 const at=(o:number)=>{const s=snapToFrame(t+o,comp.fps);if(s<comp.start||s>=comp.start+comp.duration)throw Error('Time is outside the composition.');return s;};
 const tr=clip.items.flatMap(i=>i.target.kind==='transform'?pasteTransformEdits(layer,i.target.prop,at(i.offset),i.clip):[]);
 const mi=clip.items.filter(i=>i.target.kind==='mask');
 const masks:Edit[]=mi.length?[{type:'layer.masks',layer:layer.id,masks:(layer.masks??[]).map(m=>{let out=m;for(const i of mi){if(i.target.kind==='mask'&&i.target.mask===m.id)out=pasteMaskKeys(out,i.target.prop,at(i.offset),i.clip);}return out;})}]:[];
 if(mi.some(i=>i.target.kind==='mask'&&!layer.masks?.some(m=>m.id===(i.target as {mask:string}).mask)))throw Error('Mask no longer exists.');
 return [...tr,...masks];
}
/** Edits that delete the selected keys of any mix of targets (one undo step). */
export function deleteTargetKeys(doc:AnimationDocument,layerId:string,sel:readonly TargetKey[]):Edit[]{
 const comp=findComp(doc),layer=comp&&findLayer(comp,layerId);if(!comp||!layer)throw Error('Select a layer.');
 const tr=transformRefs(sel).map(r=>({...r,layer:layerId}));
 return [...(tr.length?[{type:'keys.remove',keys:tr} as Edit]:[]),...masksEdit(layer,sel,(m,prop,ts)=>ts.reduce((o,t)=>removeMaskKey(o,prop,t),m))];
}
