/** The slice of SessionCheckpointer the lifecycle side needs. Declared here so this module has no import back into checkpointer.ts. */
export interface LiveCheckpointer{readonly pinned:{reason:string;detail:string}|null;checkpoint():Promise<{ok:boolean}>;isCurrent():boolean;close():void;idle():Promise<unknown>}
/**
 * Synchronous index of what the recovery store holds and which sessions are live. The lifecycle manager asks hasUnsavedChanges()/pinReasons()
 * synchronously, but the store is async, so commits and releases keep this index current.
 */
export interface RecoverableEntry{studio:string;revision:number;checksum:string}
export interface LiveSession{studio:string;isDirty():boolean;cp:LiveCheckpointer}
const recoverable=new Map<string,RecoverableEntry>();const live=new Map<string,LiveSession>();
export const noteCommitted=(id:string,studio:string,revision:number,checksum:string)=>{recoverable.set(id,{studio,revision,checksum});};
export const noteReleased=(id:string)=>{recoverable.delete(id);};
export const recoverableFor=(studio:string)=>[...recoverable].filter(([,e])=>e.studio===studio).map(([id,e])=>({id,...e}));
export const trackLive=(id:string,s:LiveSession)=>{live.set(id,s);return()=>{if(live.get(id)===s)live.delete(id);};};
export const liveFor=(studio:string)=>[...live].filter(([,s])=>s.studio===studio).map(([id,s])=>({id,...s}));
export const resetRecoveryIndexForTests=()=>{recoverable.clear();live.clear();};
export const liveIds=():ReadonlySet<string>=>new Set(live.keys());
export const noteAllReleasedExceptLive=()=>{for(const id of [...recoverable.keys()])if(!live.has(id))recoverable.delete(id);};
