import type {Edit} from './edit';
import type {Composition,KeyRef} from './model';
export const MAX_FLATTEN_KEYS=800;
/** prop.set edits giving every selected key of a property the value of its earliest selected key. */
export function flattenEdits(comp:Composition,sel:readonly KeyRef[]):Edit[]{
 if(sel.length>MAX_FLATTEN_KEYS)throw Object.assign(new Error('Too many keys.'),{expected:true});
 const want=new Set(sel.map(k=>`${k.layer}\0${k.prop}\0${k.t}`)),out:Edit[]=[];
 for(const l of comp.layers)for(const prop of Object.keys(l.transform) as KeyRef['prop'][]){
  const picked=l.transform[prop].keys.filter(k=>want.has(`${l.id}\0${prop}\0${k.t}`));
  if(picked.length<2)continue;
  const base=picked[0].v,txt=JSON.stringify(base);
  for(const k of picked.slice(1))if(JSON.stringify(k.v)!==txt)out.push({type:'prop.set',layer:l.id,prop,t:k.t,value:base});
 }
 return out;
}
