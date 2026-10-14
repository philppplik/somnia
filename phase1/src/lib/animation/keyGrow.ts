import type {Composition,KeyRef} from './model';
import {sameKey} from './selection';
/** The selection plus the previous and next key of every selected key on the same property. */
export function growSelection(comp:Composition,sel:readonly KeyRef[]):KeyRef[]{
 const out:KeyRef[]=[...sel],add=(r:KeyRef)=>{if(!out.some(o=>sameKey(o,r)))out.push(r);};
 for(const s of sel){
  const l=comp.layers.find(x=>x.id===s.layer);if(!l)continue;
  const ts=l.transform[s.prop].keys.map(k=>k.t).sort((a,b)=>a-b),i=ts.indexOf(s.t);if(i<0)continue;
  if(i>0)add({layer:s.layer,prop:s.prop,t:ts[i-1]});
  if(i<ts.length-1)add({layer:s.layer,prop:s.prop,t:ts[i+1]});
 }
 return out;
}
