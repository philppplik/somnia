import {applyReviewedCell,SheetsApplyError,type SheetsCellProposal,type SheetsCellHost,type SheetsCellExecutor} from './sheetsCellPort';
import {parseEditReceipt} from '../sheets/receipt';import type {SheetsEditReceipt} from '../sheets/protocol';
export interface SheetsReviewedEngine extends SheetsCellExecutor{undoReviewed(sheet:number,address:string,token:string):Promise<SheetsEditReceipt>}
/** Private one-use capabilities. UI/model only receives a public id and preview text. */
export class SheetsReviewedTransactions{
 private generation=0;private inFlight=0;
 get busy(){return this.inFlight>0;}
 private reviews=new Map<string,{proposal:SheetsCellProposal;host:SheetsCellHost;engine:SheetsReviewedEngine}>();private receipts=new Map<string,{proposal:SheetsCellProposal;engine:SheetsReviewedEngine;receipt:SheetsEditReceipt}>();
 stage(id:string,proposal:SheetsCellProposal,host:SheetsCellHost,engine:SheetsReviewedEngine){if(this.reviews.has(id)||this.receipts.has(id))throw Error('Duplicate Sheets review.');this.reviews.set(id,{proposal:structuredClone(proposal),host,engine});}
 reject(id:string){return this.reviews.delete(id);}
 get pending(){return this.reviews.size>0;}
 has(id:string){return this.reviews.has(id)||this.receipts.has(id);}
 async accept(id:string,signal:AbortSignal){const r=this.reviews.get(id);if(!r)throw Error('Sheets review is no longer pending.');const generation=this.generation;this.reviews.delete(id);this.inFlight++;let result;try{result=await applyReviewedCell(r.proposal,r.host,r.engine,signal);}finally{this.inFlight--;}const receipt=parseEditReceipt(result.receipt);if(generation!==this.generation)throw new SheetsApplyError('Review session changed after native entry.','unknown');if(receipt.applied!==1||!receipt.undoable||receipt.afterRevision<=receipt.beforeRevision)throw new SheetsApplyError('Sheets receipt did not prove one undoable edit.','unknown');this.receipts.set(id,{...r,receipt:structuredClone(receipt)});return structuredClone(receipt);}
 async undo(id:string,signal:AbortSignal,authorize:()=>void){const r=this.receipts.get(id);if(!r)throw Error('No owned Sheets receipt.');signal.throwIfAborted();authorize();signal.throwIfAborted();this.receipts.delete(id);let result:SheetsEditReceipt;this.inFlight++;try{result=parseEditReceipt(await r.engine.undoReviewed(r.proposal.target.sheet,r.proposal.target.address,r.receipt.token));}catch(e){throw new SheetsApplyError(e instanceof Error?e.message:'Undo failed.','unknown');}finally{this.inFlight--;}const n=r.proposal.before.native;if(result.sheet!==r.proposal.target.sheet||result.address!==r.proposal.target.address||result.readback.address!==result.address||result.applied!==1||result.undoable||!n||JSON.stringify(result.readback.value)!==JSON.stringify(n.value)||result.readback.formula!==n.formula)throw new SheetsApplyError('Undo readback unverified.','unknown');return structuredClone(result);}
 clear(){this.generation++;this.reviews.clear();this.receipts.clear();}
}
