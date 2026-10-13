import {createSnapshot,encodeSnapshot,type HistoryCheckpoint,type Snapshot} from './snapshot';
import type {RecoveryStore} from './recoveryStore';
export interface CaptureResult{revision:number;payload:Uint8Array;history:HistoryCheckpoint;view:Record<string,unknown>;format:string;engineVersion:string}
export interface Clock{setTimeout(fn:()=>void,ms:number):unknown;clearTimeout(h:unknown):void;now():number}
const realClock:Clock={setTimeout:(f,m)=>setTimeout(f,m),clearTimeout:h=>clearTimeout(h as ReturnType<typeof setTimeout>),now:()=>Date.now()};
export type PinReason='checkpoint-failed'|'edits-racing'|'storage-full'|'history-would-be-lost'|'not-quiescent'|'leased';
export interface CheckpointerOptions{
 sessionId:string;studio:string;store:RecoveryStore;
 /** Fingerprint of the source this session was opened from (never of the edited bytes). */
 sourceFingerprint:string;
 /** Monotonic counter bumped by every accepted edit (and undo/redo). */
 getRevision():number;isDirty():boolean;
 /** True when the undo/redo history would be restored exactly from a snapshot. Documents: journal. Sheets: false (engine-internal). */
 historyRestorable?():boolean;hasUndoHistory?():boolean;
 /** Serialize the CURRENT edited state. Called only at a safe boundary. */
 capture():Promise<CaptureResult>;
 /** Wait for a safe transaction boundary (IME, pointer drag, in-flight engine op). Return false if input cannot safely commit now. */
 quiesce?():Promise<boolean>;
 /** Job/resource leases (perf lifecycle scheduler.hasLease). A leased session is never disposed. */
 hasLease?():boolean;
 onPin?(reason:PinReason,detail:string):void;onUnpin?():void;
 debounceMs?:number;maxIntervalMs?:number;maxRaceRetries?:number;clock?:Clock;
}
export type CheckpointResult={ok:true;revision:number;slot:number;skipped?:'clean'|'current'}|{ok:false;reason:PinReason;detail:string};
export type SuspendDecision={ok:true;revision:number|null;historyLost:boolean;generation:number}|{ok:false;reason:PinReason;detail:string};
export class StaleGenerationError extends Error{constructor(){super('Resume result belongs to an older session generation and was dropped.');this.name='StaleGenerationError';}}
export type ResumeResult={ok:true;snapshot:Snapshot}|{ok:false;reason:'missing'|'source-changed'|'corrupt'|'stale';detail:string};
/**
 * Incremental, verified checkpointing for one document session.
 * Race-safe: capture happens at a quiescent boundary, the revision is rechecked after the verified write, and disposal goes through
 * disposeIfSafe(), which re-checks revision and leases synchronously right before running the dispose callback.
 */
