/**
 * Recent scenes and autosave for the 3D studio. Pure logic over a small async key-value store, so it runs under
 * tsx --test. The browser store (IndexedDB) is in recentStore.ts. Entries hold the text of an embedded .som3d.
 * Limits keep storage bounded: oversized scenes are skipped (the user is told), the oldest entries are evicted first.
 */
export interface KeyValueStore{get(key:string):Promise<unknown>;set(key:string,value:unknown):Promise<void>;del(key:string):Promise<void>}
export interface RecentEntry{id:string;name:string;savedAt:number;size:number;/** true for the single autosave slot */auto:boolean}
export const AUTOSAVE_ID='autosave';
export const MAX_RECENT=6;
export const MAX_ENTRY_BYTES=48*1024*1024;
export const MAX_TOTAL_BYTES=160*1024*1024;
const INDEX_KEY='index';const BLOB='doc:';
export type PutResult={ok:true;entry:RecentEntry;evicted:string[]}|{ok:false;reason:'too-large'|'storage'};
export const recentId=(name:string)=>'f:'+name.trim().toLowerCase().slice(0,120);
function valid(v:unknown):v is RecentEntry{
 if(!v||typeof v!=='object')return false;const e=v as Record<string,unknown>;
 return typeof e.id==='string'&&e.id.length>0&&typeof e.name==='string'&&typeof e.savedAt==='number'&&Number.isFinite(e.savedAt)&&typeof e.size==='number'&&e.size>=0&&typeof e.auto==='boolean';
}
/** The index, newest first. Damaged data yields an empty list instead of an error. */
export async function readIndex(store:KeyValueStore):Promise<RecentEntry[]>{
 try{const raw=await store.get(INDEX_KEY);if(!Array.isArray(raw))return[];return raw.filter(valid).sort((a,b)=>b.savedAt-a.savedAt);}catch{return[];}
}
/** Stores one scene. Explicit saves are keyed by file name; autosave uses one replaceable slot. */
export async function putRecent(store:KeyValueStore,input:{name:string;text:string;auto?:boolean;now?:number}):Promise<PutResult>{
 const size=input.text.length;if(size>MAX_ENTRY_BYTES)return{ok:false,reason:'too-large'};
 const auto=!!input.auto;const id=auto?AUTOSAVE_ID:recentId(input.name);
 const entry:RecentEntry={id,name:input.name.slice(0,200)||'scene',savedAt:input.now??Date.now(),size,auto};
 try{
  const index=(await readIndex(store)).filter(e=>e.id!==id);
  const evicted:string[]=[];
  const kept=[entry,...index];
  // Count cap applies to saved files; the autosave slot is extra. Evict the oldest saved file first.
  const drop=(pred:(e:RecentEntry)=>boolean)=>{for(let i=kept.length-1;i>=0;i--){if(kept[i].id!==id&&pred(kept[i])){evicted.push(kept[i].id);kept.splice(i,1);return true;}}return false;};
  while(kept.filter(e=>!e.auto).length>MAX_RECENT&&drop(e=>!e.auto));
  while(kept.reduce((n,e)=>n+e.size,0)>MAX_TOTAL_BYTES&&(drop(e=>!e.auto)||drop(()=>true)));
  await store.set(BLOB+id,input.text);
  await store.set(INDEX_KEY,kept);
  for(const gone of evicted)await store.del(BLOB+gone).catch(()=>undefined);
  return{ok:true,entry,evicted};
 }catch{return{ok:false,reason:'storage'};}
}
export async function loadRecent(store:KeyValueStore,id:string):Promise<{entry:RecentEntry;text:string}|null>{
 const entry=(await readIndex(store)).find(e=>e.id===id);if(!entry)return null;
 try{const text=await store.get(BLOB+id);return typeof text==='string'?{entry,text}:null;}catch{return null;}
}
export async function removeRecent(store:KeyValueStore,id:string):Promise<void>{
 const index=await readIndex(store);if(!index.some(e=>e.id===id))return;
 await store.set(INDEX_KEY,index.filter(e=>e.id!==id));await store.del(BLOB+id).catch(()=>undefined);
}
export async function clearRecent(store:KeyValueStore):Promise<void>{
 const index=await readIndex(store);await store.set(INDEX_KEY,[]);for(const e of index)await store.del(BLOB+e.id).catch(()=>undefined);
}
/** Autosave runs only for a changed scene, at most once per quiet period. */
export function autosaveDue(o:{dirty:boolean;lastChange:number;lastSave:number;now:number;quietMs?:number}):boolean{
 const quiet=o.quietMs??4000;return o.dirty&&o.lastChange>o.lastSave&&o.now-o.lastChange>=quiet;
}
