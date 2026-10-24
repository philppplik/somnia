/** Multi-key operations on plain track data: copy, paste and shift in time. Pure, no three.js, so the rules run under tsx --test. */
import {KEY_STRIDE,ClipError,MAX_CLIP_SECONDS,KEY_EPSILON,findKey,insertKey,removeKey,snapKeyTime,checkKeyTime,isKeyPath,type KeyPath} from './clips';
import type {Ease} from './ease';
/** A key addressed by path and time, as the timeline selection and the commands pass it around. */
export interface KeyRef{path:KeyPath;time:number}
/** A copied key with its value and its easing. */
export interface KeyData{path:KeyPath;time:number;value:number[];ease:Ease}
/** Editable data of one plain track: key times, one value per key, one easing per key. */
export interface TrackData{times:number[];values:number[];eases:Ease[]}
export const MAX_KEY_REFS=6000;
export const trackData=(times:ArrayLike<number>,values:ArrayLike<number>,eases:readonly Ease[]):TrackData=>({times:Array.from(times),values:Array.from(values),eases:Array.from(eases)});
/** Validates a selection of keys and groups it per path, in KEY_PATHS order. */
export function groupRefs(refs:readonly KeyRef[]):{path:KeyPath;times:number[]}[]{
 if(!Array.isArray(refs)||!refs.length)throw new ClipError('Select keys first.');
 if(refs.length>MAX_KEY_REFS)throw new ClipError(`At most ${MAX_KEY_REFS} keys at once.`);
 const byPath=new Map<KeyPath,number[]>();
 for(const r of refs){
  if(!r||!isKeyPath(r.path))throw new ClipError('The path must be position, rotation or scale.');
  const t=checkKeyTime(r.time);const list=byPath.get(r.path)??[];
  if(!list.some(x=>Math.abs(x-t)<KEY_EPSILON))list.push(t);byPath.set(r.path,list);
 }
 return[...byPath.entries()].map(([path,times])=>({path,times:times.sort((a,b)=>a-b)}));
}
/** The index of every requested time, or an error for the first missing one. */
export function keyIndices(track:TrackData,times:readonly number[]):number[]{
 return times.map(t=>{const i=findKey(track.times,t);if(i<0)throw new ClipError('There is no key at that time.');return i;});
}
/** Values and easing of the keys at the indices, sorted by time. The clipboard entries keep their own copies. */
export function copyTrackKeys(track:TrackData,path:KeyPath,indices:readonly number[]):KeyData[]{
 const s=KEY_STRIDE[path];
 return indices.slice().sort((a,b)=>track.times[a]-track.times[b]).map(i=>({path,time:track.times[i],value:track.values.slice(i*s,i*s+s),ease:track.eases[i]??'linear'}));
}
/** Moves the keys at the indices by dt seconds, keeping value and easing with each key. A key may not land on a key that stays or on another moved key; times clamp to the clip bounds. */
export function shiftTrackKeys(track:TrackData,path:KeyPath,indices:readonly number[],dt:number):TrackData{
 if(!Number.isFinite(dt))throw new ClipError('The shift must be a finite number of seconds.');
 if(!indices.length)return track;
 const s=KEY_STRIDE[path];const moving=new Set(indices);
 const moved=indices.map(i=>({i,value:track.values.slice(i*s,i*s+s),ease:track.eases[i]??'linear',to:snapKeyTime(Math.min(MAX_CLIP_SECONDS,Math.max(0,track.times[i]+dt)))}));
 const staying=track.times.filter((_,i)=>!moving.has(i));
 for(const m of moved){
  if(findKey(staying,m.to)>=0)throw new ClipError('A key would land on another key.');
  if(moved.some(o=>o!==m&&Math.abs(o.to-m.to)<KEY_EPSILON))throw new ClipError('The moved keys would overlap.');
 }
 let cur:TrackData={times:[...track.times],values:[...track.values],eases:[...track.eases]};
 for(const i of [...indices].sort((a,b)=>b-a)){
  const r=removeKey(cur.times,cur.values,path,i);cur={times:r.times,values:r.values,eases:cur.eases.filter((_,k)=>k!==i)};
 }
 for(const m of moved){
  const r=insertKey(cur.times,cur.values,path,m.to,m.value);const at=findKey(r.times,m.to);
  const eases=cur.eases.slice();eases.splice(at,0,m.ease);cur={times:r.times,values:r.values,eases};
 }
 return cur;
}
/** Places copied keys so the earliest lands at `at`. A key on a taken time replaces it (value and easing). Times past the clip end extend the clip (the caller raises the duration). */
export function pasteTrackKeys(track:TrackData|undefined,path:KeyPath,keys:readonly KeyData[],at:number):TrackData{
 if(!keys.length)throw new ClipError('Copy keys first.');
 const t0=checkKeyTime(at);const first=Math.min(...keys.map(k=>checkKeyTime(k.time)));
 let cur:TrackData=track?{times:[...track.times],values:[...track.values],eases:[...track.eases]}:{times:[],values:[],eases:[]};
 while(cur.eases.length<cur.times.length)cur.eases.push('linear');
 for(const k of keys.slice().sort((a,b)=>a.time-b.time)){
  const t=checkKeyTime(t0+(checkKeyTime(k.time)-first));
  const r=insertKey(cur.times,cur.values,path,t,k.value);const pos=findKey(r.times,t);
  const eases=cur.eases.slice();if(r.replaced)eases[pos]=k.ease;else eases.splice(pos,0,k.ease);
  cur={times:r.times,values:r.values,eases};
 }
 return cur;
}
