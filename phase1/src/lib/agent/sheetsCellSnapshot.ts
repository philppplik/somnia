import {reviewLiveSheetSelection,type SheetReviewEngine} from '../sheets/liveSelectionReview';
import {parseAddress} from '../sheets/format';
import {parseNativeState} from '../sheets/receipt';
import type {SheetsNativeState,ViewResult} from '../sheets/protocol';
import type {SheetsCellSnapshot,SheetsCellTarget} from './sheetsCellPort';
export interface SheetsSnapshotEngine extends SheetReviewEngine{nativeState():Promise<SheetsNativeState>}
/** Host supplies the approved target/session. Never discovers a workbook from model arguments. */
export async function snapshotNativeSheetsCell(engine:SheetsSnapshotEngine,target:SheetsCellTarget,current:()=>{engine:SheetsSnapshotEngine|null;target:SheetsCellTarget},signal:AbortSignal):Promise<SheetsCellSnapshot>{
 const pinned=structuredClone(target),scope=JSON.stringify(pinned),epoch=engine.selectionReadEpoch,cell=parseAddress(pinned.address);
 const check=()=>{signal.throwIfAborted();const now=current();if(engine.isDisposed||engine.hasPendingMutation||epoch!==engine.selectionReadEpoch||now.engine!==engine||JSON.stringify(now.target)!==scope)throw Error('Workbook or selection changed');};
 check();if(!cell||epoch!==pinned.workerEpoch)throw Error('Selected-cell worker epoch changed');
 const before=parseNativeState(await engine.nativeState());check();let view:ViewResult|undefined;
 // Reuse bounded hidden/merged/range/epoch validation. Raw owner cell stays host-private.
 const reader:SheetReviewEngine={get isDisposed(){return engine.isDisposed;},get hasPendingMutation(){return engine.hasPendingMutation;},get selectionReadEpoch(){return engine.selectionReadEpoch;},layout:s=>engine.layout(s),view:async(...args)=>{view=await engine.view(...args);return view;}};
 await reviewLiveSheetSelection(reader,pinned.document.path,pinned.sheet,{r0:cell.row,r1:cell.row,c0:cell.col,c1:cell.col},scope,()=>{const now=current();return {engine:now.engine===engine?reader:null,scope:JSON.stringify(now.target)};},signal);check();
 const after=parseNativeState(await engine.nativeState());check();if(before.token!==after.token||before.revision!==after.revision)throw Error('Workbook changed during native cell read');
 const raw=view?.cells[0];if(!raw||raw.address!==pinned.address||typeof raw.text!=='string'||raw.formula!==null&&typeof raw.formula!=='string')throw Error('Invalid native cell snapshot');
 return structuredClone({target:pinned,displayText:raw.text,formula:raw.formula,native:{token:before.token,value:raw.value,formula:raw.formula}});
}
/** Attach to an existing permission/review host. The captured session must remain the same throughout the read. */
export function nativeSheetsSnapshot(engine:SheetsSnapshotEngine,current:()=>{engine:SheetsSnapshotEngine|null;target:SheetsCellTarget}){
 return (signal:AbortSignal)=>snapshotNativeSheetsCell(engine,current().target,current,signal);
}
