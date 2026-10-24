import {addressOf} from '../sheets/format';
import {parseNativeState,parseRangeReceipt} from '../sheets/receipt';
import type {SheetsRangeReceipt,SheetsNativeState,ViewResult,RangeResult} from '../sheets/protocol';
import {reviewLiveSheetSelection,type SheetReviewEngine} from '../sheets/liveSelectionReview';
import type {SheetsRangeTarget,SheetsRangeProposal,SheetsRangeHost} from './sheetsRangePort';
import {SheetsApplyError} from './sheetsCellPort';
export interface RangeEngine extends SheetReviewEngine {
 nativeState():Promise<SheetsNativeState>;range(sheet:number,row:number,col:number,rows:number,cols:number):Promise<RangeResult>;
 setRangeReviewed(sheet:number,row:number,col:number,rows:number,cols:number,token:string,old:{address:string;value:unknown;formula:string|null}[],inputs:string[]):Promise<SheetsRangeReceipt>;
 undoRangeReviewed(sheet:number,row:number,col:number,rows:number,cols:number,token:string):Promise<SheetsRangeReceipt>;
}
export interface RangeNative {token:string;revision:number;cells:{address:string;value:unknown;formula:string|null}[]}
const eq=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const coords=(t:SheetsRangeTarget)=>[t.sheet,t.range.r0,t.range.c0,t.range.r1-t.range.r0+1,t.range.c1-t.range.c0+1] as const;
/** Exact raw owner cells remain private. Displayed values are the only model context. */
export async function snapshotNativeRange(engine:RangeEngine,target:SheetsRangeTarget,current:()=>SheetsRangeTarget,signal:AbortSignal){
 const pinned=structuredClone(target),check=()=>{signal.throwIfAborted();if(engine.isDisposed||engine.hasPendingMutation||engine.selectionReadEpoch!==pinned.workerEpoch||!eq(current(),pinned))throw Error('Workbook or range changed.');};check();
 const before=parseNativeState(await engine.nativeState());check();let view:ViewResult|undefined;
 const reader:SheetReviewEngine={get isDisposed(){return engine.isDisposed;},get hasPendingMutation(){return engine.hasPendingMutation;},get selectionReadEpoch(){return engine.selectionReadEpoch;},layout:s=>engine.layout(s),view:async(...args)=>{view=await engine.view(...args);return view;}};
 const scope=JSON.stringify(pinned);const result=await reviewLiveSheetSelection(reader,pinned.document.path,pinned.sheet,pinned.range,scope,()=>({engine:reader,scope:JSON.stringify(current())}),signal);check();
 const after=parseNativeState(await engine.nativeState());check();if(!eq(before,after)||!view||view.cells.some((c,i)=>c.address!==addressOf(pinned.range.r0+Math.floor(i/(pinned.range.c1-pinned.range.c0+1)),pinned.range.c0+i%(pinned.range.c1-pinned.range.c0+1))||c.formula!==null&&typeof c.formula!=='string'))throw Error('Native workbook changed.');
 return {target:pinned,rows:result.rows,native:{...before,cells:view.cells.map(c=>({address:c.address,value:structuredClone(c.value),formula:c.formula}))}};
}
interface Review {proposal:SheetsRangeProposal;native:RangeNative;host:SheetsRangeHost;engine:RangeEngine;snapshot(signal:AbortSignal):Promise<{native:RangeNative}>}
/** Private one-use acceptance and undo, never an execute tool. */
export class SheetsRangeTransactions {
 private generation=0;private flight=0;private reviews=new Map<string,Review>();private receipts=new Map<string,Review&{receipt:SheetsRangeReceipt}>();
 get pending(){return this.reviews.size>0;}get busy(){return this.flight>0;}has(id:string){return this.reviews.has(id)||this.receipts.has(id);}
 stage(id:string,r:Review){if(this.has(id))throw Error('Duplicate range review.');this.reviews.set(id,{...r,proposal:structuredClone(r.proposal),native:structuredClone(r.native)});}
 reject(id:string){return this.reviews.delete(id);}revokePending(){this.generation++;this.reviews.clear();}clear(){this.generation++;this.reviews.clear();this.receipts.clear();}
 async accept(id:string,signal:AbortSignal){
  const r=this.reviews.get(id);if(!r)throw Error('Range review is no longer pending.');this.reviews.delete(id);const gen=this.generation;this.flight++;
  let entered=false;
  try{
   r.host.permission('apply');signal.throwIfAborted();if(!eq(r.host.current(),r.proposal.target))throw Error('Selected range changed.');
   const fresh=await r.snapshot(signal);if(gen!==this.generation)throw Error('Review session changed before native entry.');if(!eq(fresh.native,r.native))throw Error('Native range changed since review.');
   r.host.permission('apply');signal.throwIfAborted();if(!eq(r.host.current(),r.proposal.target))throw Error('Selected range changed.');
   entered=true;const receipt=parseRangeReceipt(await r.engine.setRangeReviewed(...coords(r.proposal.target),r.native.token,r.native.cells,r.proposal.values.flat()));
   this.match(receipt,r.proposal.target);if(receipt.applied!==1||!receipt.undoable||receipt.beforeRevision!==r.native.revision||receipt.afterRevision!==receipt.beforeRevision+1)throw Error('Range receipt did not prove one undoable edit.');
   await this.verify(r.engine,r.proposal.target,receipt);if(gen!==this.generation)throw Error('Review session changed after native entry.');this.receipts.set(id,{...r,receipt});return structuredClone(receipt);
  }catch(e){throw new SheetsApplyError(e instanceof Error?e.message:'Range apply failed.',entered&&!(e instanceof Error&&e.message.startsWith('stale'))?'unknown':'none');}finally{this.flight--;}
 }
 async undo(id:string,signal:AbortSignal,authorize:()=>void){
  const r=this.receipts.get(id);if(!r)throw Error('No owned range receipt.');const gen=this.generation;authorize();signal.throwIfAborted();this.receipts.delete(id);this.flight++;
  try{const receipt=parseRangeReceipt(await r.engine.undoRangeReviewed(...coords(r.proposal.target),r.receipt.token));this.match(receipt,r.proposal.target);if(receipt.applied!==1||receipt.undoable||receipt.beforeRevision!==r.receipt.afterRevision||!eq(receipt.readback,r.native.cells))throw Error('Range undo readback unverified.');await this.verify(r.engine,r.proposal.target,receipt);if(gen!==this.generation)throw Error('Review session changed after native undo entry.');return structuredClone(receipt);}catch(e){throw new SheetsApplyError(e instanceof Error?e.message:'Range undo failed.','unknown');}finally{this.flight--;}
 }
 private match(r:SheetsRangeReceipt,t:SheetsRangeTarget){if(!eq([r.sheet,r.row,r.col,r.rows,r.cols],coords(t)))throw Error('Wrong range receipt.');}
 private async verify(engine:RangeEngine,target:SheetsRangeTarget,receipt:SheetsRangeReceipt){
  const epoch=engine.selectionReadEpoch;const before=parseNativeState(await engine.nativeState()),actual=await engine.range(...coords(target)),after=parseNativeState(await engine.nativeState());
  if(engine.isDisposed||engine.hasPendingMutation||engine.selectionReadEpoch!==epoch||!eq(before,after)||after.token!==receipt.token||after.revision!==receipt.afterRevision||!eq([actual.sheet,actual.row,actual.col,actual.rows,actual.cols],coords(target))||!eq(actual.cells,receipt.readback))throw Error('Native range receipt readback unverified.');
 }
}
