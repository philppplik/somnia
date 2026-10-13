import {createSnapshot,encodeSnapshot,type HistoryCheckpoint} from './snapshot';
import {noteCommitted,noteReleased,trackLive,type LiveSession} from './recoveryIndex';
import {IndexedDbByteStore,MemoryByteStore,RecoveryStore} from './recoveryStore';
let shared:RecoveryStore|null=null;
/** App-wide recovery store: IndexedDB when available, otherwise memory (survives view lifetimes, not a crash). */
export function defaultRecoveryStore():RecoveryStore{
 return shared??=new RecoveryStore(typeof indexedDB!=='undefined'?new IndexedDbByteStore():new MemoryByteStore());
}
export function setRecoveryStoreForTests(s:RecoveryStore|null){shared=s;}
const discarded=new Set<string>();const active=new Map<string,{close():void;idle():Promise<unknown>}>();
/** Mark a live session so closing it (and its teardown flush) never leaves a recovery snapshot behind. */
export function registerActiveSession(id:string,cp:{close():void;idle():Promise<unknown>},meta?:Omit<LiveSession,'cp'>&{cp?:never}){
 discarded.delete(id);active.set(id,cp);const off=meta?trackLive(id,{...meta,cp:cp as LiveSession['cp']}):()=>undefined;
 return()=>{off();if(active.get(id)===cp)active.delete(id);};
}
/** The user closed/discarded the document: stop checkpointing, wait for in-flight writes, delete all snapshots. A later teardown flush is skipped. */
export async function discardSession(id:string,store:RecoveryStore=defaultRecoveryStore()){
 discarded.add(id);const c=active.get(id);c?.close();await c?.idle();await whenFlushed(id);await store.discard(id);noteReleased(id);
}
const pending=new Map<string,Promise<boolean>>();
/** Resolves once any teardown flush for this session finished, so a remount never reads the store before the last edits landed. */
export const whenFlushed=(sessionId:string):Promise<unknown>=>pending.get(sessionId)??Promise.resolve();
export interface FlushInput{
 sessionId:string;studio:string;store:RecoveryStore;sourceFingerprint:string;revision:number;format:string;engineVersion:string;
 history:HistoryCheckpoint|Promise<HistoryCheckpoint>;view:Record<string,unknown>;
 /** Serializes the engine state. Runs against the (still alive) engine; the caller disposes it after the returned promise settles. */
 payload():Promise<Uint8Array>;quiesce?():Promise<unknown>;
}
/**
 * Last verified checkpoint when a view goes away. Everything state-like is passed in by value (frozen synchronously by the caller) so a
 * fast remount that resets shared session state cannot change what gets written. Resolves false when the write did not verify.
 */
export function flushOnTeardown(i:FlushInput):Promise<boolean>{
 const prev=pending.get(i.sessionId)??Promise.resolve(true);
 const run=prev.catch(()=>true).then(async()=>{
  try{
   if(discarded.has(i.sessionId))return true;await i.quiesce?.();const payload=await i.payload();if(discarded.has(i.sessionId))return true;
   const snap=await createSnapshot({sessionId:i.sessionId,studio:i.studio,format:i.format,engineVersion:i.engineVersion,sourceFingerprint:i.sourceFingerprint,revision:i.revision,generation:0,history:await i.history,view:i.view},payload);
   await i.store.commit(i.sessionId,await i.store.nextSlot(i.sessionId),encodeSnapshot(snap),snap.meta.checksum);noteCommitted(i.sessionId,i.studio,i.revision,snap.meta.checksum);return true;
  }catch{return false;}
 }).finally(()=>{if(pending.get(i.sessionId)===run)pending.delete(i.sessionId);});
 pending.set(i.sessionId,run);return run;
}
