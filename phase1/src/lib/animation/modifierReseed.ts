import type {Composition,TransformKey} from './model';
import {TRANSFORM_KEYS} from './model';
import type {Edit} from './edit';
/** One new seed per wiggle, derived from `base` so the result is repeatable and every seed differs. */
export const reseedValue=(base:number,n:number)=>(Math.abs(Math.trunc(base))+n*104729)%2147483647;
export interface ReseedPlan{edits:Edit[];skippedLocked:number}
/** Edits that give every wiggle of the picked layers a new seed. Locked layers are skipped. Pure. */
export function reseedPlan(c:Composition,ids:readonly string[],base:number):ReseedPlan{
 const edits:Edit[]=[];let n=1,skippedLocked=0;
 for(const l of c.layers){
  if(!ids.includes(l.id))continue;
  const mine:Edit[]=[];
  for(const k of TRANSFORM_KEYS as readonly TransformKey[]){
   (l.transform[k].modifiers??[]).forEach((m,index)=>{if(m.type==='wiggle')mine.push({type:'modifier.set',layer:l.id,prop:k,index,modifier:{...m,seed:reseedValue(base,n++)}});});
  }
  if(!mine.length)continue;
  if(l.locked){skippedLocked++;continue;}
  edits.push(...mine);
 }
 return {edits,skippedLocked};
}
