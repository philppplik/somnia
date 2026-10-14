import type {KeyValueStore} from './recent';
/** IndexedDB-backed store. No dependency; falls back to an unavailable error that recent.ts turns into a quiet no-op. */
const DB='somnia-studio3d',TABLE='recent';
function open():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB is not available.'));return;}
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{req.result.createObjectStore(TABLE);};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error??new Error('IndexedDB failed.'));
 });
}
async function run<T>(mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await open();
 try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction(TABLE,mode);const r=fn(tx.objectStore(TABLE));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Storage was refused.'));});}
 finally{db.close();}
}
export const idbStore:KeyValueStore={
 get:key=>run('readonly',s=>s.get(key)),
 set:async(key,value)=>{await run('readwrite',s=>s.put(value,key));},
 del:async key=>{await run('readwrite',s=>s.delete(key));},
};
