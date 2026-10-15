import type {Edit} from './edit';
import type {Composition,KeyRef} from './model';
export const MAX_SMOOTH_KEYS=800;
const round=(x:number)=>Math.round(x*1e4)/1e4;
/** Pull a value toward the mean of its neighbours by `strength` (0..1). Handles scalar and [x,y] values. */
export function softenValue(prev:number|readonly number[],v:number|readonly number[],next:number|readonly number[],strength:number):number|[number,number]{
 const m=(a:number,b:number,c:number)=>round(b+((a+b+c)/3-b)*strength);
 if(typeof v==='number')return m(prev as number,v,next as number);
 const p=prev as readonly number[],n=next as readonly number[],q=v as readonly number[];return [m(p[0],q[0],n[0]),m(p[1],q[1],n[1])];
}
/** prop.set edits easing each selected key toward the average of the keys on both sides of it. The first and last key of a track stay put, so the motion still starts and ends where it did. */
export function softenEdits(comp:Composition,sel:readonly KeyRef[],strength:number):Edit[]{
 if(sel.length>MAX_SMOOTH_KEYS)throw Object.assign(new Error('Too many keys.'),{expected:true});
 const want=new Set(sel.map(k=>`${k.layer}\0${k.prop}\0${k.t}`)),out:Edit[]=[];
 for(const l of comp.layers)for(const prop of Object.keys(l.transform) as KeyRef['prop'][]){
  const ks=l.transform[prop].keys;
  for(let i=1;i<ks.length-1;i++){
   if(!want.has(`${l.id}\0${prop}\0${ks[i].t}`))continue;
   const nv=softenValue(ks[i-1].v,ks[i].v,ks[i+1].v,strength);
   if(JSON.stringify(nv)!==JSON.stringify(ks[i].v))out.push({type:'prop.set',layer:l.id,prop,t:ks[i].t,value:nv as never});
  }
 }
 return out;
}
