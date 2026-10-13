import type {SessionCheckpointer} from './checkpointer';
/**
 * Synchronous index of what the recovery store holds and which sessions are live. The lifecycle manager asks hasUnsavedChanges()/pinReasons()
 * synchronously, but the store is async, so commits and releases keep this index current.
 */
export interface RecoverableEntry{studio:string;revision:number;checksum:string}
export interface LiveSession{studio:string;isDirty():boolean;cp:SessionCheckpointer}
const recoverable=new Map<string,RecoverableEntry>();const live=new Map<string,LiveSession>();
export const noteCommitted=(id:string,studio:string,revision:number,checksum:string)=>{recoverable.set(id,{studio,revision,checksum});};
export const noteReleased=(id:string)=>{recoverable.delete(id);};
export const recoverableFor=(studio:string)=>[...recoverable].filter(([,e])=>e.studio===studio).map(([id,e])=>({id,...e}));
export const trackLive=(id:string,s:LiveSession)=>{live.set(id,s);return()=>{if(live.get(id)===s)live.delete(id);};};
export const liveFor=(studio:string)=>[...live].filter(([,s])=>s.studio===studio).map(([id,s])=>({id,...s}));
export const resetRecoveryIndexForTests=()=>{recoverable.clear();live.clear();};
