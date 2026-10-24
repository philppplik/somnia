import type {ReviewedReceipt} from '../animation/reviewedCommit';
import type {AnimationKeyProposal,createAnimationKeyPort} from './animationKeyPort';

type AnimationPort=ReturnType<typeof createAnimationKeyPort>;
interface PendingReview{proposal:AnimationKeyProposal;port:AnimationPort;origin:string}
interface OwnedReceipt{receipt:ReviewedReceipt;port:AnimationPort}

/** One-use UI review ids for the Animation selected-key port. The port retains the exact native review and receipt identities privately. */
export class AnimationKeyTransactions{
 private pending=new Map<string,PendingReview>();private owned=new Map<string,OwnedReceipt>();private generation=0;private inFlight=0;
 get busy(){return this.inFlight>0;}
 get hasPending(){return this.pending.size>0;}
 has(id:string){return this.pending.has(id)||this.owned.has(id);}
 stage(id:string,review:PendingReview){if(this.has(id))throw Error('Duplicate animation review.');this.pending.set(id,review);}
 /** Dismiss a staged preview. The port capability is revoked, so the dismissed review can never be accepted later. */
 reject(id:string):boolean{const r=this.pending.get(id);if(!r)return false;this.pending.delete(id);r.port.revokeReviewed(r.proposal);return true;}
 async accept(id:string,signal:AbortSignal):Promise<void>{
  const r=this.pending.get(id);if(!r)throw Error('Animation preview is no longer pending.');
  const generation=this.generation;this.pending.delete(id);this.inFlight++;
  try{
   const receipt=r.port.acceptReviewed(r.proposal,r.proposal.reviewId!,structuredClone(r.proposal.after),r.origin,signal);
   if(generation!==this.generation)throw Error('Review session changed. Inspect the animation before retrying.');
   if(receipt.applied!==1)throw Error(receipt.applied===0?'Animation key was already at that value. Inspect the animation before retrying.':'Animation apply outcome is unknown. Inspect the animation before retrying.');
   this.owned.set(id,{receipt,port:r.port});
  }finally{this.inFlight--;}
 }
 async undo(id:string,signal:AbortSignal):Promise<void>{
  const r=this.owned.get(id);if(!r)throw Error('No owned animation receipt.');
  this.owned.delete(id);this.inFlight++;
  try{const receipt=r.port.undoReviewed(r.receipt,signal);if(receipt.applied!==1)throw Error('Animation undo outcome is unknown. Inspect the animation before retrying.');}
  finally{this.inFlight--;}
 }
 clear(){this.generation++;for(const id of this.pending.keys())this.reject(id);this.owned.clear();}
 revokePending(){for(const id of this.pending.keys())this.reject(id);}
}
