import type {AnimationDocument,PropValue,TransformKey} from './model';
/** Reviewed synchronous key edit: request, receipt and typed refusal. Types only, so it stays a leaf. */
export interface ReviewedKeyRequest{
 /** Immutable document object the review was shown for (identity, not just id/revision). */
 doc:AnimationDocument;layer:string;prop:TransformKey;t:number;
 /** Exact current key value the reviewer saw. */
 expected:PropValue;value:PropValue;origin:string}
export interface ReviewedReceipt{
 origin:string;kind:'apply'|'undo';docId:string;layer:string;prop:TransformKey;t:number;
 beforeRevision:number;afterRevision:number;before:PropValue;after:PropValue;
 /** Logical history entries applied: 1 changed, 0 no-op, null when readback could not prove the state. */
 applied:0|1|null;
 /** Errors thrown by listeners or recovery after the commit; the mutation still stands. */
 postCommitErrors:number}
export type ReviewedCode='no-document'|'preview-active'|'stale-document'|'bad-target'|'locked'|'stale-value'|'invalid'|'stale-history';
/** Every ReviewedError is a proven pre-commit refusal: nothing changed. */
export class ReviewedError extends Error{readonly mutated=false as const;constructor(readonly code:ReviewedCode,message:string){super(message);}}
export const sameValue=(a:PropValue,b:PropValue)=>JSON.stringify(a)===JSON.stringify(b);
