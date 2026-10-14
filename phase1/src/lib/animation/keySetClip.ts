import {useSyncExternalStore} from 'react';
import type {Edit} from './edit';
import type {ClipItem,Composition,KeyRef} from './model';
import {snapToFrame} from './time';
/** Key clipboard that can hold keys from several layers. Relative timing stays across layers. View state only, never saved. */
export interface SetClipGroup{layer:string;items:readonly ClipItem[]}
export interface SetClip{groups:readonly SetClipGroup[];first:number}
export const MAX_SET_CLIP_LAYERS=64;
let clip:SetClip|null=null;
export const getSetClip=()=>clip;
const listeners=new Set<()=>void>();
export const setSetClip=(c:SetClip|null)=>{clip=c;listeners.forEach(l=>l());};
const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
/** Re-renders when the clipboard fills or empties. */
export const useSetClip=()=>useSyncExternalStore(subscribe,getSetClip,getSetClip);
const bad=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
/** Copies the selected keys of any number of layers; the earliest key of all is the anchor. */
export function copySetKeys(c:Composition,refs:readonly KeyRef[]):SetClip{
 const live=refs.filter(r=>c.layers.find(l=>l.id===r.layer)?.transform[r.prop].keys.some(k=>k.t===r.t));
 if(!live.length)return bad('Select keys to copy.');
 const ids=[...new Set(live.map(r=>r.layer))];if(ids.length>MAX_SET_CLIP_LAYERS)return bad('Too many layers to copy.');
 const first=Math.min(...live.map(r=>r.t));
 const groups=c.layers.filter(l=>ids.includes(l.id)).map(l=>({layer:l.id,items:live.filter(r=>r.layer===l.id).map(r=>({prop:r.prop,dt:r.t-first,key:{...l.transform[r.prop].keys.find(k=>k.t===r.t)!}})).sort((a,b)=>a.dt-b.dt||a.prop.localeCompare(b.prop))}));
 return {groups,first};
}
/** Target layers for a paste: none given means the layers the keys came from. One copied layer goes to every target; several map to the targets in timeline order, like the copied layers. */
export function pasteTargets(c:Composition,k:SetClip,targets?:readonly string[]|null):string[]{
 const exists=(id:string)=>c.layers.some(l=>l.id===id);
 if(!targets?.length){const own=k.groups.map(g=>g.layer).filter(exists);if(own.length!==k.groups.length)return bad('A copied layer no longer exists. Pick the target layers.');return own;}
 if(targets.length>MAX_SET_CLIP_LAYERS||!targets.every(exists))return bad('Unknown target layer.');
 if(k.groups.length>1&&targets.length!==k.groups.length)return bad(`The copied keys come from ${k.groups.length} layers. Pick ${k.groups.length} target layers.`);
 return c.layers.map(l=>l.id).filter(id=>targets.includes(id));
}
const groupFor=(k:SetClip,i:number)=>k.groups[k.groups.length===1?0:i];
/** One paste edit per target layer, all in one undo step. `inPlace` keeps the original times. */
export function pasteSetEdits(c:Composition,k:SetClip,t:number,targets?:readonly string[]|null,inPlace=false):Edit[]{
 const ids=pasteTargets(c,k,targets);const at=inPlace?k.first:t;
 return ids.map((layer,i):Edit=>({type:'keys.paste',layer,items:groupFor(k,i).items,t:at}));
}
/** Refs of the pasted keys, to select them after a paste. */
export function pastedSetRefs(c:Composition,k:SetClip,t:number,targets?:readonly string[]|null,inPlace=false):KeyRef[]{
 const ids=pasteTargets(c,k,targets);const at=inPlace?k.first:t;
 return ids.flatMap((layer,i)=>groupFor(k,i).items.map(it=>({layer,prop:it.prop,t:snapToFrame(at+it.dt,c.fps)})));
}
/** All transform keys of the given layers, for selecting the keys of a layer set. */
export function setKeyRefs(c:Composition,layers:readonly string[]):KeyRef[]{
 return c.layers.filter(l=>layers.includes(l.id)).flatMap(l=>(Object.keys(l.transform) as (keyof Composition['layers'][number]['transform'])[]).flatMap(prop=>l.transform[prop].keys.map(k=>({layer:l.id,prop:prop as KeyRef['prop'],t:k.t}))));
}
