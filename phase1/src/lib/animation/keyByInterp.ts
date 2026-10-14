import type {Composition,KeyRef,Interp} from './model';
/** Every transform key of the given layers with the given interpolation. */
export function keysByInterp(comp:Composition,layers:readonly string[],interp:Interp):KeyRef[]{
 const out:KeyRef[]=[];
 for(const l of comp.layers){
  if(!layers.includes(l.id))continue;
  for(const prop of Object.keys(l.transform) as KeyRef['prop'][])
   for(const k of l.transform[prop].keys)if(k.interp===interp)out.push({layer:l.id,prop,t:k.t});
 }
 return out;
}
