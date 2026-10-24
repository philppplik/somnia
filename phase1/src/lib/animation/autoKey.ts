import {useSyncExternalStore} from 'react';
import type {Edit} from './edit';
/**
 * Auto-key (record) mode. While it is on, a canvas drag or a property edit at the playhead on a property that has no keys yet
 * first turns the property into an animated one (one key at the playhead, the old value), then sets the new value on that key.
 * Properties that already have keys keep their normal behaviour (set or add a key at the playhead). Off by default, never saved.
 */
let on=false;const ls=new Set<()=>void>();
export const autoKeyOn=()=>on;
export const setAutoKey=(v:boolean)=>{if(on===v)return;on=v;ls.forEach(f=>f());};
export const useAutoKey=()=>useSyncExternalStore(f=>{ls.add(f);return()=>{ls.delete(f);};},()=>on,()=>on);
/** `edits` with an animate step in front of every prop.set that hits a property without keys. `isStatic` answers for a layer and property. */
export function withAutoKey(edits:readonly Edit[],isStatic:(layer:string,prop:string)=>boolean):readonly Edit[]{
 if(!on)return edits;
 const seen=new Set<string>(),pre:Edit[]=[];
 for(const e of edits){
  if(e.type!=='prop.set')continue;const id=`${e.layer}\0${e.prop}`;
  if(seen.has(id)||!isStatic(e.layer,e.prop))continue;seen.add(id);pre.push({type:'prop.animate',layer:e.layer,prop:e.prop,on:true,t:e.t});
 }
 return pre.length?[...pre,...edits]:edits;
}
