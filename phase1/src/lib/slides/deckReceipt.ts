/**
 * Reviewed deck apply with an owner receipt. The owner port is the only thing that touches the
 * session; this module decides the outcome class. Known non-mutation, applied, no-op and unknown
 * are separate results, and the logical history delta is never derived from history length.
 */
export type ReceiptStatus='applied'|'noop'|'precommit'|'unknown';
export interface DeckReceipt {
  status:ReceiptStatus;origin:string;identity:string;generation:number;
  beforeRevision:number;afterRevision:number|null;
  /** Logical history steps added by this action: 1 applied, 0 no-op or proven pre-commit failure, null unknown. */
  historyDelta:0|1|null;undoable:boolean;
  /** Serialized deck read back from the owner after commit; null when nothing was committed or it could not be read. */
  readback:string|null;readbackMatches:boolean|null;
  /** Post-commit render or listener failure. Never changes the status. */
  notifyError:string|null;error:string|null;token:string|null;
}
export interface DeckSnapshot {generation:number;identity:string;revision:number;busy:boolean;disposed:boolean;text:string|null;working:Uint8Array|null}
export interface DeckOwnerPort<S> {
  snapshot():DeckSnapshot|null;
  /** Pure, synchronous: new bytes from the reviewed text. Throws when the edit cannot be built. */
  edit(snapshot:DeckSnapshot,reviewedText:string):Uint8Array;
  setBusy(on:boolean):void;
  /** Open and read the new bytes without changing the session. May leave the native worker on the new deck. */
  stage(bytes:Uint8Array):Promise<S>;
  /** Put the native worker back on the committed deck after a failed stage. */
  restoreNative(working:Uint8Array):Promise<void>;
  /** Synchronous commit point: working bytes, revision and ONE logical history entry change together. Returns the new revision and the entry token. */
  commit(staged:S,before:Uint8Array,after:Uint8Array,origin:string):{revision:number;token:string;undoable:boolean};
  /** Render and notify. Failures here are reported, not thrown into the outcome. */
  render():Promise<void>;
  readback():string|null;
  fail(message:string):void;
}
export class ReceiptError extends Error {constructor(readonly code:'stale'|'busy'|'closed',message:string){super(message);}}
export interface ReviewedApply {text:string;revision:number;identity:string;generation:number}
const blank=(s:DeckSnapshot,origin:string):DeckReceipt=>({status:'precommit',origin,identity:s.identity,generation:s.generation,beforeRevision:s.revision,afterRevision:null,historyDelta:0,undoable:false,readback:null,readbackMatches:null,notifyError:null,error:null,token:null});
export function checkReviewed(s:DeckSnapshot|null,r:ReviewedApply):DeckSnapshot{
  if(!s||s.disposed)throw new ReceiptError('closed','Deck is not open.');
  if(s.busy)throw new ReceiptError('busy','Deck is busy.');
  if(s.generation!==r.generation||s.identity!==r.identity||s.revision!==r.revision||s.text!==r.text||!s.working)throw new ReceiptError('stale','Deck changed since review.');
  return s;
}
export async function applyReviewed<S>(port:DeckOwnerPort<S>,review:ReviewedApply,origin:string):Promise<DeckReceipt>{
  const s=checkReviewed(port.snapshot(),review),before=s.working!,r=blank(s,origin);
  let after:Uint8Array;
  try{after=port.edit(s,review.text);}catch(e){return {...r,error:String(e)};}
  if(after.length===before.length&&after.every((v,i)=>v===before[i]))return {...r,status:'noop',readback:s.text,readbackMatches:true};
  port.setBusy(true);
  let staged:S;
  try{staged=await port.stage(after);}
  catch(e){
    try{await port.restoreNative(before);}
    catch(re){port.setBusy(false);port.fail(String(re));return {...r,status:'unknown',historyDelta:null,error:`${String(e)}; restore failed: ${String(re)}`};}
    port.setBusy(false);port.fail(String(e));return {...r,error:String(e)};
  }
  // Recheck after the await, inside the synchronous commit boundary.
  const now=port.snapshot();
  if(!now||now.disposed||now.generation!==s.generation||now.revision!==s.revision||now.working!==before){
    try{await port.restoreNative(before);}catch(re){port.setBusy(false);return {...r,status:'unknown',historyDelta:null,error:`Deck changed during apply; restore failed: ${String(re)}`};}
    port.setBusy(false);return {...r,error:'Deck changed during apply.'};
  }
  let committed:{revision:number;token:string;undoable:boolean},notifyError:string|null=null;
  try{committed=port.commit(staged,before,after,origin);}
  catch(e){
    const post=port.snapshot();
    if(post&&post.working===after){committed={revision:post.revision,token:'',undoable:false};notifyError=String(e);}
    else{port.setBusy(false);return {...r,status:'unknown',historyDelta:null,error:String(e)};}
  }
  let readback:string|null=null;
  try{readback=port.readback();}catch{readback=null;}
  try{await port.render();}catch(e){notifyError=notifyError??String(e);}
  port.setBusy(false);
  return {...r,status:'applied',afterRevision:committed.revision,historyDelta:committed.undoable?1:0,undoable:committed.undoable,readback,readbackMatches:readback===null?null:readback===review.text,notifyError,token:committed.token||null};
}
export interface UndoPort<S> {
  snapshot():DeckSnapshot|null;
  /** The exact before-deck of this receipt, only if it is still the newest history entry and the working bytes are still the receipt's result. */
  matches(token:string,generation:number):Uint8Array|null;
  setBusy(on:boolean):void;
  stage(bytes:Uint8Array):Promise<S>;
  restoreNative(working:Uint8Array):Promise<void>;
  commitUndo(staged:S,token:string):{revision:number};
  render():Promise<void>;
  readback():string|null;
  fail(message:string):void;
}
export async function undoReceipt<S>(port:UndoPort<S>,receipt:DeckReceipt):Promise<DeckReceipt>{
  const s=port.snapshot();
  if(!s||s.disposed)throw new ReceiptError('closed','Deck is not open.');
  if(s.busy)throw new ReceiptError('busy','Deck is busy.');
  if(!receipt.token||receipt.status!=='applied'||!receipt.undoable)throw new ReceiptError('stale','Nothing to undo for this receipt.');
  const prior=port.matches(receipt.token,receipt.generation);
  if(!prior||s.generation!==receipt.generation||s.identity!==receipt.identity||s.revision!==receipt.afterRevision)throw new ReceiptError('stale','Deck changed since the reviewed edit.');
  const current=s.working!,r:DeckReceipt={...blank(s,receipt.origin),beforeRevision:s.revision};
  port.setBusy(true);
  let staged:S;
  try{staged=await port.stage(prior);}
  catch(e){
    try{await port.restoreNative(current);}catch(re){port.setBusy(false);port.fail(String(re));return {...r,status:'unknown',historyDelta:null,error:`${String(e)}; restore failed: ${String(re)}`};}
    port.setBusy(false);port.fail(String(e));return {...r,error:String(e)};
  }
  const now=port.snapshot();
  if(!now||now.disposed||now.working!==current||now.revision!==s.revision||!port.matches(receipt.token,receipt.generation)){
    try{await port.restoreNative(current);}catch(re){port.setBusy(false);return {...r,status:'unknown',historyDelta:null,error:`Deck changed during undo; restore failed: ${String(re)}`};}
    port.setBusy(false);return {...r,error:'Deck changed during undo.'};
  }
  let revision:number,notifyError:string|null=null;
  try{revision=port.commitUndo(staged,receipt.token).revision;}
  catch(e){const post=port.snapshot();if(post&&post.working===prior){revision=post.revision;notifyError=String(e);}else{port.setBusy(false);return {...r,status:'unknown',historyDelta:null,error:String(e)};}}
  let readback:string|null=null;try{readback=port.readback();}catch{readback=null;}
  try{await port.render();}catch(e){notifyError=notifyError??String(e);}
  port.setBusy(false);
  return {...r,status:'applied',afterRevision:revision,historyDelta:1,undoable:false,readback,readbackMatches:null,notifyError};
}
