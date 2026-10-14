import type {Composition,KeyRef} from './model';
export const MAX_PROPERTY_KEYS=2000;
/** Every key of each (layer, property) that has a selected key, in layer and time order. */
export function wholeProperties(comp:Composition,sel:readonly KeyRef[]):KeyRef[]{
 const want=new Set(sel.map(k=>`${k.layer}\0${k.prop}`)),out:KeyRef[]=[];
 for(const l of comp.layers)for(const prop of Object.keys(l.transform) as KeyRef['prop'][]){
  if(!want.has(`${l.id}\0${prop}`))continue;
  for(const k of l.transform[prop].keys)out.push({layer:l.id,prop,t:k.t});
 }
 if(out.length>MAX_PROPERTY_KEYS)throw Object.assign(new Error('Too many keys.'),{expected:true});
 return out;
}
