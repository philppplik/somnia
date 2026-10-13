import {checksumParts} from '../lifecycle/checksum';
import type {StudioLifecycleAdapter,StudioSnapshot} from '../lifecycle/types';
import {defaultRecoveryStore,whenFlushed} from './flush';
import {liveFor,recoverableFor} from './recoveryIndex';
import type {RecoveryStore} from './recoveryStore';
export const RECOVERY_SNAPSHOT_SCHEMA=1;
export interface RecoveryRef{id:string;revision:number;checksum:string}
export interface RecoveryRefsPayload{sessions:readonly RecoveryRef[]}
const refsChecksum=(studio:string,p:RecoveryRefsPayload)=>checksumParts(['recovery-refs',RECOVERY_SNAPSHOT_SCHEMA,studio,...p.sessions.flatMap(s=>[s.id,s.revision,s.checksum])]);
/**
 * Lifecycle adapter for studios whose authoritative unsaved state already lives in the verified RecoveryStore (Documents, Sheets).
 * The lifecycle checkpoint is a small reference list (session id, revision, snapshot checksum); the bytes stay in the recovery store, so
 * no second copy of edited packages is held in the manager's memory bucket. Views unmount when a studio becomes inactive, and that
 * teardown already flushed a verified checkpoint; suspend() only waits for those flushes. Engines are owned by the views, not here.
 */
export function createRecoveryLifecycleAdapter(studioId:string,store:()=>RecoveryStore=defaultRecoveryStore):StudioLifecycleAdapter{
 const ids=()=>new Set([...liveFor(studioId).map(s=>s.id),...recoverableFor(studioId).map(s=>s.id)]);
 const settle=()=>Promise.all([...ids()].map(id=>whenFlushed(id)));
 return{
  estimateBytes(){return 0;},
  resourceIds(){return[`studio:${studioId}`,...[...ids()].map(id=>`${studioId}:session:${id.slice(studioId.length+1)}`)];},
  pinReasons(){const r=new Set<string>();for(const s of liveFor(studioId))if(s.cp.pinned)r.add(`checkpoint-pinned:${s.cp.pinned.reason}`);return[...r];},
  hasUnsavedChanges(){return liveFor(studioId).some(s=>s.isDirty())||recoverableFor(studioId).length>0;},
  async snapshot():Promise<StudioSnapshot|null>{
   await settle();
   for(const s of liveFor(studioId)){if(!s.isDirty())continue;const r=await s.cp.checkpoint();if(!r.ok||!s.cp.isCurrent())return null;}
   await settle();
   const sessions=recoverableFor(studioId).map(({id,revision,checksum})=>({id,revision,checksum}));
   const payload:RecoveryRefsPayload={sessions};
   return{studioId,schemaVersion:RECOVERY_SNAPSHOT_SCHEMA,revision:Math.max(0,...sessions.map(s=>s.revision)),capturedAt:Date.now(),bytesEstimate:256+sessions.length*128,checksum:refsChecksum(studioId,payload),payload};
  },
  async suspend(){await settle();},
  async resume(snapshot){
   const p=snapshot.payload as RecoveryRefsPayload|null;
   if(snapshot.studioId!==studioId||snapshot.schemaVersion!==RECOVERY_SNAPSHOT_SCHEMA||!p||!Array.isArray(p.sessions)||refsChecksum(studioId,p)!==snapshot.checksum)throw new Error('Recovery checkpoint reference failed verification');
   for(const ref of p.sessions){const l=await store().load(ref.id);if(!l||l.snapshot.meta.checksum!==ref.checksum)throw new Error(`Recovery snapshot for ${ref.id} is missing or changed`);}
  },
  async dispose(){if(this.hasUnsavedChanges?.())throw new Error('Refusing to evict unsaved edits');},
 };
}
