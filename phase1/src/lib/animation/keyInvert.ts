import type {Edit} from './edit';
import type {Composition,KeyRef} from './model';
/** Flips the values of the selected keys around the middle of each property's selected range (value becomes min + max - value). Times and easing stay. */
const bad=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_INVERT_KEYS=800;
export function invertEdits(c:Composition,refs:readonly KeyRef[]):Edit[]{
 const live=refs.filter(r=>c.layers.find(l=>l.id===r.layer)?.transform[r.prop].keys.some(k=>k.t===r.t));
 if(live.length<2)return bad('Select at least two keys to invert.');
 if(live.length>MAX_INVERT_KEYS)return bad('Too many keys to invert.');
 const groups=new Map<string,KeyRef[]>();for(const r of live)groups.set(`${r.layer}\0${r.prop}`,[...(groups.get(`${r.layer}\0${r.prop}`)??[]),r]);
 const edits:Edit[]=[];
 for(const rs of groups.values()){
  if(rs.length<2)continue;
  const layer=c.layers.find(l=>l.id===rs[0].layer)!,prop=rs[0].prop,ks=rs.map(r=>layer.transform[prop].keys.find(k=>k.t===r.t)!);
  const flip=(vs:number[])=>{const lo=Math.min(...vs),hi=Math.max(...vs);return vs.map(v=>lo+hi-v);};
  const first=ks[0].v;
  if(typeof first==='number'){const out=flip(ks.map(k=>k.v as number));ks.forEach((k,i)=>{if(out[i]!==k.v)edits.push({type:'prop.set',layer:layer.id,prop,t:k.t,value:out[i]});});}
  else{const xs=flip(ks.map(k=>(k.v as [number,number])[0])),ys=flip(ks.map(k=>(k.v as [number,number])[1]));
   ks.forEach((k,i)=>{const v=k.v as [number,number];if(xs[i]!==v[0]||ys[i]!==v[1])edits.push({type:'prop.set',layer:layer.id,prop,t:k.t,value:[xs[i],ys[i]]});});}
 }
 if(!edits.length)return bad('The selected keys have equal values.');
 return edits;
}
