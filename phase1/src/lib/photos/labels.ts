/** Color labels per photo, keyed by media name and persisted locally. Photos-only: the shared media model stays untouched. Unlabeled is the absence of an entry. */
import {useSyncExternalStore} from 'react';
const KEY='somnia.photos.labels.v1';
export const PHOTO_LABELS=['red','yellow','green','blue'] as const;
export type PhotoLabel=(typeof PHOTO_LABELS)[number];
export const isPhotoLabel=(v:unknown):v is PhotoLabel=>typeof v==='string'&&(PHOTO_LABELS as readonly string[]).includes(v);
let state:Record<string,PhotoLabel>={};
try{const d=JSON.parse(globalThis.localStorage?.getItem(KEY)??'null');if(d&&typeof d==='object'&&!Array.isArray(d))for(const[k,v]of Object.entries(d))if(isPhotoLabel(v))state[k]=v;}catch{/* session only */}
const subs=new Set<()=>void>();
const notify=()=>subs.forEach(f=>f());
export const getLabel=(name:string):PhotoLabel|null=>state[name]??null;
export const photoLabels=():Readonly<Record<string,PhotoLabel>>=>state;
export function setLabel(name:string,label:PhotoLabel|null){
 if(!name||!(label===null||isPhotoLabel(label)))return;
 const next:Record<string,PhotoLabel>={...state};
 if(label===null)delete next[name];else next[name]=label;
 state=next;
 try{globalThis.localStorage?.setItem(KEY,JSON.stringify(state));}catch{/* session only */}
 notify();
}
export const subscribeLabels=(fn:()=>void)=>{subs.add(fn);return()=>{subs.delete(fn);};};
export const useLabel=(name:string)=>useSyncExternalStore(subscribeLabels,()=>getLabel(name),()=>null);
export const useLabels=()=>useSyncExternalStore(subscribeLabels,photoLabels,photoLabels);
