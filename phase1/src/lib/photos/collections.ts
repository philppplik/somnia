/** Manual named photo collections: hand-picked groups (unlike the saved filter sets in the strip menu). Members are photo names in insertion order, deduped; persisted locally, photos-only; originals are never touched. */
import {useSyncExternalStore} from 'react';
const KEY='somnia.photos.collections.v1';
type Store=Record<string,string[]>;
let state:Store={};
try{
 const d=JSON.parse(globalThis.localStorage?.getItem(KEY)??'null');
 if(d&&typeof d==='object'&&!Array.isArray(d)){
  for(const[name,members]of Object.entries(d as Record<string,unknown>)){
   if(!name||!Array.isArray(members))continue;
   const clean=[...new Set(members.filter((v):v is string=>typeof v==='string'&&!!v))];
   if(clean.length>0)state[name]=clean;
  }
 }
}catch{/* session only */}
const subs=new Set<()=>void>();
const notify=()=>subs.forEach(f=>f());
let version=0;
const namesCache:{v:number;names:string[]}={v:-1,names:[]};
const membersCache=new Map<string,{v:number;members:string[]}>();
function persist(){try{globalThis.localStorage?.setItem(KEY,JSON.stringify(state));}catch{/* session only */}version++;notify();}
/** Collection names, sorted. The returned array is stable until the next mutation. */
export const collectionNames=():readonly string[]=>{
 if(namesCache.v!==version){namesCache.names=Object.keys(state).sort((a,b)=>a.localeCompare(b));namesCache.v=version;}
 return namesCache.names;
};
/** Members of one collection in insertion order. The returned array is stable until the next mutation. */
export const collectionMembers=(name:string):readonly string[]=>{
 const hit=membersCache.get(name);
 if(hit&&hit.v===version)return hit.members;
 const members=state[name]??[];
 membersCache.set(name,{v:version,members});
 return members;
};
export const isInCollection=(name:string,photo:string):boolean=>(state[name]??[]).includes(photo);
/** Adds photos to a collection, creating it when missing; existing members keep their place. Returns the number actually added. */
export function addToCollection(name:string,photos:readonly string[]):number{
 const trimmed=name.trim();if(!trimmed)return 0;
 const add=[...new Set(photos.filter(p=>p&&!(state[trimmed]??[]).includes(p)))];
 if(add.length===0)return 0;
 state={...state,[trimmed]:[...(state[trimmed]??[]),...add]};
 persist();return add.length;
}
/** Removes photos from a collection; an emptied collection is dropped. */
export function removeFromCollection(name:string,photos:readonly string[]){
 const members=state[name];if(!members)return;
 const drop=new Set(photos);if(drop.size===0)return;
 const next=members.filter(p=>!drop.has(p));if(next.length===members.length)return;
 const nextState={...state};if(next.length===0)delete nextState[name];else nextState[name]=next;
 state=nextState;persist();
}
export function deleteCollection(name:string){
 if(!(name in state))return;
 const next={...state};delete next[name];state=next;persist();
}
export function renameCollection(oldName:string,newName:string):boolean{
 const trimmed=newName.trim();
 if(!(oldName in state)||!trimmed||oldName===trimmed||(trimmed in state))return false;
 const next:Store={};
 for(const[n,m]of Object.entries(state))next[n===oldName?trimmed:n]=m; // keep order
 state=next;persist();return true;
}
export const subscribeCollections=(fn:()=>void)=>{subs.add(fn);return()=>{subs.delete(fn);};};
export const useCollectionNames=()=>useSyncExternalStore(subscribeCollections,collectionNames,collectionNames);
export const useCollectionMembers=(name:string)=>useSyncExternalStore(subscribeCollections,()=>collectionMembers(name),()=>collectionMembers(name));
