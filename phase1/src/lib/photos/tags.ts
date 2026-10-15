/** Keyword tags per photo, keyed by media name and persisted locally. Photos-only: the shared media model stays untouched. Untagged is the absence of an entry. Tags are trimmed, deduped, and capped. */
import {useSyncExternalStore} from 'react';
const KEY='somnia.photos.tags.v1';
export const MAX_TAGS_PER_PHOTO=20,MAX_TAG_LENGTH=48;
export const normalizeTag=(v:unknown):string|null=>typeof v==='string'&&(v=v.trim()).length>0&&v.length<=MAX_TAG_LENGTH?v:null;
export const normalizeTags=(list:readonly unknown[]):string[]=>{const out:string[]=[];for(const v of list){const t=normalizeTag(v);if(t&&!out.includes(t))out.push(t);if(out.length>=MAX_TAGS_PER_PHOTO)break;}return out;};
let state:Record<string,string[]>={};
try{const d=JSON.parse(globalThis.localStorage?.getItem(KEY)??'null');if(d&&typeof d==='object'&&!Array.isArray(d))for(const[k,v]of Object.entries(d)){const t=Array.isArray(v)?normalizeTags(v):[];if(t.length)state[k]=t;}}catch{/* session only */}
const subs=new Set<()=>void>();
const notify=()=>subs.forEach(f=>f());
export const getTags=(name:string):readonly string[]=>state[name]??[];
export const photoTags=():Readonly<Record<string,readonly string[]>>=>state;
/** Every tag in the library, sorted alphabetically - the filter dropdown's dynamic options. */
export const allTags=():string[]=>[...new Set(Object.values(state).flat())].sort((a,b)=>a.localeCompare(b));
export function setTags(name:string,tags:readonly unknown[]){
 if(!name)return;
 const next:Record<string,string[]>={...state};
 const t=normalizeTags(tags);
 if(t.length===0)delete next[name];else next[name]=t;
 state=next;
 try{globalThis.localStorage?.setItem(KEY,JSON.stringify(state));}catch{/* session only */}
 notify();
}
/** Union-merge tags onto the photo (batch tagging adds without dropping the existing ones). */
export function addTags(name:string,tags:readonly unknown[]){setTags(name,[...getTags(name),...tags]);}
export const subscribeTags=(fn:()=>void)=>{subs.add(fn);return()=>{subs.delete(fn);};};
export const useTags=(name:string)=>useSyncExternalStore(subscribeTags,()=>getTags(name),()=>[]);
export const usePhotoTags=()=>useSyncExternalStore(subscribeTags,photoTags,photoTags);
