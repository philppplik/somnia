import type {Composition,KeyRef} from './model';
export const MAX_VALUE_ABS=1e6;
/** Keys of the given layers on scalar properties (opacity, rotation, ...) whose value lies in min..max, inclusive. Vector properties are skipped. */
export function keysByValue(comp:Composition,layers:readonly string[],min:number,max:number):KeyRef[]{
 if(!Number.isFinite(min)||!Number.isFinite(max)||Math.abs(min)>MAX_VALUE_ABS||Math.abs(max)>MAX_VALUE_ABS)throw Object.assign(new Error('Use finite values.'),{expected:true});
 if(min>max)throw Object.assign(new Error('Min must not be above max.'),{expected:true});
 const out:KeyRef[]=[];
 for(const l of comp.layers){
  if(!layers.includes(l.id))continue;
  for(const prop of Object.keys(l.transform) as KeyRef['prop'][])
   for(const k of l.transform[prop].keys)if(typeof k.v==='number'&&k.v>=min&&k.v<=max)out.push({layer:l.id,prop,t:k.t});
 }
 return out;
}
