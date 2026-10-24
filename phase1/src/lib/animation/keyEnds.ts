import type {Composition,KeyRef} from './model';
/** First and last key of every transform property of the given layers (one key when a property has one). */
export function endKeys(comp:Composition,layers:readonly string[]):KeyRef[]{
 const out:KeyRef[]=[];
 for(const l of comp.layers){
  if(!layers.includes(l.id))continue;
  for(const prop of Object.keys(l.transform) as KeyRef['prop'][]){
   const ks=l.transform[prop].keys;if(!ks.length)continue;
   const ts=ks.map(k=>k.t),lo=Math.min(...ts),hi=Math.max(...ts);
   out.push({layer:l.id,prop,t:lo});if(hi!==lo)out.push({layer:l.id,prop,t:hi});
  }
 }
 return out;
}
