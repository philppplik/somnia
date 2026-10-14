import type {Edit} from './edit';
import type {Composition,KeyRef} from './model';
export const MAX_FLATTEN_KEYS=800;
function mean(vs:readonly (number|readonly number[])[]):number|[number,number]{
 if(typeof vs[0]==='number')return round((vs as number[]).reduce((a,b)=>a+b,0)/vs.length);
 const v=vs as readonly (readonly number[])[];return [round(v.reduce((a,b)=>a+b[0],0)/v.length),round(v.reduce((a,b)=>a+b[1],0)/v.length)];
}
/** prop.set edits giving every selected key of a property the value of its earliest selected key. */
export type FlattenTo='first'|'average';
export const FLATTEN_TARGETS:readonly FlattenTo[]=['first','average'];
const round=(x:number)=>Math.round(x*1e4)/1e4;
export function flattenEdits(comp:Composition,sel:readonly KeyRef[],to:FlattenTo='first'):Edit[]{
 if(sel.length>MAX_FLATTEN_KEYS)throw Object.assign(new Error('Too many keys.'),{expected:true});
 const want=new Set(sel.map(k=>`${k.layer}\0${k.prop}\0${k.t}`)),out:Edit[]=[];
 for(const l of comp.layers)for(const prop of Object.keys(l.transform) as KeyRef['prop'][]){
  const picked=l.transform[prop].keys.filter(k=>want.has(`${l.id}\0${prop}\0${k.t}`));
  if(picked.length<2)continue;
  const base=to==='average'?mean(picked.map(k=>k.v)):picked[0].v,txt=JSON.stringify(base);
  for(const k of to==='average'?picked:picked.slice(1))if(JSON.stringify(k.v)!==txt)out.push({type:'prop.set',layer:l.id,prop,t:k.t,value:base as never});
 }
 return out;
}
