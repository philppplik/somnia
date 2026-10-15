import type {Layer} from './model';
/**
 * Shifting every key of a layer in time. Every keyed structure of a layer is an array of objects with an integer `t`
 * (property keys, colour keys, morph keys, effect keys, gradient and stop keys, repeater and animator keys, volume keys...),
 * so one generic walk covers them all. The inventory test guards that no other `t` field appears in the model.
 */
const isKeyArray=(a:unknown):a is {t:number}[]=>Array.isArray(a)&&a.length>0&&a.every(x=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Number.isInteger((x as {t?:unknown}).t));
function walk(v:unknown,fn:(t:number)=>number):unknown{
 if(Array.isArray(v)){
  const key=isKeyArray(v);
  return v.map(x=>{const y=walk(x,fn);return key?{...(y as object),t:fn((x as {t:number}).t)}:y;});
 }
 if(v&&typeof v==='object'){const o:Record<string,unknown>={};for(const [k,x] of Object.entries(v))o[k]=walk(x,fn);return o;}
 return v;
}
/** All key times of a layer, in no particular order. */
export function layerKeyTimes(l:Layer):number[]{const out:number[]=[];walk(l,t=>{out.push(t);return t;});return out;}
/** The layer with every key moved by `delta` ticks. Nothing else changes. */
export const shiftLayerKeys=(l:Layer,delta:number):Layer=>walk(l,t=>t+delta) as Layer;
/** The layer with every key and its in and out point scaled about its in point by `percent`, each time snapped to a whole frame. */
export const stretchLayer=(l:Layer,percent:number,snap:(t:number)=>number):Layer=>{
 const a=l.inT,f=(t:number)=>snap(a+(t-a)*percent/100),m=walk(l,f) as Layer;
 return {...m,inT:a,outT:f(l.outT)};
};
/** True when two keys of one keyed array share a time. */
export function hasKeyCollision(v:unknown):boolean{
 if(Array.isArray(v)){
  if(isKeyArray(v)&&new Set(v.map(k=>k.t)).size!==v.length)return true;
  return v.some(hasKeyCollision);
 }
 return !!v&&typeof v==='object'&&Object.values(v).some(hasKeyCollision);
}
