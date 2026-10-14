import type {Composition,KeyRef} from './model';
/** Every transform key of the given layers inside the work area (inclusive of both ends). */
export function keysInWorkArea(comp:Composition,layers:readonly string[]):KeyRef[]{
 const out:KeyRef[]=[],{in:a,out:b}=comp.workArea;
 for(const l of comp.layers){
  if(!layers.includes(l.id))continue;
  for(const prop of Object.keys(l.transform) as KeyRef['prop'][])
   for(const k of l.transform[prop].keys)if(k.t>=a&&k.t<=b)out.push({layer:l.id,prop,t:k.t});
 }
 return out;
}
