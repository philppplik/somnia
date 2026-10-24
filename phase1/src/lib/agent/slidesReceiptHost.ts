import {getDeckSession,getSlideSummaryOwner,applyDeckReviewed,applyDeckReviewedSlide,undoDeckReceipt} from '../slides/session';import type {SlidesTextHost} from './slidesTextPort';
/** Explicit host opt-in. Caller still owns exact preview permissions, selection and current DocumentRef. */
export function slidesNativeExecution(name:string,permission:NonNullable<SlidesTextHost['execution']>['permission']):NonNullable<SlidesTextHost['execution']>{return {permission,snapshot:()=>{const d=getDeckSession(name),o=getSlideSummaryOwner();if(!d||o.source!==d.identity||o.revision!==d.revision)throw Error('Active native deck unavailable.');return {text:d.text,identity:d.identity,revision:o.revision,generation:o.generation};},apply:(review,origin)=>applyDeckReviewed(name,review,origin),undo:receipt=>undoDeckReceipt(name,receipt)};}

/** Separate same-slide multi-run owner. Never changes the single-run execution path. */
export function slidesMultiNativeExecution(name:string){
 const single=slidesNativeExecution(name,()=>{});
 return {snapshot:single.snapshot,apply:(review:import('../slides/deckReceipt').ReviewedApply,origin:string)=>applyDeckReviewedSlide(name,review,origin),undo:single.undo};
}
