/** Pick/reject flags per photo, keyed by media name and persisted locally. Photos-only: the shared media model stays untouched. Unflagged is the absence of an entry. */
import {useSyncExternalStore} from 'react';
const KEY='somnia.photos.flags.v1';
export type PhotoFlag='pick'|'reject';
export const isPhotoFlag=(v:unknown):v is PhotoFlag=>v==='pick'||v==='reject';
let state:Record<string,PhotoFlag>={};
try{const d=JSON.parse(globalThis.localStorage?.getItem(KEY)??'null');if(d&&typeof d==='object'&&!Array.isArray(d))for(const[k,v]of Object.entries(d))if(isPhotoFlag(v))state[k]=v;}catch{/* session only */}
const subs=new Set<()=>void>();
const notify=()=>subs.forEach(f=>f());
export const getFlag=(name:string):PhotoFlag|null=>state[name]??null;
export const photoFlags=():Readonly<Record<string,PhotoFlag>>=>state;
export function setFlag(name:string,flag:PhotoFlag|null){
 if(!name||!(flag===null||isPhotoFlag(flag)))return;
 const next:Record<string,PhotoFlag>={...state};
 if(flag===null)delete next[name];else next[name]=flag;
 state=next;
 try{globalThis.localStorage?.setItem(KEY,JSON.stringify(state));}catch{/* session only */}
 notify();
}
export const subscribeFlags=(fn:()=>void)=>{subs.add(fn);return()=>{subs.delete(fn);};};
export const useFlag=(name:string)=>useSyncExternalStore(subscribeFlags,()=>getFlag(name),()=>null);
export const useFlags=()=>useSyncExternalStore(subscribeFlags,photoFlags,photoFlags);
