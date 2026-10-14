import type {InterfaceAsset} from '../interface/schema';
import {validateAnimationAssets} from './assetsValidation';
import {frameToTick,validRate,type Rational,TICKS_PER_SECOND} from './time';
/** Authoritative, serialisable, versioned composition document (concept section 4). View state lives elsewhere. */
export const SCHEMA_VERSION=1;
export const ENGINE_VERSION='p2';
export type Vec2=readonly [number,number];
export type PropValue=number|Vec2;
export type PropType='scalar'|'vec2';
export type Interp='hold'|'linear'|'bezier';
/** Temporal ease handles in CSS cubic-bezier form: `out` belongs to this key, `in` to the next key of the segment. */
/** `sIn`/`sOut` are spatial tangents (offsets from the key value, vec2 properties only). Absent or [0,0] means a straight spatial segment. */
export interface Keyframe{t:number;v:PropValue;interp:Interp;out:readonly [number,number];in:readonly [number,number];sIn?:Vec2;sOut?:Vec2;channelOut?:readonly [Vec2,Vec2];channelIn?:readonly [Vec2,Vec2]}
export interface KeyRef{layer:string;prop:TransformKey;t:number}
export interface Property{type:PropType;value:PropValue;keys:readonly Keyframe[];/** Inert text only; never evaluated in P0. */expression?:string;pathMode?:'parameter'|'arcLength'}
export type LayerKind='solid'|'text'|'shape'|'null'|'raster';
export interface Transform{anchor:Property;position:Property;scale:Property;rotation:Property;opacity:Property}
export const TRANSFORM_KEYS=['anchor','position','scale','rotation','opacity'] as const;
export type TransformKey=typeof TRANSFORM_KEYS[number];
export interface LayerSource{color?:string;width?:number;height?:number;text?:string;size?:number;shape?:'rect'|'ellipse';assetId?:string}
export interface LayerEffect{id:string;kind:'blur'|'tint';enabled:boolean;amount:number;color:string}
export interface Layer{id:string;name:string;kind:LayerKind;source:LayerSource;inT:number;outT:number;offset:number;parent:string|null;transform:Transform;visible:boolean;solo:boolean;locked:boolean;effects?:readonly LayerEffect[]}
export interface Composition{id:string;name:string;width:number;height:number;fps:Rational;duration:number;start:number;background:string;workArea:{in:number;out:number};layers:readonly Layer[]}
export interface AnimationDocument{schema:number;engine:string;id:string;name:string;revision:number;activeComp:string;compositions:readonly Composition[];assets:readonly InterfaceAsset[]}
/** One copied key, with its time relative to the earliest copied key. */
export interface ClipItem{prop:TransformKey;dt:number;key:Keyframe}
export interface PropertyRef{layer:string;prop:TransformKey}
export const PROP_META:Record<TransformKey,{type:PropType;min?:number;max?:number}>={
 anchor:{type:'vec2'},position:{type:'vec2'},scale:{type:'vec2',min:0,max:10000},rotation:{type:'scalar',min:-36000,max:36000},opacity:{type:'scalar',min:0,max:100}};
