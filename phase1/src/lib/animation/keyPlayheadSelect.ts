import type {Composition,KeyRef} from './model';
/** Keys of the given layers strictly before or strictly after the playhead tick. */
export function keysAroundPlayhead(comp:Composition,layers:readonly string[],at:number,side:'before'|'after'):KeyRef[]{
 const out:KeyRef[]=[];
 for(const l of comp.layers){
  if(!layers.includes(l.id))continue;
  for(const prop of Object.keys(l.transform) as KeyRef['prop'][])
   for(const k of l.transform[prop].keys)if(side==='before'?k.t<at:k.t>at)out.push({layer:l.id,prop,t:k.t});
 }
 return out;
}
