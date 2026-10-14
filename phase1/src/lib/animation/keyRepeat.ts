import type {Edit} from './edit';
import type {ClipItem,Composition,KeyRef,Keyframe} from './model';
import {snapToFrame} from './time';
/** Repeat the selected transform keys as cycles after the selection, or as ping-pong where every second cycle runs backwards. */
export type RepeatMode='cycle'|'pingpong';
export const REPEAT_MODES:readonly RepeatMode[]=['cycle','pingpong'];
export const MAX_REPEATS=20,MAX_REPEAT_KEYS=600;
const bad=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
/** The same key played backwards: ease handles mirror and swap, spatial tangents swap. Hold keys keep their hold. */
function reversed(k:Keyframe,interp:Keyframe['interp']):Omit<Keyframe,'t'>{
 const {t:_t,channelIn:_ci,channelOut:_co,sIn,sOut,...rest}=k;
 return {...rest,interp,out:[1-k.in[0],1-k.in[1]],in:[1-k.out[0],1-k.out[1]],...(sOut?{sIn:sOut}:{}),...(sIn?{sOut:sIn}:{})};
}
/** One keys.paste edit per layer with all cycles; cycles are clipped at the composition end. Throws an expected error when nothing is left to add. */
export function repeatEdits(c:Composition,refs:readonly KeyRef[],count:number,mode:RepeatMode):Edit[]{
 if(!Number.isInteger(count)||count<1||count>MAX_REPEATS)return bad(`Repeat 1 to ${MAX_REPEATS} times.`);
 if(!REPEAT_MODES.includes(mode))return bad('Unknown repeat mode.');
 const live=refs.filter(r=>c.layers.find(l=>l.id===r.layer)?.transform[r.prop].keys.some(k=>k.t===r.t));
 if(!live.length)return bad('Select keys to repeat.');
 const first=Math.min(...live.map(r=>r.t)),span=Math.max(...live.map(r=>r.t))-first;
 if(span<=0)return bad('Select keys at two different times to repeat.');
 const end=c.start+c.duration;let total=0;const edits:Edit[]=[];
 for(const layer of c.layers){
  const mine=live.filter(r=>r.layer===layer.id);if(!mine.length)continue;
  const byProp=new Map<string,Keyframe[]>();
  for(const r of mine)byProp.set(r.prop,[...(byProp.get(r.prop)??[]),layer.transform[r.prop].keys.find(k=>k.t===r.t)!]);
  const out=new Map<string,ClipItem>();
  for(let n=1;n<=count;n++)for(const [prop,ks0] of byProp){
   const ks=[...ks0].sort((a,b)=>a.t-b.t),back=mode==='pingpong'&&n%2===1;
   (back?[...ks].reverse():ks).forEach((k,i)=>{
    const rel=back?span-(k.t-first):k.t-first,abs=first+n*span+rel;
    if(abs>end)return;
    const key=back?reversed(k,ks[ks.length-2-i]?.interp??k.interp):{...k};
    out.set(`${prop}|${n*span+rel}`,{prop:prop as ClipItem['prop'],dt:n*span+rel,key:{...key,t:abs} as Keyframe});});
  }
  if(!out.size)continue;total+=out.size;if(total>MAX_REPEAT_KEYS)return bad('Too many keys to repeat.');
  edits.push({type:'keys.paste',layer:layer.id,items:[...out.values()],t:first});
 }
 if(!edits.length)return bad('The repeats would start after the end of the composition.');
 return edits;
}
/** Refs of the keys a repeat adds, for selecting them together with the originals. */
export function repeatedRefs(c:Composition,edits:readonly Edit[]):KeyRef[]{
 return edits.flatMap(e=>e.type==='keys.paste'?e.items.map(i=>({layer:e.layer,prop:i.prop,t:snapToFrame(e.t+i.dt,c.fps)})):[]);
}