export class SessionCheckpointer{
 private o:Required<Pick<CheckpointerOptions,'debounceMs'|'maxIntervalMs'|'maxRaceRetries'>>&CheckpointerOptions;
 private clock:Clock;private timer:unknown=null;private firstPendingAt:number|null=null;
 private running:Promise<CheckpointResult>|null=null;private rerun=false;
 private verifiedRevision:number|null=null;private lastSlot=0;
 private _pin:{reason:PinReason;detail:string}|null=null;private gen=1;private resuming:Promise<ResumeResult>|null=null;private closed=false;
 constructor(o:CheckpointerOptions){this.o={debounceMs:1500,maxIntervalMs:10_000,maxRaceRetries:3,...o};this.clock=o.clock??realClock;}
 get generation(){return this.gen;}get pinned(){return this._pin;}get verified(){return this.verifiedRevision;}
 /** True when a verified snapshot exists for exactly the current revision (or nothing is dirty). */
 isCurrent(){return !this.o.isDirty()||this.verifiedRevision===this.o.getRevision();}
 private pin(reason:PinReason,detail:string):CheckpointResult{if(!this._pin||this._pin.reason!==reason)this.o.onPin?.(reason,detail);this._pin={reason,detail};return{ok:false,reason,detail};}
 private unpin(){if(this._pin){this._pin=null;this.o.onUnpin?.();}}
 /** Call after every accepted edit. Debounced, but never later than maxIntervalMs after the first unflushed edit. */
 noteEdit(){
  if(this.closed)return;const now=this.clock.now();this.firstPendingAt??=now;
  if(this.timer!==null)this.clock.clearTimeout(this.timer);
  const wait=Math.max(0,Math.min(this.o.debounceMs,this.firstPendingAt+this.o.maxIntervalMs-now));
  this.timer=this.clock.setTimeout(()=>{this.timer=null;void this.checkpoint().catch(()=>undefined);},wait);
 }
 /** Single-flight: a call during a running checkpoint schedules exactly one follow-up run. */
 checkpoint():Promise<CheckpointResult>{
  if(this.running){this.rerun=true;return this.running.then(()=>this.running??this.checkpoint());}
  const run=(async():Promise<CheckpointResult>=>{let r=await this.once();
   while(this.rerun&&r.ok){this.rerun=false;r=await this.once();}
   this.rerun=false;return r;})().finally(()=>{this.running=null;});
  this.running=run;return run;
 }
 private async once():Promise<CheckpointResult>{
  if(this.closed)return{ok:false,reason:'checkpoint-failed',detail:'Session closed.'};
  if(this.timer!==null){this.clock.clearTimeout(this.timer);this.timer=null;}
  if(!this.o.isDirty()){this.firstPendingAt=null;return{ok:true,revision:this.o.getRevision(),slot:this.lastSlot,skipped:'clean'};}
  if(this.verifiedRevision===this.o.getRevision()){this.firstPendingAt=null;return{ok:true,revision:this.verifiedRevision,slot:this.lastSlot,skipped:'current'};}
  for(let attempt=0;attempt<=this.o.maxRaceRetries;attempt++){
   if(this.o.quiesce&&!(await this.o.quiesce())){return this.pin('not-quiescent','Input could not be committed at a safe boundary.');}
   const rev0=this.o.getRevision();let cap:CaptureResult;
   try{cap=await this.o.capture();}catch(e){return this.pin('checkpoint-failed',`Capture failed: ${msg(e)}`);}
   if(cap.revision!==rev0||this.o.getRevision()!==rev0)continue; // edit landed during capture: retry
   try{
    const slot=await this.o.store.nextSlot(this.o.sessionId);
    const snap=await createSnapshot({sessionId:this.o.sessionId,studio:this.o.studio,format:cap.format,engineVersion:cap.engineVersion,sourceFingerprint:this.o.sourceFingerprint,revision:cap.revision,generation:this.gen,history:cap.history,view:cap.view},cap.payload);
    await this.o.store.commit(this.o.sessionId,slot,encodeSnapshot(snap),snap.meta.checksum);
    if(this.o.getRevision()!==cap.revision)continue; // verified, but already stale for suspend purposes; the slot stays as a valid older state
    this.verifiedRevision=cap.revision;this.lastSlot=slot;this.firstPendingAt=null;this.unpin();
    return{ok:true,revision:cap.revision,slot};
   }catch(e){return this.pin(e instanceof Error&&e.name==='StorageFullError'?'storage-full':'checkpoint-failed',`Checkpoint write failed: ${msg(e)}`);}
  }
  return this.pin('edits-racing','Edits kept arriving while the checkpoint was written.');
 }
 /**
  * Decide whether this session may be torn down. Dirty sessions need a verified checkpoint of the current revision; a pinned or leased
  * session is refused. `pressure` allows losing undo history (never edits) when history is not restorable.
  */
 async prepareSuspend(opts:{pressure?:boolean}={}):Promise<SuspendDecision>{
  if(this.o.hasLease?.())return{ok:false,reason:'leased',detail:'A job lease holds this session.'};
  const dirty=this.o.isDirty();
  if(dirty){const r=await this.checkpoint();if(!r.ok)return r;if(!this.isCurrent())return{ok:false,reason:'edits-racing',detail:'Edits arrived after the checkpoint.'};}
  const historyLost=!!this.o.hasUndoHistory?.()&&!(this.o.historyRestorable?.()??false);
  if(historyLost&&!opts.pressure)return{ok:false,reason:'history-would-be-lost',detail:'Undo history cannot be restored from the checkpoint.'};
  return{ok:true,revision:dirty?this.verifiedRevision:null,historyLost,generation:this.gen};
 }
 /** Synchronous last gate before terminating a worker. Returns false (and runs nothing) if anything changed since prepareSuspend. */
 disposeIfSafe(dispose:()=>void):boolean{
  if(this.o.hasLease?.()||!this.isCurrent())return false;
  this.gen++;dispose();return true;
 }
 /**
  * Restore the newest verified snapshot. One in-flight promise per session (deduplicated). The snapshot is only used when it belongs to
  * the same source; a changed source is reported as a conflict and never overwritten silently. Late results from older generations are dropped.
  */
 resume(restore:(s:Snapshot)=>Promise<void>,currentSourceFingerprint:()=>Promise<string>):Promise<ResumeResult>{
  if(this.resuming)return this.resuming;
  const g=this.gen;
  const p=(async():Promise<ResumeResult>=>{
   const loaded=await this.o.store.load(this.o.sessionId).catch(()=>null);
   if(!loaded)return{ok:false,reason:'missing',detail:'No verified recovery snapshot.'};
   const fp=await currentSourceFingerprint();
   if(loaded.snapshot.meta.sourceFingerprint!==fp)return{ok:false,reason:'source-changed',detail:'The file on disk changed after the recovery snapshot was taken.'};
   try{await restore(loaded.snapshot);}catch(e){return{ok:false,reason:'corrupt',detail:`Restore failed: ${msg(e)}`};}
   if(g!==this.gen)throw new StaleGenerationError();
   this.verifiedRevision=this.o.getRevision()===loaded.snapshot.meta.revision?loaded.snapshot.meta.revision:null;
   return{ok:true,snapshot:loaded.snapshot};
  })().finally(()=>{this.resuming=null;});
  this.resuming=p;return p;
 }
 /** After the source file was written and verified at `revision`. Snapshots are dropped only if nothing changed since. */
 async releaseAfterSave(revision:number):Promise<boolean>{
  if(this.o.getRevision()!==revision)return false;await this.o.store.discard(this.o.sessionId);this.verifiedRevision=null;this.firstPendingAt=null;this.unpin();return true;
 }
 /** User explicitly discarded the session. */
 async discard(){this.close();await this.o.store.discard(this.o.sessionId);}
 /** Resolves when no checkpoint run is in flight (used before a teardown flush so slot writes never interleave). */
 idle():Promise<unknown>{return(this.running??Promise.resolve()).catch(()=>undefined);}
 close(){this.closed=true;if(this.timer!==null){this.clock.clearTimeout(this.timer);this.timer=null;}}
}
const msg=(e:unknown)=>e instanceof Error?e.message:String(e);
