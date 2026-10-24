import type {Composition,KeyRef} from './model';
type V=number|readonly number[];
const comps=(v:V):readonly number[]=>typeof v==='number'?[v]:v;
/** Interior keys where some component is strictly above or below both neighbours, for the given layers. */
export function peakKeys(comp:Composition,layers:readonly string[]):KeyRef[]{
 const out:KeyRef[]=[];
 for(const l of comp.layers){
  if(!layers.includes(l.id))continue;
  for(const prop of Object.keys(l.transform) as KeyRef['prop'][]){
   const ks=l.transform[prop].keys;
   for(let i=1;i<ks.length-1;i++){
    const a=comps(ks[i-1].v as V),b=comps(ks[i].v as V),c=comps(ks[i+1].v as V);
    if(b.some((x,j)=>(x>a[j]&&x>c[j])||(x<a[j]&&x<c[j])))out.push({layer:l.id,prop,t:ks[i].t});
   }
  }
 }
 return out;
}
