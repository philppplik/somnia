import type {Edit} from './edit';
import type {Composition,KeyRef} from './model';
export const MAX_RAMP_KEYS=800;
type V=number|readonly number[];
const round=(x:number)=>Math.round(x*1e4)/1e4;
/** prop.set edits putting every interior selected key of a property on the line between its first and last selected key, by time. */
export function rampEdits(comp:Composition,sel:readonly KeyRef[]):Edit[]{
 if(sel.length>MAX_RAMP_KEYS)throw Object.assign(new Error('Too many keys.'),{expected:true});
 const want=new Set(sel.map(k=>`${k.layer}\0${k.prop}\0${k.t}`)),out:Edit[]=[];
 for(const l of comp.layers)for(const prop of Object.keys(l.transform) as KeyRef['prop'][]){
  const p=l.transform[prop].keys.filter(k=>want.has(`${l.id}\0${prop}\0${k.t}`));
  if(p.length<3)continue;
  const a=p[0],b=p[p.length-1],va=a.v as V,vb=b.v as V;
  for(const k of p.slice(1,-1)){
   const u=(k.t-a.t)/(b.t-a.t);
   const value=typeof va==='number'?round(va+((vb as number)-va)*u):[round((va as readonly number[])[0]+((vb as readonly number[])[0]-(va as readonly number[])[0])*u),round((va as readonly number[])[1]+((vb as readonly number[])[1]-(va as readonly number[])[1])*u)];
   if(JSON.stringify(value)!==JSON.stringify(k.v))out.push({type:'prop.set',layer:l.id,prop,t:k.t,value:value as never});
  }
 }
 return out;
}
