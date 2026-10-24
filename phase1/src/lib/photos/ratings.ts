/** Star ratings (0-5) per photo, keyed by media name and persisted locally. Photos-only: the shared media model stays untouched. Clearing is rating 0. */
import {useSyncExternalStore} from 'react';
const KEY='somnia.photos.ratings.v1';
export const MAX_RATING=5;
export const isRating=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=MAX_RATING;
let state:Record<string,number>={};
try{const d=JSON.parse(globalThis.localStorage?.getItem(KEY)??'null');if(d&&typeof d==='object'&&!Array.isArray(d))for(const[k,v]of Object.entries(d))if(isRating(v)&&v>0)state[k]=v;}catch{/* session only */}
const subs=new Set<()=>void>();
const notify=()=>subs.forEach(f=>f());
export const getRating=(name:string):number=>state[name]??0;
export const photoRatings=():Readonly<Record<string,number>>=>state;
export function setRating(name:string,rating:number){
 if(!name||!isRating(rating))return;
 const next:Record<string,number>={...state};
 if(rating===0)delete next[name];else next[name]=rating;
 state=next;
 try{globalThis.localStorage?.setItem(KEY,JSON.stringify(state));}catch{/* session only */}
 notify();
}
export const subscribeRatings=(fn:()=>void)=>{subs.add(fn);return()=>{subs.delete(fn);};};
export const useRating=(name:string)=>useSyncExternalStore(subscribeRatings,()=>getRating(name),()=>0);
export const useRatings=()=>useSyncExternalStore(subscribeRatings,photoRatings,photoRatings);
