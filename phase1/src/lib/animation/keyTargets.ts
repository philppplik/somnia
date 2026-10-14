import type {Edit} from './edit';
import {findComp,findLayer,PROP_META,TRANSFORM_KEYS,type AnimationDocument,type Composition,type Layer,type LayerMask,type MaskProp,type Property,type TransformKey} from './model';
import {editMaskKeys,easeMaskKeys,copyMaskKeys,pasteMaskKeys,removeMaskKey} from './masks';
import {copyTransformKeys,pasteTransformEdits,type KeysClip} from './keysClipboard';
import {frameToTick,snapToFrame,tickToFrame} from './time';
import {channelOf,EASE_PRESETS,type EasePreset} from './graph';
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
export function normalizedValue(v:Property['value'],bounds:{min:number;max:number},c:0|1=0):number{
 const n=channelOf(v,c);return bounds.max===bounds.min?0.5:(n-bounds.min)/(bounds.max-bounds.min);
}
/** The value range of a property's keys (first channel), widened a little so flat curves still have height. */
export function keyBounds(p:Property,c:0|1=0):{min:number;max:number}{
 const vs=p.keys.map(k=>channelOf(k.v,c));let min=Math.min(...vs),max=Math.max(...vs);
 if(max-min<1e-9){min-=1;max+=1;}return {min,max};
}

export const MASK_BOUNDS:Record<MaskProp,[number,number]>={position:[-16384,16384],size:[1,16384],feather:[0,64],opacity:[0,100]};
/** Clamps a value to the limits of its property. */
export function clampTarget(g:KeyTarget,n:number):number{
 if(g.kind==='mask'){const [lo,hi]=MASK_BOUNDS[g.prop];return Math.min(hi,Math.max(lo,n));}
 const m=PROP_META[g.prop];return Math.min(m.max??Infinity,Math.max(m.min??-Infinity,n));
}
const withChannel=(v:Property['value'],c:0|1,n:number):Property['value']=>Array.isArray(v)?(c===0?[n,v[1]]:[v[0],n]) as unknown as Property['value']:n;
/**
 * Moves the selected keys by `delta` ticks and adds `dv(target)` to their channel `c` (scalars have one) (clamped, rounded to 0.01) in one edit list.
 * Keys keep their ease. Used by value drags and keyboard nudges of the Mixed graph.
 */
