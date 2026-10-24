import type {ReviewedReceipt} from '../animation/reviewedCommit';import type {EditReceipt} from '../documents/session';import type {DeckReceipt} from '../slides/deckReceipt';
/** Metadata only. Does not retain text, values, origins, native tokens or document bytes. */
export interface ReceiptSummary{outcome:'applied'|'noop'|'failed'|'unknown';history:0|1|'unverified';readback:'verified'|'unverified';undoAvailable:boolean;postCommitWarning:boolean;}
const unknown=(warning=false):ReceiptSummary=>({outcome:'unknown',history:'unverified',readback:'unverified',undoAvailable:false,postCommitWarning:warning});
export function summarizeKeyReceipt(r:ReviewedReceipt):ReceiptSummary{const warning=r.postCommitErrors>0;if(r.applied===null)return unknown(warning);if(r.applied!==0&&r.applied!==1)return unknown(warning);return {outcome:r.applied===1?'applied':'noop',history:r.applied,readback:'verified',undoAvailable:r.kind==='apply'&&r.applied===1,postCommitWarning:warning};}
export function summarizeDocumentReceipt(r:EditReceipt):ReceiptSummary{const warning=r.postCommitErrors>0;if(r.applied===null||r.text!==r.afterText||r.rev!==r.afterRev)return unknown(warning);if(r.applied!==0&&r.applied!==1)return unknown(warning);return {outcome:r.applied===1?'applied':'noop',history:r.applied,readback:'verified',undoAvailable:r.kind==='apply'&&r.applied===1&&r.undoable,postCommitWarning:warning};}
/** Undo readbackMatches is null in native DeckReceipt; caller must prove exact prior deck privately. */
export function summarizeDeckReceipt(r:DeckReceipt,kind:'apply'|'undo',undoReadbackVerified=false):ReceiptSummary{
 const warning=!!r.notifyError;if(r.status==='unknown')return unknown(warning);if(r.status==='precommit'&&r.historyDelta===0)return {outcome:'failed',history:0,readback:'unverified',undoAvailable:false,postCommitWarning:warning};
 const verified=r.readback!==null&&(kind==='apply'?r.readbackMatches===true:undoReadbackVerified);
 if(r.status==='noop'&&r.historyDelta===0&&verified)return {outcome:'noop',history:0,readback:'verified',undoAvailable:false,postCommitWarning:warning};
 if(r.status!=='applied'||r.historyDelta!==1||!verified||r.afterRevision===null)return unknown(warning);
 return {outcome:'applied',history:1,readback:'verified',undoAvailable:kind==='apply'&&r.undoable&&!!r.token,postCommitWarning:warning};
}
/** Only native proven nonmutation=false can map to failed0. Unknown errors stay unknown. */
export function summarizeMutationFailure(mutated:boolean|null|undefined):ReceiptSummary{return mutated===false?{outcome:'failed',history:0,readback:'unverified',undoAvailable:false,postCommitWarning:false}:unknown();}
