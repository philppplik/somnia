/** Named develop-settings snapshots per photo: freeze the current settings under a name and jump back later. Stored as encoded settings payloads (validated on read), persisted locally, photos-only; originals are never touched. */
import {useSyncExternalStore} from 'react';
import {encodeSettingsPayload,decodeSettingsPayload,type SettingsPayload} from './settingsClipboard';
import type {PhotoSettings} from './studioSettings';
const KEY='somnia.photos.snapshots.v1';
type Store=Record<string,Record<string,SettingsPayload>>;
let state:Store={};
try{
 const d=JSON.parse(globalThis.localStorage?.getItem(KEY)??'null');
 if(d&&typeof d==='object'&&!Array.isArray(d)){
  for(const[photo,snaps]of Object.entries(d as Record<string,unknown>)){
   if(!photo||!snaps||typeof snaps!=='object'||Array.isArray(snaps))continue;
   for(const[name,payload]of Object.entries(snaps as Record<string,unknown>)){
    if(!name||!decodeSettingsPayload(payload))continue; // malformed entries are dropped on load
    (state[photo]??={})[name]=payload as SettingsPayload;
   }
  }
 }
}catch{/* session only */}
const subs=new Set<()=>void>();
const notify=()=>subs.forEach(f=>f());
let version=0;
const nameCache=new Map<string,{v:number;names:string[]}>();
function persist(){try{globalThis.localStorage?.setItem(KEY,JSON.stringify(state));}catch{/* session only */}version++;notify();}
/** Snapshot names of one photo, oldest first. The returned array is stable until the next mutation. */
export const snapshotsFor=(photo:string):readonly string[]=>{
 const hit=nameCache.get(photo);
 if(hit&&hit.v===version)return hit.names;
 const names=Object.keys(state[photo]??{});
 nameCache.set(photo,{v:version,names});
 return names;
};
/** Saves the settings under a name for the photo; an existing snapshot with the same name is overwritten. Returns false for empty names. */
export function saveSnapshot(photo:string,name:string,settings:PhotoSettings):boolean{
 if(!photo||!name.trim())return false;
 state={...state,[photo]:{...(state[photo]??{}),[name.trim()]:encodeSettingsPayload(settings)}};
 persist();return true;
}
/** Reads one snapshot back; malformed payloads decode to null. */
export function snapshotSettings(photo:string,name:string):PhotoSettings|null{
 const p=state[photo]?.[name];
 return p?decodeSettingsPayload(p):null;
}
export function deleteSnapshot(photo:string,name:string){
 const snaps=state[photo];if(!snaps||!(name in snaps))return;
 const nextSnaps={...snaps};delete nextSnaps[name];
 const next={...state};if(Object.keys(nextSnaps).length===0)delete next[photo];else next[photo]=nextSnaps;
 state=next;persist();
}
export function renameSnapshot(photo:string,oldName:string,newName:string):boolean{
 const snaps=state[photo];const trimmed=newName.trim();
 if(!snaps||!(oldName in snaps)||!trimmed||oldName===trimmed)return false;
 const nextSnaps:Record<string,SettingsPayload>={};
 for(const[n,p]of Object.entries(snaps))nextSnaps[n===oldName?trimmed:n]=p; // keep insertion order
 state={...state,[photo]:nextSnaps};persist();return true;
}
export const subscribeSnapshots=(fn:()=>void)=>{subs.add(fn);return()=>{subs.delete(fn);};};
/** Reactive snapshot names of one photo. */
export const useSnapshots=(photo:string)=>useSyncExternalStore(subscribeSnapshots,()=>snapshotsFor(photo),()=>snapshotsFor(photo));
