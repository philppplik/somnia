import {openDocsModel,appendDocsOp,cleanDocsOp,type DocsModel,type DocsOpKind,type DocsOpEntry} from './docsModel';
export type {DocsOpKind} from './docsModel';
/**
 * Binds one document's shared op journal to a live DocumentsEngine (concept 3.2, CO4).
 * Convergence rule (same as CO3b): EVERY peer, author included, applies entries only in
 * journal order on the same base bytes. A local op validates against the caught-up state,
 * enters the journal, and its real application happens in the tail loop - the caller's
 * promise resolves with that in-order result. An op failing in journal order fails
 * identically on every peer and is skipped; bytes stay convergent.
 */
export interface DocsEnginePort{
 /** Run one journal op on the live engine; resolves with the engine call's result. */
 apply(kind:DocsOpKind,params:Record<string,unknown>):Promise<unknown>;
 /** Optional pre-validation for local ops (same checks as apply, no commit). Defaults to none. */
 validate?(kind:DocsOpKind,params:Record<string,unknown>):Promise<unknown>;
}
export interface DocsBindingDeps{
 engine:DocsEnginePort;
 /** After ANY entry applied in journal order (own or remote): the session refreshes its view. */
 onApplied?(idx:number,entry:DocsOpEntry,result:unknown):void;
}
interface LocalOp{index:number;inverse:Record<string,unknown>|null}
export class DocsCollabBinding{
 readonly origin={binding:'docs'};   // transaction marker (journal entries carry authorship for undo)
 private model:DocsModel;
 private off:()=>void;
 private applied=0;
 private failed=new Set<number>();
 private waiters=new Map<number,{resolve:(r:unknown)=>void;reject:(e:Error)=>void}>();
 private queue:Promise<void>=Promise.resolve();
 private mine:LocalOp[]=[];private undone:LocalOp[]=[];
 constructor(doc:import('yjs').Doc,path:string,private d:DocsBindingDeps){
  this.model=openDocsModel(doc,path);
  const onOps=()=>this.enqueueTail();
  this.model.ops.observe(onOps);
  this.off=()=>this.model.ops.unobserve(onOps);
 }
 get journalLength(){return this.model.ops.length;}
 private enqueueTail(){
  this.queue=this.queue.then(async()=>{
   while(this.applied<this.model.ops.length){
    const idx=this.applied;const raw=this.model.ops.get(idx);this.applied++;
    const e=cleanDocsOp(raw);
    if(!e){this.waiters.get(idx)?.reject(new Error('Malformed journal entry.'));this.waiters.delete(idx);continue;}
    try{const result=await this.d.engine.apply(e.kind,e.params);this.waiters.get(idx)?.resolve(result);this.d.onApplied?.(idx,e,result);}
    catch(error){this.failed.add(idx);this.waiters.get(idx)?.reject(error instanceof Error?error:new Error(String(error)));}
    this.waiters.delete(idx);}});
  return this.queue;}
 private async submit(entry:DocsOpEntry):Promise<{index:number;result:unknown}>{
  await this.queue;                                   // validate against the fully caught-up state
  if(this.d.engine.validate)await this.d.engine.validate(entry.kind,entry.params);
  appendDocsOp(this.model,entry,this.origin);
  const index=this.model.ops.length-1;
  const done=new Promise<unknown>((resolve,reject)=>this.waiters.set(index,{resolve,reject}));
  this.enqueueTail();
  try{return{index,result:await done};}
  catch{throw new Error('Op no longer applies after a concurrent edit.');}   // lost a race: nothing was applied, anywhere
 }
 /** Local op: validated, appended, applied in journal order; resolves with the in-order engine result. */
 async applyLocalOp(kind:DocsOpKind,params:Record<string,unknown>,inverse?:Record<string,unknown>|null):Promise<unknown>{
  const{index,result}=await this.submit({kind,params,...(inverse?{inverse}:{})});
  this.mine.push({index,inverse:inverse??null});
  this.undone=[];
  return result;}
 /** Per-person undo: the inverse of my last invertible op is appended and applied in order (replace-params shape). */
 async undo():Promise<boolean>{
  while(this.mine.length){
   const last=this.mine[this.mine.length-1];
   if(!last.inverse||this.failed.has(last.index)){this.mine.pop();continue;}
   this.mine.pop();
   await this.submit({kind:'replace',params:last.inverse});
   this.undone.push(last);return true;}
  return false;}
 async redo():Promise<boolean>{
  const last=this.undone.pop();if(!last?.inverse)return false;
  const raw=this.model.ops.get(last.index);const e=cleanDocsOp(raw);if(!e||this.failed.has(last.index))return false;
  await this.submit({kind:e.kind,params:e.params});
  this.mine.push(last);return true;}
 get canUndo(){return this.mine.some(x=>x.inverse&&!this.failed.has(x.index));}
 get canRedo(){return this.undone.length>0;}
 /** Late join / adopt: apply everything the journal already holds, in order. */
 replay(){return this.enqueueTail();}
 destroy(){this.off();}
}
