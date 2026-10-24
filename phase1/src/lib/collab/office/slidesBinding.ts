import {openSlidesModel,appendSlidesOp,cleanSlidesOp,type SlidesModel,type SlidesOpKind,type SlidesOpEntry} from './slidesModel';
/**
 * Binds one deck's shared op journal to a local slides engine (concept 3.2, CO3).
 * Convergence rule: EVERY peer (including the author) applies entries only in journal order
 * on the same base bytes. A local op is validated against the current bytes first (dry run,
 * result discarded) so bad input never enters the journal; the real application happens in
 * the shared tail loop. An op that fails in journal order fails identically everywhere and
 * is skipped - bytes stay convergent even under concurrent inserts interleaving before it.
 * The binding owns the working bytes; the session re-renders from onBytes.
 */
export interface SlidesEnginePort{
 /** Run one journal op against bytes; returns the new bytes. Throws when the op does not apply. */
 apply(fn:SlidesOpKind,bytes:Uint8Array,args:unknown[]):Promise<Uint8Array>;
 /** Optional pre-validation for local ops (same checks as apply, result discarded). Defaults to a dry-run apply. */
 validate?(fn:SlidesOpKind,bytes:Uint8Array,args:unknown[]):Promise<unknown>;
}
export interface SlidesBindingDeps{
 engine:SlidesEnginePort;
 /** New working bytes after an apply; the session re-renders from these. */
 onBytes(bytes:Uint8Array):void;
}
interface LocalOp{index:number;inverse:SlidesOpEntry|null}
export class SlidesCollabBinding{
 readonly origin={binding:'slides'};   // transaction marker (journal entries carry authorship for undo)
 private model:SlidesModel;
 private off:()=>void;
 private bytes:Uint8Array;
 private applied=0;                    // journal entries already reflected in `bytes`
 private failed=new Set<number>();     // entries that threw in journal order (dropped everywhere)
 private queue:Promise<void>=Promise.resolve();
 private mine:LocalOp[]=[];private undone:LocalOp[]=[];
 constructor(doc:import('yjs').Doc,path:string,baseBytes:Uint8Array,private d:SlidesBindingDeps){
  this.model=openSlidesModel(doc,path);
  this.bytes=baseBytes;
  const onOps=()=>this.enqueueTail();
  this.model.ops.observe(onOps);
  this.off=()=>this.model.ops.unobserve(onOps);
 }
 get currentBytes(){return this.bytes;}
 get journalLength(){return this.model.ops.length;}
 /** Apply every journal entry not yet reflected in `bytes` (any origin: order is the convergence guarantee). */
 private enqueueTail(){
  this.queue=this.queue.then(async()=>{
   let changed=false;
   while(this.applied<this.model.ops.length){
    const idx=this.applied;const raw=this.model.ops.get(idx);this.applied++;
    const e=cleanSlidesOp(raw);if(!e)continue;
    try{this.bytes=await this.d.engine.apply(e.fn,this.bytes,e.args);changed=true;}
    catch{this.failed.add(idx);}}   // the same op fails on every peer in this order: skip, stay convergent
   if(changed)this.d.onBytes(this.bytes);});
  return this.queue;}
 private async submit(entry:SlidesOpEntry):Promise<number>{
  await this.queue;                                   // validate against the fully caught-up bytes
  if(this.d.engine.validate)await this.d.engine.validate(entry.fn,this.bytes,entry.args);
  else await this.d.engine.apply(entry.fn,this.bytes,entry.args);   // dry run: bad input never enters the journal
  appendSlidesOp(this.model,entry,this.origin);
  await this.enqueueTail();                           // real application, in journal order
  const index=this.model.ops.length-1;
  if(this.failed.has(index))throw new Error('Op no longer applies after a concurrent edit.');   // lost a race: the peer sees nothing
  return index;}
 /** Local op: validated, appended, applied in journal order. `inverse` enables per-person undo (text edits). */
 async applyLocalOp(fn:SlidesOpKind,args:unknown[],inverse?:SlidesOpEntry|null):Promise<void>{
  const index=await this.submit({fn,args});
  this.mine.push({index,inverse:inverse??null});
  this.undone=[];}
 /** Per-person undo for invertible ops (text edits carry their inverse); structural ops are not undoable in a session. */
 async undo():Promise<boolean>{
  while(this.mine.length){
   const last=this.mine[this.mine.length-1];
   if(!last.inverse||this.failed.has(last.index)){this.mine.pop();continue;}
   this.mine.pop();
   await this.submit(last.inverse);
   this.undone.push(last);return true;}
  return false;}
 async redo():Promise<boolean>{
  const last=this.undone.pop();if(!last?.inverse)return false;
  const raw=this.model.ops.get(last.index);const e=cleanSlidesOp(raw);if(!e||this.failed.has(last.index))return false;
  await this.submit(e);
  this.mine.push(last);return true;}
 get canUndo(){return this.mine.some(x=>x.inverse&&!this.failed.has(x.index));}
 get canRedo(){return this.undone.length>0;}
 /** Late join / adopt: nothing applied beyond the base yet; the tail loop covers it. */
 replay(){return this.enqueueTail();}
 destroy(){this.off();}
}
