import type {Composition,KeyRef} from './model';
export const MAX_THIN_TOLERANCE=10000,MAX_THIN_KEYS=2000;
type V=number|readonly number[];
const comps=(v:V):readonly number[]=>typeof v==='number'?[v]:v;
/** Selected keys that can go: interior, and within `tol` (every component) of the line between the nearest kept neighbours. Ends and unselected keys always stay. */
export function thinKeys(comp:Composition,sel:readonly KeyRef[],tol:number):KeyRef[]{
 if(!Number.isFinite(tol)||tol<=0||tol>MAX_THIN_TOLERANCE)throw Object.assign(new Error(`Use a tolerance above 0 and up to ${MAX_THIN_TOLERANCE}.`),{expected:true});
 if(sel.length>MAX_THIN_KEYS)throw Object.assign(new Error('Too many keys.'),{expected:true});
 const want=new Set(sel.map(k=>`${k.layer}\0${k.prop}\0${k.t}`)),out:KeyRef[]=[];
 for(const l of comp.layers){
  for(const prop of Object.keys(l.transform) as KeyRef['prop'][]){
   const ks=l.transform[prop].keys;if(ks.length<3)continue;
   const kept=[0];
   for(let i=1;i<ks.length-1;i++){
    const k=ks[i];
    if(!want.has(`${l.id}\0${prop}\0${k.t}`)){kept.push(i);continue;}
    const a=ks[kept[kept.length-1]],b=ks[i+1],u=(k.t-a.t)/(b.t-a.t),va=comps(a.v as V),vb=comps(b.v as V),vk=comps(k.v as V);
    const close=vk.every((x,c)=>Math.abs(x-(va[c]+(vb[c]-va[c])*u))<=tol);
    if(close)out.push({layer:l.id,prop,t:k.t});else kept.push(i);
   }
  }
 }
 return out;
}
