import {ReceiptError,type DeckReceipt,type ReviewedApply} from '../slides/deckReceipt';
import {planReviewedSlideText,type SlidesMultiOwnerSnapshot} from './slidesMultiReviewedPlan';
import type {SlideTextPreview,SlideTextPreviewTarget} from './slidesMultiTextPort';
export interface SlidesMultiExecutionHost {
 permission(effect:'apply'|'undo'):void;current():SlideTextPreviewTarget;snapshot():SlidesMultiOwnerSnapshot;
 /** Must be a separately verified same-slide multi-run owner. Existing single-run API is not sufficient. */
 apply(review:ReviewedApply,origin:string):Promise<DeckReceipt>;undo(receipt:DeckReceipt):Promise<DeckReceipt>;
}
export class SlidesMultiApplyError extends Error {constructor(message:string,readonly outcome:'none'|'unknown'){super(message);this.name='SlidesMultiApplyError';}}
const eq=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
interface Pending {preview:SlideTextPreview;host:SlidesMultiExecutionHost;review:ReviewedApply;origin:string}
/** Host-private preparation only. Not wired to live panel until multi-run owner API is verified. */
export class SlidesMultiTransactions {
 private generation=0;private flight=0;private pending=new Map<string,Pending>();private owned=new Map<string,Pending&{receipt:DeckReceipt}>();
 get busy(){return this.flight>0;}get hasPending(){return this.pending.size>0;}has(id:string){return this.pending.has(id)||this.owned.has(id);}
 stage(id:string,preview:SlideTextPreview,host:SlidesMultiExecutionHost){if(this.has(id))throw Error('Duplicate multi-text review.');const pinned=structuredClone(preview);if(!eq(pinned.target,host.current()))throw Error('Slide changed.');const review=planReviewedSlideText(pinned,host.snapshot());this.pending.set(id,{preview:pinned,host,review,origin:'ai:'+crypto.randomUUID()});}
 reject(id:string){return this.pending.delete(id);}revokePending(){this.generation++;this.pending.clear();}clear(){this.revokePending();this.owned.clear();}
 async accept(id:string,signal:AbortSignal){
  const r=this.pending.get(id);if(!r)throw Error('Multi-text preview no longer pending.');this.pending.delete(id);const generation=this.generation;this.flight++;let entered=false;
  try{
   r.host.permission('apply');signal.throwIfAborted();if(generation!==this.generation||!eq(r.preview.target,r.host.current()))throw Error('Review or slide changed.');
   const fresh=planReviewedSlideText(r.preview,r.host.snapshot());if(!eq(fresh,r.review))throw Error('Native deck changed since preview.');
   r.host.permission('apply');signal.throwIfAborted();if(generation!==this.generation||!eq(r.preview.target,r.host.current()))throw Error('Review or slide changed.');
   entered=true;const receipt=await r.host.apply(structuredClone(r.review),r.origin);
   const now=r.host.snapshot();
   if(generation!==this.generation||receipt.status!=='applied'||receipt.origin!==r.origin||receipt.identity!==r.review.identity||receipt.generation!==r.review.generation||receipt.beforeRevision!==r.review.revision||receipt.afterRevision!==r.review.revision+1||receipt.historyDelta!==1||!receipt.undoable||!receipt.token||receipt.readback!==r.review.afterText||receipt.readbackMatches!==true||now.text!==r.review.afterText||now.revision!==receipt.afterRevision||now.generation!==r.review.generation||now.identity!==r.review.identity)throw Error('Multi-text receipt/readback unverified. Inspect before retrying.');
   this.owned.set(id,{...r,receipt:structuredClone(receipt)});return structuredClone(receipt);
  }catch(e){throw new SlidesMultiApplyError(e instanceof Error?e.message:'Multi-text apply failed.',!entered||e instanceof ReceiptError?'none':'unknown');}finally{this.flight--;}
 }
 async undo(id:string,signal:AbortSignal){
  const r=this.owned.get(id);if(!r)throw Error('No owned multi-text receipt.');const generation=this.generation;r.host.permission('undo');signal.throwIfAborted();const before=r.host.snapshot();
  if(before.text!==r.review.afterText||before.generation!==r.review.generation||before.identity!==r.review.identity||before.revision!==r.receipt.afterRevision)throw new SlidesMultiApplyError('Native deck changed before undo.','none');
  if(generation!==this.generation||this.owned.get(id)!==r)throw new SlidesMultiApplyError('Review session changed before undo.','none');
  this.owned.delete(id);this.flight++;
  try{const receipt=await r.host.undo(structuredClone(r.receipt));const now=r.host.snapshot();if(generation!==this.generation||receipt.status!=='applied'||receipt.origin!==r.origin||receipt.historyDelta!==1||receipt.undoable||receipt.beforeRevision!==before.revision||receipt.afterRevision!==before.revision+1||receipt.identity!==before.identity||receipt.generation!==before.generation||receipt.readback!==r.review.expectedText||now.text!==r.review.expectedText||now.identity!==before.identity||now.generation!==before.generation||now.revision!==receipt.afterRevision)throw Error('Multi-text undo readback unverified.');return structuredClone(receipt);}catch(e){throw new SlidesMultiApplyError(e instanceof Error?e.message:'Multi-text undo failed.',e instanceof ReceiptError?'none':'unknown');}finally{this.flight--;}
 }
}
