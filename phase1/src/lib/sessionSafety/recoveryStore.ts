import {decodeSnapshot,type Snapshot,type SnapshotMeta} from './snapshot';
/** Raw byte store, one record per key. Implementations must make put() atomic per key. */
export interface ByteStore{put(key:string,bytes:Uint8Array):Promise<void>;get(key:string):Promise<Uint8Array|null>;delete(key:string):Promise<void>;keys():Promise<string[]>}
export class StorageFullError extends Error{constructor(message='Recovery storage is full.'){super(message);this.name='StorageFullError';}}
/** In-memory store with optional byte quota and fault injection (tests, and a safe fallback when no durable store exists). */
export class MemoryByteStore implements ByteStore{
 readonly map=new Map<string,Uint8Array>();failNextPut:Error|null=null;constructor(private quota=Infinity){}
 private used(){let n=0;for(const v of this.map.values())n+=v.length;return n;}
 async put(k:string,b:Uint8Array){if(this.failNextPut){const e=this.failNextPut;this.failNextPut=null;throw e;}
  const next=this.used()-(this.map.get(k)?.length??0)+b.length;if(next>this.quota)throw new StorageFullError();this.map.set(k,b.slice());}
 async get(k:string){const v=this.map.get(k);return v?v.slice():null;}
 async delete(k:string){this.map.delete(k);}
 async keys(){return[...this.map.keys()];}
}
/** IndexedDB-backed store for the browser/WebView. Quota errors map to StorageFullError. Not exercised by unit tests (no IndexedDB in node). */
export class IndexedDbByteStore implements ByteStore{
 private db:Promise<IDBDatabase>|null=null;constructor(private name='somnia-recovery',private store='snapshots'){}
 private open(){return this.db??=new Promise((res,rej)=>{const r=indexedDB.open(this.name,1);r.onupgradeneeded=()=>r.result.createObjectStore(this.store);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
 private async tx<T>(mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await this.open();
  return new Promise<T>((res,rej)=>{const t=db.transaction(this.store,mode);const rq=fn(t.objectStore(this.store));let out:T;
   rq.onsuccess=()=>{out=rq.result;};
   t.oncomplete=()=>res(out);
   const fail=()=>{const e=t.error??rq.error;rej(e&&e.name==='QuotaExceededError'?new StorageFullError():e??new Error('IndexedDB failed'));};
   t.onerror=fail;t.onabort=fail;});
 }
 put(k:string,b:Uint8Array){return this.tx('readwrite',s=>s.put(b.slice(),k)).then(()=>undefined);}
 async get(k:string){const v=await this.tx<unknown>('readonly',s=>s.get(k));return v instanceof Uint8Array?v:v instanceof ArrayBuffer?new Uint8Array(v):null;}
 delete(k:string){return this.tx('readwrite',s=>s.delete(k)).then(()=>undefined);}
 async keys(){return(await this.tx<IDBValidKey[]>('readonly',s=>s.getAllKeys())).map(String);}
}
const SEP='@';
export const slotKey=(sessionId:string,generation:number)=>`${sessionId}${SEP}${String(generation).padStart(10,'0')}`;
const parseKey=(k:string)=>{const i=k.lastIndexOf(SEP);return i<0?null:{sessionId:k.slice(0,i),generation:Number(k.slice(i+1))};};
export interface Loaded{snapshot:Snapshot;slot:number;skippedCorrupt:number}
/**
 * Generation-slotted recovery storage. A new snapshot is written to a NEW key and read back and verified before older slots are pruned,
 * so a crash or failed write never destroys the last good snapshot. The newest slot that verifies wins.
 */
export class RecoveryStore{
 constructor(readonly bytes:ByteStore,private keep=2){}
 private async slots(sessionId:string){const out:number[]=[];for(const k of await this.bytes.keys()){const p=parseKey(k);if(p&&p.sessionId===sessionId&&Number.isFinite(p.generation))out.push(p.generation);}return out.sort((a,b)=>b-a);}
 async nextSlot(sessionId:string){return((await this.slots(sessionId))[0]??0)+1;}
 /** Writes, reads back, decodes and verifies; prunes older slots only on success. Throws on any failure (the old snapshot stays). */
 async commit(sessionId:string,slot:number,encoded:Uint8Array,expectedChecksum:string):Promise<void>{
  const key=slotKey(sessionId,slot);await this.bytes.put(key,encoded);
  try{const back=await this.bytes.get(key);if(!back)throw new Error('Recovery snapshot was not readable after writing.');
   const snap=await decodeSnapshot(back);if(snap.meta.checksum!==expectedChecksum)throw new Error('Recovery snapshot read back with a different checksum.');}
  catch(e){await this.bytes.delete(key).catch(()=>undefined);throw e;}
  for(const s of (await this.slots(sessionId)).slice(this.keep))await this.bytes.delete(slotKey(sessionId,s)).catch(()=>undefined);
 }
 /** Newest verifying snapshot; corrupt newer slots are skipped (and counted), never silently trusted. */
 async load(sessionId:string):Promise<Loaded|null>{
  let skipped=0;for(const slot of await this.slots(sessionId)){const raw=await this.bytes.get(slotKey(sessionId,slot));if(!raw){skipped++;continue;}
   try{return{snapshot:await decodeSnapshot(raw),slot,skippedCorrupt:skipped};}catch{skipped++;}}
  return null;
 }
 async discard(sessionId:string){for(const s of await this.slots(sessionId))await this.bytes.delete(slotKey(sessionId,s));}
 /** Sessions with recoverable snapshots, e.g. after a crash. Meta only; payload stays in the store. */
 async listRecoverable():Promise<SnapshotMeta[]>{
  const ids=new Set<string>();for(const k of await this.bytes.keys()){const p=parseKey(k);if(p)ids.add(p.sessionId);}
  const out:SnapshotMeta[]=[];for(const id of ids){const l=await this.load(id);if(l)out.push(l.snapshot.meta);}
  return out.sort((a,b)=>b.createdAt-a.createdAt);
 }
}
