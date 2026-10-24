/** A free-text caption per photo, keyed by media name and persisted locally. Photos-only: the shared media model stays untouched; an empty caption is the absence of an entry. The library search matches captions too. */
import {useSyncExternalStore} from 'react';
const KEY='somnia.photos.captions.v1';
export const MAX_CAPTION_LENGTH=500;
let state:Record<string,string>={};
try{
 const d=JSON.parse(globalThis.localStorage?.getItem(KEY)??'null');
 if(d&&typeof d==='object'&&!Array.isArray(d))for(const[k,v]of Object.entries(d))if(k&&typeof v==='string'&&v.trim())state[k]=v.slice(0,MAX_CAPTION_LENGTH);
}catch{/* session only */}
const subs=new Set<()=>void>();
const notify=()=>subs.forEach(f=>f());
export const getCaption=(name:string):string=>state[name]??'';
export const allCaptions=():Readonly<Record<string,string>>=>state;
export function setCaption(name:string,text:string){
 if(!name)return;
 const clean=text.slice(0,MAX_CAPTION_LENGTH);
 const next={...state};
 if(!clean.trim())delete next[name];else next[name]=clean;
 state=next;
 try{globalThis.localStorage?.setItem(KEY,JSON.stringify(state));}catch{/* session only */}
 notify();
}
export const subscribeCaptions=(fn:()=>void)=>{subs.add(fn);return()=>{subs.delete(fn);};};
export const useCaption=(name:string)=>useSyncExternalStore(subscribeCaptions,()=>getCaption(name),()=>'');
export const useAllCaptions=()=>useSyncExternalStore(subscribeCaptions,allCaptions,allCaptions);
