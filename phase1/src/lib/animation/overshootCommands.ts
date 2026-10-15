import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Composition,type Keyframe,type Layer,type PropValue} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {hasSpatial} from './interpolate';
import {frameToTick,snapToFrame} from './time';
/** Overshoot and anticipation: inside every moving segment of the ticked layers' position, scale and rotation keys, add a key that swings past the target (and optionally one that pulls back first), so the motion settles instead of stopping dead. Times of the existing keys never change. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_OVERSHOOT_LAYERS=30,MIN_SEGMENT_FRAMES=4,MAX_NEW_KEYS=400,PROPS=['position','scale','rotation'] as const;
type P=typeof PROPS[number];
const r2=(n:number)=>Math.round(n*100)/100;
const num=(v:PropValue):number[]=>typeof v==='number'?[v]:[...v];
const back=(a:PropValue,v:number[]):PropValue=>typeof a==='number'?r2(v[0]):[r2(v[0]),r2(v[1])] as PropValue;
export interface NewKey{t:number;v:PropValue}
/** Keys to add inside the segment a to b: a pull-back at 12 percent (when `anticipate`) and the overshoot at 80 percent. Null when the segment is too short, still, held or a spatial curve. */
export function segmentKeys(a:Keyframe,b:Keyframe,amount:number,anticipate:boolean,fps:Composition['fps'],floor0:boolean):NewKey[]|null{
 const dur=b.t-a.t;if(dur<frameToTick(MIN_SEGMENT_FRAMES,fps)||a.interp==='hold'||hasSpatial(a,b))return null;
 const va=num(a.v),vb=num(b.v),d=vb.map((x,i)=>x-va[i]);if(d.every(x=>Math.abs(x)<1e-6))return null;
 const lo=(v:number[])=>floor0?v.map(x=>Math.max(0,x)):v,k=amount/100,out:NewKey[]=[];
 const tAn=snapToFrame(a.t+dur*0.12,fps),tOv=snapToFrame(a.t+dur*0.8,fps);
 if(anticipate&&tAn>a.t&&tAn<tOv)out.push({t:tAn,v:back(a.v,lo(va.map((x,i)=>x-d[i]*k*0.5)))});
 if(tOv>(out[0]?.t??a.t)&&tOv<b.t)out.push({t:tOv,v:back(b.v,lo(vb.map((x,i)=>x+d[i]*k)))});
 return out.length?out:null;
}
export const overshootSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.overshoot',title:'Add overshoot (and anticipation) to the ticked layers\' moves',category:'Edit',level:'ui',keywords:['animation','overshoot','anticipation','settle','follow through','spring','ease','polish','principles'],
 params:{type:'object',properties:{amount:{type:'integer',minimum:5,maximum:100},anticipate:{type:'boolean'},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_OVERSHOOT_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{amount?:number;anticipate?:boolean;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c:Composition|undefined=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const amount=p.amount??15;if(!Number.isInteger(amount)||amount<5||amount>100)return expected('The amount is 5 to 100 percent.');
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_OVERSHOOT_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.kind!=='audio');
  if(!ls.length)return expected('Tick at least one unlocked layer.');
  const edits:Edit[]=[];let added=0,segments=0;
  for(const l of ls)for(const prop of PROPS as readonly P[]){const keys=l.transform[prop].keys;
   for(let i=0;i+1<keys.length;i++){const ks=segmentKeys(keys[i],keys[i+1],amount,p.anticipate===true,c.fps,prop==='scale');if(!ks)continue;segments++;
    for(const k of ks){edits.push({type:'key.add',layer:l.id,prop,t:k.t},{type:'prop.set',layer:l.id,prop,t:k.t,value:k.v as never});added++;}}}
  if(!edits.length)return expected('Nothing to add: the layers need position, scale or rotation keys at least 4 frames apart that change the value (curved position paths are skipped).');
  if(added>MAX_NEW_KEYS)return expected(`That would add ${added} keys (limit ${MAX_NEW_KEYS}). Tick fewer layers.`);
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {segments,keys:added,amount,anticipate:p.anticipate===true};
 }) as (p:unknown)=>unknown}];
