import {evaluate} from './interpolate';
import {findComp,findLayer,newId,PROP_META,TRANSFORM_KEYS,type AnimationDocument,type Interp,type KeyRef,type Layer,type PropValue,type TransformKey} from './model';
import {snapToFrame,TICKS_PER_SECOND} from './time';
import type {Edit} from './edit';
import {MAX_MOTION_KEYS,MAX_USER_MOTIONS,MOTION_LIB_VERSION,validMotion,type MotionSet,type MotionTrack} from './motionModel';
import {animationSession,useAnimationState} from './session';
export {MAX_USER_MOTIONS,MAX_MOTION_KEYS,MOTION_LIB_VERSION,validMotion,validateMotionLib,type MotionSet,type MotionTrack,type MotionLib} from './motionModel';
/** Position, anchor and rotation are stored as offsets so a preset fits any layer; scale and opacity keep their absolute values. */
const RELATIVE:ReadonlySet<TransformKey>=new Set(['anchor','position','rotation']);
const S=TICKS_PER_SECOND;
type Ease={interp:Interp;out:readonly [number,number];in:readonly [number,number]};
const ease:Ease={interp:'bezier',out:[0.33,0],in:[0.67,1]};
const track=(prop:TransformKey,keys:[number,PropValue,Partial<Ease>?][]):MotionTrack=>({prop,rel:RELATIVE.has(prop),keys:keys.map(([s,v,e])=>({dt:Math.round(s*S),v,...ease,...(e??{})}))});
const overshoot:Partial<Ease>={out:[0.34,1.56],in:[0.64,1]};
/** Five original built-in presets. */
export const BUILTIN_MOTIONS:readonly MotionSet[]=[
 {id:'builtin-pop',name:'pop',builtin:true,tracks:[track('scale',[[0,[0,0],overshoot],[0.5,[100,100]]]),track('opacity',[[0,0],[0.2,100]])]},
 {id:'builtin-pulse',name:'pulse',builtin:true,tracks:[track('scale',[[0,[100,100]],[0.3,[112,112]],[0.6,[100,100]]])]},
 {id:'builtin-float',name:'float',builtin:true,tracks:[track('position',[[0,[0,0]],[1,[0,-12]],[2,[0,0]]])]},
 {id:'builtin-swing',name:'swing',builtin:true,tracks:[track('rotation',[[0,0],[0.25,8],[0.5,-8],[0.75,4],[1,0]])]},
 {id:'builtin-fadeout',name:'fadeOut',builtin:true,tracks:[track('opacity',[[0,100],[0.5,0]])]},
];
const add=(a:PropValue,b:PropValue):PropValue=>Array.isArray(a)&&Array.isArray(b)?[a[0]+b[0],a[1]+b[1]] as unknown as PropValue:(a as number)+(b as number);
const sub=(a:PropValue,b:PropValue):PropValue=>Array.isArray(a)&&Array.isArray(b)?[a[0]-b[0],a[1]-b[1]] as unknown as PropValue:(a as number)-(b as number);
const clampV=(prop:TransformKey,v:PropValue):PropValue=>{const m=PROP_META[prop];const c=(n:number)=>Math.round(Math.min(m.max??Infinity,Math.max(m.min??-Infinity,n))*100)/100;return Array.isArray(v)?[c(v[0]),c(v[1])] as unknown as PropValue:c(v as number);};
/** Edits that apply `set` to a layer with its first key at `at` (one undo step). Never overwrites: a property that already has keys refuses the whole preset. */
export function motionEdits(doc:AnimationDocument,layerId:string,set:MotionSet,at:number):Edit[]{
 const c=findComp(doc),l=c&&findLayer(c,layerId);if(!c||!l)throw Error('Select a layer.');if(l.locked)throw Error('Layer is locked.');
 const start=snapToFrame(at,c.fps);const out:Edit[]=[];
 for(const tr of set.tracks){
  if(l.transform[tr.prop].keys.length)throw Error(`${tr.prop} already has keys. Remove them before applying a preset.`);
  const base=evaluate(l.transform[tr.prop],start);let last=-Infinity;
  const keys=tr.keys.map(k=>{const t=snapToFrame(start+k.dt,c.fps);if(t<=last)throw Error('The preset is too short for this frame rate.');last=t;
   if(t<c.start||t>c.start+c.duration)throw Error('The preset does not fit the composition.');return {t,k,v:clampV(tr.prop,tr.rel?add(base,k.v):k.v)};});
  out.push({type:'prop.animate',layer:l.id,prop:tr.prop,on:true,t:keys[0].t});
  for(const {t,k,v} of keys)out.push({type:'prop.set',layer:l.id,prop:tr.prop,t,value:v},{type:'key.interp',layer:l.id,prop:tr.prop,t,interp:k.interp,out:k.out,in:k.in});
 }
 return out;
}
/** Builds a preset from selected transform keys of a layer; times are relative to the earliest key, relative properties become offsets from their first selected key. */
export function motionFromKeys(layer:Layer,sel:readonly KeyRef[],name:string):MotionSet{
 const n=name.trim();if(!n||n.length>40)throw Error('Name the preset with 1 to 40 characters.');
 const mine=sel.filter(r=>r.layer===layer.id);if(!mine.length)throw Error('Select keys first.');
 const t0=Math.min(...mine.map(r=>r.t));const tracks:MotionTrack[]=[];let total=0;
 for(const prop of TRANSFORM_KEYS){
  const ks=layer.transform[prop].keys.filter(k=>mine.some(r=>r.prop===prop&&r.t===k.t));if(!ks.length)continue;
  const rel=RELATIVE.has(prop),base=ks[0].v;total+=ks.length;
  tracks.push({prop,rel,keys:ks.map(k=>({dt:k.t-t0,v:rel?sub(k.v,base):k.v,interp:k.interp,out:k.out,in:k.in}))});
 }
 if(total>MAX_MOTION_KEYS)throw Error(`At most ${MAX_MOTION_KEYS} keys per preset.`);
 return {id:newId('motion'),name:n,tracks};
}
// ---- local library (view state in localStorage, never in the document) ----
/** Document-stored presets (empty when the document has none yet). */
export const userMotions=(doc:AnimationDocument|null|undefined):readonly MotionSet[]=>doc?.motions?.items??[];
const cache=new WeakMap<object,readonly MotionSet[]>();
export function listMotions(doc:AnimationDocument|null|undefined):readonly MotionSet[]{
 const items=doc?.motions?.items;if(!items?.length)return BUILTIN_MOTIONS;
 const hit=cache.get(items);if(hit)return hit;const all=[...BUILTIN_MOTIONS,...items];cache.set(items,all);return all;
}
export const findMotion=(doc:AnimationDocument|null|undefined,id:string)=>listMotions(doc).find(m=>m.id===id);
/** Hook: built-in plus the open document's presets. Re-renders on every document change. */
export function useMotions():readonly MotionSet[]{useAnimationState();return listMotions(animationSession().document);}
const edit=(items:readonly MotionSet[]):Edit=>({type:'motions.set',items:items.map(m=>({id:m.id,name:m.name.trim(),tracks:m.tracks}))});
/** Edit that adds one preset. Refuses a duplicate name and a full library. */
export function saveMotionEdit(doc:AnimationDocument,set:MotionSet):Edit{
 if(!validMotion(set))throw Error('This preset is not valid.');const items=userMotions(doc);
 if(items.some(m=>m.name===set.name.trim())||BUILTIN_MOTIONS.some(m=>m.name===set.name.trim()))throw Error('A preset with this name already exists.');
 if(items.length>=MAX_USER_MOTIONS)throw Error(`At most ${MAX_USER_MOTIONS} saved presets.`);
 return edit([...items,set]);
}
export function deleteMotionEdit(doc:AnimationDocument,id:string):Edit{
 const items=userMotions(doc);if(!items.some(m=>m.id===id))throw Error('Preset no longer exists.');return edit(items.filter(m=>m.id!==id));
}
/** Merge incoming presets: fresh ids, names made unique with a number suffix. Throws when the library would exceed its limit. */
export function mergeMotionsEdit(doc:AnimationDocument,incoming:readonly MotionSet[]):Edit{
 const items=[...userMotions(doc)];if(items.length+incoming.length>MAX_USER_MOTIONS)throw Error(`At most ${MAX_USER_MOTIONS} saved presets.`);
 const taken=new Set([...items.map(m=>m.name),...BUILTIN_MOTIONS.map(m=>m.name)]);
 for(const m of incoming){
  const base=m.name.trim();let name=base,n=2;while(taken.has(name)){const suffix=` ${n++}`;name=base.slice(0,40-suffix.length)+suffix;}
  taken.add(name);items.push({id:newId('motion'),name,tracks:m.tracks});
 }
 return edit(items);
}
/** Export format: a small versioned JSON file holding only presets. */
export const MOTION_FILE_FORMAT='somnia-motions',MOTION_FILE_LIMIT=300_000;
export function exportMotionsJson(sets:readonly MotionSet[]):string{
 return JSON.stringify({format:MOTION_FILE_FORMAT,version:MOTION_LIB_VERSION,presets:sets.map(m=>({name:m.name,tracks:m.tracks}))},null,1);
}
/** Parse and validate an exported file. Throws a readable Error; never returns invalid presets. */
export function parseMotionsJson(text:string):MotionSet[]{
 if(text.length>MOTION_FILE_LIMIT)throw Error('This file is too large to be a preset file.');
 let raw:unknown;try{raw=JSON.parse(text);}catch{throw Error('This is not a preset file.');}
 const f=raw as {format?:unknown;version?:unknown;presets?:unknown};
 if(!f||typeof f!=='object'||f.format!==MOTION_FILE_FORMAT)throw Error('This is not a preset file.');
 if(f.version!==MOTION_LIB_VERSION)throw Error('This preset file version is not supported.');
 if(!Array.isArray(f.presets)||!f.presets.length)throw Error('The file has no presets.');
 if(f.presets.length>MAX_USER_MOTIONS)throw Error(`At most ${MAX_USER_MOTIONS} presets per file.`);
 return f.presets.map((p,i)=>{const m={id:`import-${i}`,...(p as object)} as MotionSet;if(!validMotion(m))throw Error(`Preset ${i+1} is not valid.`);return {id:m.id,name:m.name.trim(),tracks:m.tracks};});
}
/** Presets saved in the browser by P22. Read only: kept as the source for a one-time move into a document. */
export const LEGACY_KEY='somnia.animation.motionPresets.v1';
export function legacyMotions():MotionSet[]{
 try{const ls=typeof localStorage!=='undefined'?localStorage:null;const raw=ls?.getItem(LEGACY_KEY);const arr=raw?JSON.parse(raw):[];
  return Array.isArray(arr)?arr.filter(validMotion).slice(0,MAX_USER_MOTIONS).map(m=>({id:m.id,name:m.name.trim(),tracks:m.tracks})):[];}catch{return [];}
}
