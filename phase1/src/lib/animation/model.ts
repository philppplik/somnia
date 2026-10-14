import {frameToTick,validRate,type Rational,TICKS_PER_SECOND} from './time';
/** Authoritative, serialisable, versioned composition document (concept section 4). View state lives elsewhere. */
export const SCHEMA_VERSION=1;
export const ENGINE_VERSION='p0';
export type Vec2=readonly [number,number];
export type PropValue=number|Vec2;
export type PropType='scalar'|'vec2';
export type Interp='hold'|'linear'|'bezier';
/** Temporal ease handles in CSS cubic-bezier form: `out` belongs to this key, `in` to the next key of the segment. */
export interface Keyframe{t:number;v:PropValue;interp:Interp;out:readonly [number,number];in:readonly [number,number]}
export interface Property{type:PropType;value:PropValue;keys:readonly Keyframe[];/** Inert text only; never evaluated in P0. */expression?:string}
export type LayerKind='solid'|'text'|'shape'|'null';
export interface Transform{anchor:Property;position:Property;scale:Property;rotation:Property;opacity:Property}
export const TRANSFORM_KEYS=['anchor','position','scale','rotation','opacity'] as const;
export type TransformKey=typeof TRANSFORM_KEYS[number];
export interface LayerSource{color?:string;width?:number;height?:number;text?:string;size?:number;shape?:'rect'|'ellipse'}
export interface Layer{id:string;name:string;kind:LayerKind;source:LayerSource;inT:number;outT:number;offset:number;parent:string|null;transform:Transform;visible:boolean;solo:boolean;locked:boolean}
export interface Composition{id:string;name:string;width:number;height:number;fps:Rational;duration:number;start:number;background:string;workArea:{in:number;out:number};layers:readonly Layer[]}
export interface AnimationDocument{schema:number;engine:string;id:string;name:string;revision:number;activeComp:string;compositions:readonly Composition[];assets:readonly never[]}
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
 if(!Array.isArray(d.compositions)||!d.compositions.length)return [...errs,'no compositions'];
 const compIds=new Set<string>();
 for(const c of d.compositions){
  if(!c||typeof c.id!=='string'){bad('composition without id');continue;}
  if(compIds.has(c.id))bad(`duplicate composition ${c.id}`);compIds.add(c.id);
  if(!Number.isInteger(c.width)||!Number.isInteger(c.height)||c.width<1||c.height<1||c.width>16384||c.height>16384)bad(`${c.id}: bad size`);
  if(!validRate(c.fps))bad(`${c.id}: bad frame rate`);
  if(!Number.isInteger(c.duration)||c.duration<1)bad(`${c.id}: bad duration`);
  if(!Array.isArray(c.layers)){bad(`${c.id}: layers missing`);continue;}
  const ids=new Set<string>();
  for(const l of c.layers){
   if(!l||typeof l.id!=='string'){bad(`${c.id}: layer without id`);continue;}
   if(ids.has(l.id))bad(`${c.id}: duplicate layer ${l.id}`);ids.add(l.id);
   if(!['solid','text','shape','null'].includes(l.kind))bad(`${l.id}: unknown kind`);
   if(!Number.isInteger(l.inT)||!Number.isInteger(l.outT)||l.outT<=l.inT)bad(`${l.id}: bad timing`);
   for(const k of TRANSFORM_KEYS){
    const p=l.transform?.[k];const meta=PROP_META[k];
    if(!p||p.type!==meta.type||!okValue(meta.type,p.value)){bad(`${l.id}.${k}: bad property`);continue;}
    if(!Array.isArray(p.keys)){bad(`${l.id}.${k}: keys missing`);continue;}
    let prev=-Infinity;
    for(const key of p.keys){
     if(!Number.isInteger(key.t)||key.t<=prev)bad(`${l.id}.${k}: keys must be strictly ascending integers`);prev=key.t;
     if(!okValue(meta.type,key.v))bad(`${l.id}.${k}: bad key value`);
     if(!['hold','linear','bezier'].includes(key.interp))bad(`${l.id}.${k}: bad interpolation`);
     if(!Array.isArray(key.out)||!Array.isArray(key.in)||![...key.out,...key.in].every(isNum)||key.out[0]<0||key.out[0]>1||key.in[0]<0||key.in[0]>1)bad(`${l.id}.${k}: bad ease handles`);
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
