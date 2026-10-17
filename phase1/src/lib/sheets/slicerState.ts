import {useSyncExternalStore} from 'react';
import type {FilterOp} from './protocol';

/** One range the filter op was applied to (the selection that created or refreshed it). */
export interface SlicerFilterRange{r0:number;c0:number;r1:number;c1:number}
export interface SlicerFilterMirror{
 /** The op this session applied for the sheet's AutoFilter; null once cleared here. */
 op:FilterOp|null;
 /** Range the op was applied to. */
 range:SlicerFilterRange|null;
 /** True after undo/redo: the stored op is only the last known state, not proof. */
 stale:boolean;
}

/**
 * TS-side mirror of the column filter applied through the Sheets canvas. The engine
 * has no filter readback op, so this mirror is the only honest readback: every panel,
 * command and input path routes through SheetsCanvas.applyFilter, which records the
 * op here after the engine accepts it. Undo/redo cannot be attributed to a specific
 * op without engine support, so any history jump marks the file's records stale
 * instead of letting the slicer show a possibly wrong state. A missing record means
 * "unknown", never "no filter": a file can carry an AutoFilter from Excel.
 */
const records=new Map<string,SlicerFilterMirror>();
const listeners=new Set<()=>void>();
/** Bound: at most this many (file, sheet) records; the oldest is evicted. */
export const MAX_SLICER_RECORDS=64;
const key=(file:string,sheet:number)=>file+' '+sheet;
const emit=()=>{for(const l of listeners)l();};

/** Records a filter op after the engine accepted it (one undo step in the canvas). */
export function noteFilterApplied(file:string,sheet:number,range:SlicerFilterRange,op:FilterOp){
 const k=key(file,sheet);
 if(op.kind==='clearAll'||op.kind==='off')records.set(k,{op:null,range:null,stale:false});
 else if(op.kind==='clear'){
  const cur=records.get(k);
  // Single-column criteria: clearing a column that holds no known criterion changes nothing we know.
  if(!(cur?.op&&'column' in cur.op&&cur.op.column===op.column))return;
  records.set(k,{op:null,range:cur.range,stale:false});
 }
 else records.set(k,{op,range,stale:false});
 while(records.size>MAX_SLICER_RECORDS){const oldest=records.keys().next().value;if(oldest===undefined)break;records.delete(oldest);}
 emit();
}
/** Undo/redo changes the filter without a filter op: every record of the file becomes last-known-only. */
export function noteFilterHistory(file:string){
 let touched=false;
 for(const [k,v] of records)if(k.startsWith(file+' ')){records.set(k,{...v,stale:true});touched=true;}
 if(touched)emit();
}
/** Drops all records of a file; the canvas calls this when a fresh engine opens the file. */
export function resetSlicerFilter(file:string){
 let touched=false;
 for(const k of [...records.keys()])if(k.startsWith(file+' ')){records.delete(k);touched=true;}
 if(touched)emit();
}
export const getSlicerFilter=(file:string,sheet:number):SlicerFilterMirror|null=>records.get(key(file,sheet))??null;
export function subscribeSlicer(listener:()=>void):()=>void{listeners.add(listener);return()=>{listeners.delete(listener);};}
/** Current known filter of one sheet; null means unknown, not "no filter". */
export function useSlicerFilter(file:string|undefined,sheet:number|undefined):SlicerFilterMirror|null{
 const snap=()=>file!==undefined&&sheet!==undefined?getSlicerFilter(file,sheet):null;
 return useSyncExternalStore(subscribeSlicer,snap,snap);
}
