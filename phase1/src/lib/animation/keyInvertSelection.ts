import type {Composition,KeyRef} from './model';
import {sameKey} from './selection';
/** Every transform key of the given layers that is not in the selection. */
export function invertSelection(comp:Composition,layers:readonly string[],sel:readonly KeyRef[]):KeyRef[]{
 const out:KeyRef[]=[];
 for(const l of comp.layers){
  if(!layers.includes(l.id))continue;
  for(const prop of Object.keys(l.transform) as KeyRef['prop'][])
   for(const k of l.transform[prop].keys){const r={layer:l.id,prop,t:k.t};if(!sel.some(s=>sameKey(s,r)))out.push(r);}
 }
 return out;
}
