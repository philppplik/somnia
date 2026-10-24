import {assertNativeAction,assertNativeReceipt,type NativeActionContract,type NativeActionReceipt,type NativeRunLedger} from './nativeRun';import type {DocumentRef} from './documentCore';import type {ReceiptSummary} from './receiptSummary';
/** Host integration only, not a model tool. The pinnedReview is the host pre-action reference, not post-commit current revision. Carries validated receipt metadata into the active run ledger. */
export function recordReviewedReceipt(ledger:NativeRunLedger,runId:string,action:NativeActionContract,reviewId:string,pinnedReview:DocumentRef,summary:ReceiptSummary,kind:'apply'|'undo'='apply'):NativeActionReceipt{
 assertNativeAction(action,pinnedReview,reviewId);if(action.effect!=='edit')throw Error('Reviewed mutation receipt requires edit action.');
 if(!['apply','undo'].includes(kind))throw Error('Invalid reviewed receipt kind.');
 const receipt:NativeActionReceipt={actionId:action.id,target:{...action.target},outcome:summary.outcome,undoEntries:summary.history==='unverified'?null:summary.history,readback:summary.readback};assertNativeReceipt(action,receipt);
 // Unknown evidence stays visible as unreconciled, never an applied or failure0 row.
 const phase=receipt.outcome==='applied'?(kind==='undo'?'undone':'applied'):receipt.outcome==='failed'?'tool-failed':'tool-completed';
 ledger.record(runId,{phase,target:action.target,proposalId:reviewId,history:summary.history,readback:summary.readback});return receipt;
}
