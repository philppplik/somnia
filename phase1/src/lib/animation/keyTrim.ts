import type {Composition,KeyRef} from './model';
export const MAX_TRIM_KEYS=2000;
/** Keys of the layers outside the work area. A property whose keys would all go is left alone so it never loses its animation entirely. */
export function trimKeys(c:Composition,layers:readonly string[]):KeyRef[]{
 const {in:lo,out:hi}=c.workArea,out:KeyRef[]=[];
 for(const l of c.layers){
  if(!layers.includes(l.id)||l.locked)continue;
  for(const prop of Object.keys(l.transform) as KeyRef['prop'][]){
   const ks=l.transform[prop].keys,gone=ks.filter(k=>k.t<lo||k.t>hi);
   if(!gone.length||gone.length===ks.length)continue;
   for(const k of gone)out.push({layer:l.id,prop,t:k.t});
  }
 }
 if(out.length>MAX_TRIM_KEYS)throw Object.assign(new Error('Too many keys.'),{expected:true});
 return out;
}
