import {useSyncExternalStore} from 'react';
import {evaluate} from './interpolate';
import {findComp,findLayer,newId,PROP_META,TRANSFORM_KEYS,type AnimationDocument,type Interp,type KeyRef,type Layer,type PropValue,type TransformKey} from './model';
import {snapToFrame,TICKS_PER_SECOND} from './time';
import type {Edit} from './edit';
/** One animated property of a motion preset: keys with times relative to the preset start. `rel` values are offsets from the layer's value at the start; absolute ones replace it. */
export interface MotionTrack{prop:TransformKey;rel:boolean;keys:readonly {dt:number;v:PropValue;interp:Interp;out:readonly [number,number];in:readonly [number,number]}[]}
export interface MotionSet{id:string;name:string;builtin?:boolean;tracks:readonly MotionTrack[]}
export const MAX_USER_MOTIONS=50,MAX_MOTION_KEYS=200;
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
const KEY='somnia.animation.motionPresets.v1';
const mem=()=>{try{return typeof localStorage!=='undefined'?localStorage:null;}catch{return null;}};
const num=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const okV=(v:unknown)=>num(v)||(Array.isArray(v)&&v.length===2&&v.every(num));
const okHandle=(h:unknown)=>Array.isArray(h)&&h.length===2&&h.every(num)&&(h as number[])[0]>=0&&(h as number[])[0]<=1&&(h as number[])[1]>=-2&&(h as number[])[1]<=3;
/** True when `x` is a well-formed preset: bounded sizes, known properties, value shapes that match the property type. */
export function validMotion(x:unknown):x is MotionSet{
 const m=x as MotionSet;if(!m||typeof m.id!=='string'||!m.id||m.id.length>64||typeof m.name!=='string'||!m.name.trim()||m.name.length>40||!Array.isArray(m.tracks)||!m.tracks.length||m.tracks.length>TRANSFORM_KEYS.length)return false;
 let total=0;const seen=new Set<string>();
 for(const t of m.tracks){if(!t||!TRANSFORM_KEYS.includes(t.prop)||seen.has(t.prop)||typeof t.rel!=='boolean'||!Array.isArray(t.keys)||!t.keys.length)return false;seen.add(t.prop);
  let prev=-1;for(const k of t.keys){total++;if(!k||!num(k.dt)||!Number.isInteger(k.dt)||(prev>=0?k.dt<=prev:k.dt<0)||k.dt>3600*S||!okV(k.v)||Array.isArray(k.v)!==(PROP_META[t.prop as TransformKey].type==='vec2')||!['hold','linear','bezier'].includes(k.interp)||!okHandle(k.out)||!okHandle(k.in))return false;prev=k.dt;}}
 return total<=MAX_MOTION_KEYS;
}
let user:MotionSet[]=[];let loaded=false;const listeners=new Set<()=>void>();
const load=()=>{if(loaded)return;loaded=true;try{const raw=mem()?.getItem(KEY);const arr=raw?JSON.parse(raw):[];user=Array.isArray(arr)?arr.filter(validMotion).slice(0,MAX_USER_MOTIONS).map(m=>({...m,builtin:undefined})):[];}catch{user=[];}};
const persist=()=>{try{mem()?.setItem(KEY,JSON.stringify(user));}catch{/* quota or private mode: stays in memory */}listeners.forEach(l=>l());};
let snapshot:readonly MotionSet[]=BUILTIN_MOTIONS;
const refresh=()=>{load();snapshot=[...BUILTIN_MOTIONS,...user];};
export const listMotions=():readonly MotionSet[]=>{if(!loaded)refresh();return snapshot;};
export const findMotion=(id:string)=>listMotions().find(m=>m.id===id);
export function saveMotion(set:MotionSet):MotionSet{
 load();if(!validMotion(set))throw Error('This preset is not valid.');
 if(user.some(m=>m.name===set.name.trim()))throw Error('A preset with this name already exists.');
 if(user.length>=MAX_USER_MOTIONS)throw Error(`At most ${MAX_USER_MOTIONS} saved presets.`);
 const clean={id:set.id,name:set.name.trim(),tracks:set.tracks};user=[...user,clean];refresh();persist();return clean;
}
export function deleteMotion(id:string){load();if(!user.some(m=>m.id===id))throw Error('Preset no longer exists.');user=user.filter(m=>m.id!==id);refresh();persist();}
/** Test hook: forget everything held in memory. */
export function resetMotionLibrary(){user=[];loaded=true;refresh();try{mem()?.removeItem(KEY);}catch{/* ignore */}listeners.forEach(l=>l());}
const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export const useMotions=()=>useSyncExternalStore(subscribe,listMotions,listMotions);
