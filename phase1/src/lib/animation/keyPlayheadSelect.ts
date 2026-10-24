import type {Composition,KeyRef} from './model';
/** Keys of the given layers strictly before, strictly after, or exactly at the playhead tick. */
export function keysAroundPlayhead(comp:Composition,layers:readonly string[],at:number,side:'before'|'after'|'at'):KeyRef[]{
 const out:KeyRef[]=[];
 for(const l of comp.layers){
  if(!layers.includes(l.id))continue;
  for(const prop of Object.keys(l.transform) as KeyRef['prop'][])
   for(const k of l.transform[prop].keys)if(hit(side,k.t,at))out.push({layer:l.id,prop,t:k.t});
 }
 return out;
}
function hit(side:'before'|'after'|'at',t:number,at:number):boolean{
 if(side==='before')return t<at;
 if(side==='after')return t>at;
 return t===at;
}