export function editTargetKeys(doc:AnimationDocument,layerId:string,sel:readonly TargetKey[],delta:number,dv:(g:KeyTarget)=>number,c:0|1=0):Edit[]{
 const comp=findComp(doc),layer=comp&&findLayer(comp,layerId);if(!comp||!layer)throw Error('Select a layer.');
 if(!Number.isFinite(delta))throw Error('Delta must be a number.');
 const newV=(r:TargetKey)=>{const k=propertyOf(layer,r.target)?.keys.find(x=>x.t===r.t);if(!k)throw Error('Key no longer exists.');return withChannel(k.v,Array.isArray(k.v)?c:0,Math.round(clampTarget(r.target,channelOf(k.v,c)+dv(r.target))*100)/100);};
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

interface PasteItem{target:KeyTarget;t:number;clip:KeysClip}
/** Edits that paste clips (each with its first key at its own time) on their targets: transform pastes become property edits, mask pastes fold into one `layer.masks` edit. */
function pasteItems(layer:Layer,items:readonly PasteItem[]):Edit[]{
 const tr=items.flatMap(i=>i.target.kind==='transform'?pasteTransformEdits(layer,i.target.prop,i.t,i.clip):[]);
 const mk=items.filter((i):i is PasteItem&{target:Extract<KeyTarget,{kind:'mask'}>}=>i.target.kind==='mask');
 if(mk.some(i=>!layer.masks?.some(m=>m.id===i.target.mask)))throw Error('Mask no longer exists.');
 const masks:Edit[]=mk.length?[{type:'layer.masks',layer:layer.id,masks:(layer.masks??[]).map(m=>mk.filter(i=>i.target.mask===m.id).reduce((o,i)=>pasteMaskKeys(o,i.target.prop,i.t,i.clip),m))}]:[];
 return [...tr,...masks];
}
/** Edits that paste a single-property clip with its first key at `t` on each given target (one undo step). A target of another value type refuses everything. */
export function pasteClipOnTargets(doc:AnimationDocument,layerId:string,targets:readonly KeyTarget[],t:number,clip:KeysClip):Edit[]{
 const comp=findComp(doc),layer=comp&&findLayer(comp,layerId);if(!comp||!layer)throw Error('Select a layer.');
 if(!targets.length)throw Error('Select keys of the property to paste into.');
 const s=snapToFrame(t,comp.fps);if(s<comp.start||s>=comp.start+comp.duration)throw Error('Time is outside the composition.');
 return pasteItems(layer,targets.map(target=>({target,t:s,clip})));
}
const FALL={out:[1/3,0] as const,in:[2/3,1/3] as const},RISE={out:[1/3,2/3] as const,in:[2/3,1] as const};
const lerpV=(a:Property['value'],b:Property['value'],f:number):Property['value']=>Array.isArray(a)&&Array.isArray(b)?[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f] as unknown as Property['value']:(a as number)+((b as number)-(a as number))*f;
const round2=(v:Property['value']):Property['value']=>Array.isArray(v)?[Math.round(v[0]*100)/100,Math.round(v[1]*100)/100] as unknown as Property['value']:Math.round((v as number)*100)/100;
export const MAX_BOUNCES=5;
/**
 * Bakes a bounce between two neighbouring keys: the value falls from the first key to the second one's value, rebounds to a fraction
 * (`decay`) of the height and falls again, `bounces` times, landing on the second key. Heights shrink by `decay`, durations by its square root.
 * Returns the clip of ordinary keys (the first key replaced, extra ones inserted; the second key stays untouched), so everything stays editable.
 */
export function bounceClip(p:Property,ta:number,tb:number,fps:Composition['fps'],bounces:number,decay=0.4):KeysClip{
 if(!Number.isInteger(bounces)||bounces<1||bounces>MAX_BOUNCES)throw Error(`Bounces must be 1 to ${MAX_BOUNCES}.`);
 const i=p.keys.findIndex(k=>k.t===ta),a=p.keys[i],b=p.keys[i+1];
 if(!a||!b||b.t!==tb)throw Error('Select two neighbouring keys of one property.');
 if(JSON.stringify(a.v)===JSON.stringify(b.v))throw Error('The two keys have the same value, so nothing falls.');
 const w:number[]=[1];for(let k=1;k<=bounces;k++){const q=Math.sqrt(decay**k);w.push(q,q);}
 const total=w.reduce((x,y)=>x+y,0),fa=tickToFrame(ta,fps),fb=tickToFrame(tb,fps);let acc=0;
 const frames:number[]=[fa];const marks=w.slice(0,-1).map(x=>(acc+=x)/total);
 for(const m of marks){const prev=frames[frames.length-1];frames.push(Math.max(prev+1,Math.round(fa+(fb-fa)*m)));}
 if(frames[frames.length-1]>=fb)throw Error('The segment is too short for this many bounces.');
 const vals:Property['value'][]=[a.v,b.v];for(let k=1;k<=bounces;k++){vals.push(round2(lerpV(b.v,a.v,decay**k)),b.v);}
 // keys: A(fall) I0(rise) P1(fall) I1(rise) ... P_n(fall); the last landing is key B itself
 const seq=[a.v,b.v];const kinds:('f'|'r')[]=['f','r'];
 for(let k=1;k<=bounces;k++){seq.push(vals[2*k]);kinds.push('f');if(k<bounces){seq.push(b.v);kinds.push('r');}}
 return {type:p.type as 'scalar'|'vec2',keys:frames.map((f,j)=>({dt:frameToTick(f,fps)-ta,v:seq[j],interp:'bezier' as const,...(kinds[j]==='f'?FALL:RISE)}))};
}
/** Bakes a bounce between every pair of neighbouring selected keys of each target, as one edit list (one undo step). */
export function bounceTargetKeys(doc:AnimationDocument,layerId:string,sel:readonly TargetKey[],bounces:number):Edit[]{
 const comp=findComp(doc),layer=comp&&findLayer(comp,layerId);if(!comp||!layer)throw Error('Select a layer.');
 const items:PasteItem[]=[];
 for(const id of new Set(sel.map(r=>targetId(r.target)))){
  const rs=sel.filter(r=>targetId(r.target)===id).map(r=>r.t).sort((x,y)=>x-y),g=sel.find(r=>targetId(r.target)===id)!.target,p=propertyOf(layer,g);
  if(!p)throw Error('Property no longer animated.');
  for(let i=0;i+1<rs.length;i++){if(p.keys.findIndex(k=>k.t===rs[i])+1!==p.keys.findIndex(k=>k.t===rs[i+1]))continue;items.push({target:g,t:rs[i],clip:bounceClip(p,rs[i],rs[i+1],comp.fps,bounces)});}
 }
 if(!items.length)throw Error('Select two neighbouring keys of one property.');
 return pasteItems(layer,items);
}
/**
 * Offsets the given layers: the first one (in composition order) stays, each following one starts `frames` frames later than the one before.
 * Moves transform and mask property keys, path-morph keys and (unless `timing` is false) the layer's in and out points, one edit list.
 */
export function staggerLayers(doc:AnimationDocument,layerIds:readonly string[],frames:number,timing=true):Edit[]{
 const comp=findComp(doc);if(!comp)throw Error('Select a layer.');
 if(!Number.isInteger(frames)||Math.abs(frames)>600)throw Error('Offset must be a whole number of frames, at most 600.');
 const ordered=comp.layers.filter(l=>layerIds.includes(l.id));if(ordered.length<2)throw Error('Select at least two layers.');
 const lo=comp.start,hi=comp.start+comp.duration;
 return ordered.flatMap((l,i)=>{
  const delta=frameToTick(frames*i,comp.fps);if(i===0||frames===0)return [];
  const out:Edit[]=[];const tr=allTargetKeys(l).filter(r=>r.target.kind==='transform');
  if(tr.length)out.push(...moveTargetKeys(doc,l.id,tr,delta));
  if(l.masks?.some(m=>m.anim&&MASK_PROPS.some(pr=>m.anim![pr]?.keys.length)||m.shapeKeys?.length)){
   out.push({type:'layer.masks',layer:l.id,masks:l.masks.map(m=>{
    let n=m;for(const pr of MASK_PROPS){const pp=n.anim?.[pr];if(pp?.keys.length)n=editMaskKeys(n,pr,pp.keys.map(k=>({t:k.t,to:k.t+delta,v:k.v})),comp);}
    if(n.shapeKeys?.length){if(n.shapeKeys.some(k=>k.t+delta<lo||k.t+delta>=hi))throw Error('Path keys would leave the composition.');n={...n,shapeKeys:n.shapeKeys.map(k=>({...k,t:k.t+delta}))};}
    return n;})});
  }
  if(timing&&l.kind!=='audio'){const inT=Math.max(0,l.inT+delta),outT=Math.min(comp.duration,l.outT+delta);if(outT<=inT)throw Error('A layer would start after the composition ends.');out.push({type:'layer.timing',layer:l.id,inT,outT});}
  return out;});
}
