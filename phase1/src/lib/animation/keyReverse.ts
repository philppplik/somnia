import type {Edit} from './edit';
import type {ClipItem,Composition,KeyRef,Keyframe} from './model';
import {reversed} from './keyRepeat';
/** Plays keys backwards in place: each group's keys swap around the middle of its first and last key, ease handles mirror. */
const bad=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_REVERSE_KEYS=800;
/** Every transform key of the given layers, as refs. */
export function layerKeyRefs(c:Composition,layers:readonly string[]):KeyRef[]{
 return c.layers.filter(l=>layers.includes(l.id)).flatMap(l=>(Object.keys(l.transform) as KeyRef['prop'][]).flatMap(prop=>l.transform[prop].keys.map(k=>({layer:l.id,prop,t:k.t}))));
}
/** Edits that reverse `refs`. With `perLayer` each layer reverses inside its own first and last key, otherwise the whole selection shares one span. */
export function reverseEdits(c:Composition,refs:readonly KeyRef[],perLayer:boolean):Edit[]{
 const live=refs.filter(r=>c.layers.find(l=>l.id===r.layer)?.transform[r.prop].keys.some(k=>k.t===r.t));
 if(live.length<2)return bad('Select at least two keys to reverse.');
 if(live.length>MAX_REVERSE_KEYS)return bad('Too many keys to reverse.');
 const spans=new Map<string,{first:number;last:number}>();
 const gk=(r:KeyRef)=>perLayer?r.layer:'*';
 for(const r of live){const s=spans.get(gk(r));spans.set(gk(r),{first:Math.min(s?.first??r.t,r.t),last:Math.max(s?.last??r.t,r.t)});}
 const edits:Edit[]=[],pastes:Edit[]=[];
 for(const layer of c.layers){
  const mine=live.filter(r=>r.layer===layer.id);if(!mine.length)continue;
  const {first,last}=spans.get(gk(mine[0]))!;if(last===first)continue;
  const items:ClipItem[]=[],props=new Set(mine.map(r=>r.prop));
  for(const prop of props){
   const ks=mine.filter(r=>r.prop===prop).map(r=>layer.transform[prop].keys.find(k=>k.t===r.t)!).sort((a,b)=>a.t-b.t);
   ks.forEach((k,i)=>{const prev=ks[i-1];items.push({prop,dt:last-k.t,key:{...reversed(k,prev?prev.interp:k.interp),t:first+last-k.t} as Keyframe});});
  }
  edits.push({type:'keys.remove',keys:mine});pastes.push({type:'keys.paste',layer:layer.id,items,t:first});
 }
 if(!edits.length)return bad('The keys are all at one time.');
 return [...edits,...pastes];
}
/** Refs of the keys after a reverse, to keep them selected. */
export const reversedRefs=(edits:readonly Edit[]):KeyRef[]=>edits.flatMap(e=>e.type==='keys.paste'?e.items.map(i=>({layer:e.layer,prop:i.prop,t:e.t+i.dt})):[]);
