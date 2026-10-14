import type {Interp,PropValue,TransformKey} from './model';
/** Motion preset model and validation: a leaf module so document validation (model.ts) does not pull in the library. */
/** One animated property of a motion preset: keys with times relative to the preset start. `rel` values are offsets from the layer's value at the start; absolute ones replace it. */
export interface MotionTrack{prop:TransformKey;rel:boolean;keys:readonly {dt:number;v:PropValue;interp:Interp;out:readonly [number,number];in:readonly [number,number]}[]}
export interface MotionSet{id:string;name:string;builtin?:boolean;tracks:readonly MotionTrack[]}
/** Presets stored in a document. `version` lets later releases migrate the shape. */
export interface MotionLib{version:1;items:readonly MotionSet[]}
export const MOTION_LIB_VERSION=1,MAX_USER_MOTIONS=50,MAX_MOTION_KEYS=200;
const KEYS:readonly TransformKey[]=['anchor','position','scale','rotation','opacity'];
const VEC=new Set<string>(['anchor','position','scale']);
const MAX_DT=3600*240000;
const num=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const okV=(v:unknown)=>num(v)||(Array.isArray(v)&&v.length===2&&v.every(num));
const okHandle=(h:unknown)=>Array.isArray(h)&&h.length===2&&h.every(num)&&(h as number[])[0]>=0&&(h as number[])[0]<=1&&(h as number[])[1]>=-2&&(h as number[])[1]<=3;
/** True when `x` is a well-formed preset: bounded sizes, known properties, value shapes that match the property type. */
export function validMotion(x:unknown):x is MotionSet{
 const m=x as MotionSet;if(!m||typeof m.id!=='string'||!m.id||m.id.length>64||typeof m.name!=='string'||!m.name.trim()||m.name.length>40||!Array.isArray(m.tracks)||!m.tracks.length||m.tracks.length>KEYS.length)return false;
 let total=0;const seen=new Set<string>();
 for(const t of m.tracks){if(!t||!KEYS.includes(t.prop)||seen.has(t.prop)||typeof t.rel!=='boolean'||!Array.isArray(t.keys)||!t.keys.length)return false;seen.add(t.prop);
  let prev=-1;for(const k of t.keys){total++;if(!k||!num(k.dt)||!Number.isInteger(k.dt)||(prev>=0?k.dt<=prev:k.dt<0)||k.dt>MAX_DT||!okV(k.v)||Array.isArray(k.v)!==(VEC.has(t.prop))||!['hold','linear','bezier'].includes(k.interp)||!okHandle(k.out)||!okHandle(k.in))return false;prev=k.dt;}}
 return total<=MAX_MOTION_KEYS;
}
/** Problems in a document's preset library; empty means valid. */
export function validateMotionLib(lib:unknown):string[]{
 if(lib===undefined)return [];const l=lib as Partial<MotionLib>;
 if(!l||typeof l!=='object'||l.version!==MOTION_LIB_VERSION||!Array.isArray(l.items))return ['motion library has an unsupported version or shape'];
 if(l.items.length>MAX_USER_MOTIONS)return [`motion library has more than ${MAX_USER_MOTIONS} presets`];
 const ids=new Set<string>(),names=new Set<string>();
 for(const m of l.items){if(!validMotion(m))return ['motion library contains an invalid preset'];if(ids.has(m.id)||names.has(m.name.trim()))return ['motion library has duplicate ids or names'];ids.add(m.id);names.add(m.name.trim());}
 return [];
}