export const EASE_OUT:readonly [number,number]=[0.33,0];
export const EASE_IN:readonly [number,number]=[0.67,1];
export const prop=(type:PropType,value:PropValue):Property=>({type,value,keys:[]});
export function makeTransform(width:number,height:number):Transform{
 return {anchor:prop('vec2',[0,0]),position:prop('vec2',[width/2,height/2]),scale:prop('vec2',[100,100]),rotation:prop('scalar',0),opacity:prop('scalar',100)};
}
let counter=0;
export function newId(prefix:string):string{
 counter=(counter+1)%1e6;
 const rnd=typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID().slice(0,8):Math.floor(Math.random()*0xffffffff).toString(16).padStart(8,'0');
 return `${prefix}_${rnd}${counter.toString(36)}`;
}
export interface CompSettings{name?:string;width?:number;height?:number;fps?:Rational;duration?:number;background?:string}
export function createComposition(s:CompSettings={},id=newId('comp')):Composition{
 const fps=s.fps??{num:30,den:1};const duration=s.duration??5*TICKS_PER_SECOND;
 return {id,name:s.name??'Composition 1',width:s.width??1920,height:s.height??1080,fps,duration,start:0,background:s.background??'#1b1b1f',workArea:{in:0,out:duration},layers:[]};
}
export function createDocument(name='Untitled animation',comp:Composition=createComposition(),id=newId('anim')):AnimationDocument{
 return {schema:SCHEMA_VERSION,engine:ENGINE_VERSION,id,name,revision:0,activeComp:comp.id,compositions:[comp],assets:[]};
}
export function createLayer(kind:LayerKind,comp:Composition,over:Partial<Layer>={},id=newId('layer')):Layer{
 const base:Record<LayerKind,{name:string;source:LayerSource}>={
  solid:{name:'Solid',source:{color:'#7c5cff',width:comp.width,height:comp.height}},
  text:{name:'Text',source:{text:'Lower third',size:96,color:'#ffffff'}},
  shape:{name:'Shape',source:{shape:'rect',width:400,height:240,color:'#ff7a59'}},
  raster:{name:'Image',source:{}},
  null:{name:'Null',source:{width:100,height:100}}};
 const n=comp.layers.filter(l=>l.kind===kind).length+1;
 return {id,name:`${base[kind].name} ${n}`,kind,source:{...base[kind].source},inT:0,outT:comp.duration,offset:0,parent:null,transform:makeTransform(comp.width,comp.height),visible:true,solo:false,locked:false,...over};
}
export const findComp=(doc:AnimationDocument,id=doc.activeComp)=>doc.compositions.find(c=>c.id===id);
export const findLayer=(comp:Composition|undefined,id:string)=>comp?.layers.find(l=>l.id===id);
/** True when making `parent` the parent of `child` would create a cycle. */
export function wouldCycle(comp:Composition,child:string,parent:string|null):boolean{
 const seen=new Set<string>();let cur:string|null=parent;
 while(cur){if(cur===child||seen.has(cur))return true;seen.add(cur);cur=findLayer(comp,cur)?.parent??null;}
 return false;
}
const isNum=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const isVec=(v:unknown):v is Vec2=>Array.isArray(v)&&v.length===2&&v.every(isNum);
const okValue=(type:PropType,v:unknown)=>type==='scalar'?isNum(v):isVec(v);
/** Strict structural validation used for recovery and import. Returns a list of problems; empty means valid. */
export function validateDocument(raw:unknown):string[]{
 const errs:string[]=[];const bad=(m:string)=>{if(errs.length<20)errs.push(m);};
 const d=raw as Partial<AnimationDocument>|null;
 if(!d||typeof d!=='object')return ['document is not an object'];
 if(d.schema!==SCHEMA_VERSION)bad(`unsupported schema ${String(d.schema)}`);
 if(typeof d.id!=='string'||!d.id)bad('missing id');
 if(typeof d.name!=='string')bad('missing name');
 if(!Number.isInteger(d.revision))bad('bad revision');
 try{validateAnimationAssets(d as AnimationDocument);}catch(e){bad((e as Error).message);}
 if(!Array.isArray(d.compositions)||!d.compositions.length)return [...errs,'no compositions'];
 const compIds=new Set<string>();
 for(const c of d.compositions){
  if(!c||typeof c.id!=='string'){bad('composition without id');continue;}
  if(compIds.has(c.id))bad(`duplicate composition ${c.id}`);compIds.add(c.id);
  if(!Number.isInteger(c.width)||!Number.isInteger(c.height)||c.width<1||c.height<1||c.width>16384||c.height>16384)bad(`${c.id}: bad size`);
  if(!validRate(c.fps))bad(`${c.id}: bad frame rate`);
  if(!Number.isInteger(c.duration)||c.duration<1)bad(`${c.id}: bad duration`);
  const wa=c.workArea;
  if(!wa||!Number.isInteger(wa.in)||!Number.isInteger(wa.out)||wa.in<0||wa.out>c.duration||wa.out<=wa.in)bad(`${c.id}: bad work area`);
  if(!Array.isArray(c.layers)){bad(`${c.id}: layers missing`);continue;}
  const ids=new Set<string>();
  for(const l of c.layers){
   if(!l||typeof l.id!=='string'){bad(`${c.id}: layer without id`);continue;}
   if(ids.has(l.id))bad(`${c.id}: duplicate layer ${l.id}`);ids.add(l.id);
   if(!['solid','text','shape','null','raster'].includes(l.kind))bad(`${l.id}: unknown kind`);
   if(!validSource(l.source)||!validEffects(l.effects))bad(`${l.id}: invalid source/effects`);
   if(!Number.isInteger(l.inT)||!Number.isInteger(l.outT)||l.outT<=l.inT)bad(`${l.id}: bad timing`);
   for(const k of TRANSFORM_KEYS){
    const p=l.transform?.[k];const meta=PROP_META[k];
    if(!p||p.type!==meta.type||!okValue(meta.type,p.value)){bad(`${l.id}.${k}: bad property`);continue;}
    if(p.pathMode!==undefined&&!['parameter','arcLength'].includes(p.pathMode))bad(`${l.id}.${k}: bad path mode`);
    if(!Array.isArray(p.keys)){bad(`${l.id}.${k}: keys missing`);continue;}
    let prev=-Infinity;
    for(const key of p.keys){
     if(!Number.isInteger(key.t)||key.t<=prev)bad(`${l.id}.${k}: keys must be strictly ascending integers`);prev=key.t;
     if(!okValue(meta.type,key.v))bad(`${l.id}.${k}: bad key value`);
     if(!['hold','linear','bezier'].includes(key.interp))bad(`${l.id}.${k}: bad interpolation`);
     if(!Array.isArray(key.out)||!Array.isArray(key.in)||![...key.out,...key.in].every(isNum)||key.out[0]<0||key.out[0]>1||key.in[0]<0||key.in[0]>1)bad(`${l.id}.${k}: bad ease handles`);
     for(const h of [key.channelOut,key.channelIn])if(h!==undefined&&(meta.type!=='vec2'||!Array.isArray(h)||h.length!==2||!h.every(v=>isVec(v)&&v[0]>=0&&v[0]<=1&&v[1]>=-2&&v[1]<=3)))bad(`${l.id}.${k}: invalid channel ease`);
     for(const s of [key.sIn,key.sOut])if(s!==undefined&&(meta.type!=='vec2'||!isVec(s)))bad(`${l.id}.${k}: bad spatial tangent`);
    }
   }
  }
  for(const l of c.layers){
   if(l?.parent&&!ids.has(l.parent))bad(`${l.id}: missing parent`);
   else if(l&&l.parent&&wouldCycle({layers:c.layers} as Composition,l.id,l.parent))bad(`${l.id}: parent cycle`);
  }
 }
 if(!compIds.has(d.activeComp as string))bad('activeComp not found');
 return errs;
}
export {frameToTick};

export function validSource(s:LayerSource):boolean{return !!s&&typeof s==='object'&&(s.color===undefined||/^#[0-9a-fA-F]{6}$/.test(s.color))&&[s.width,s.height,s.size].every(n=>n===undefined||(isNum(n)&&n>=1&&n<=16384))&&(s.text===undefined||(typeof s.text==='string'&&s.text.length<=2000))&&(s.shape===undefined||['rect','ellipse'].includes(s.shape));}
export function validEffects(e:readonly LayerEffect[]|undefined):boolean{return e===undefined||(Array.isArray(e)&&e.length<=8&&new Set(e.map(x=>x?.id)).size===e.length&&e.every(x=>!!x&&typeof x.id==='string'&&['blur','tint'].includes(x.kind)&&typeof x.enabled==='boolean'&&isNum(x.amount)&&x.amount>=0&&x.amount<=(x.kind==='blur'?64:1)&&/^#[0-9a-fA-F]{6}$/.test(x.color)));}

/** Default authored document colour, not an application theme colour. */
export const DEFAULT_LAYER_COLOR='#ffffff';
