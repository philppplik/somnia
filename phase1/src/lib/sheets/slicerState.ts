import {useSyncExternalStore} from 'react';
import type {FilterOp,ProtectionInfo} from './protocol';
import type {DistinctValues} from './filterOps';

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

/** Whether the sheet's protection allows changing the AutoFilter ('autofilter' permission). */
export const slicerFilterAllowed=(protection:ProtectionInfo|null|undefined):boolean=>!protection||protection.allow.includes('autofilter');

/**
 * Initial tick state for a freshly loaded value list when the mirror knows a fresh
 * values filter on exactly this column: untick what the filter hides, keep the
 * blanks flag. Returns null when the mirror has nothing honest to offer (unknown,
 * stale, another column or a non-values op) - the list then starts all-ticked.
 */
export function pickedFromMirror(data:DistinctValues,mirror:SlicerFilterMirror,column:number):{off:Set<string>;blanksOn:boolean}|null{
 if(mirror.stale||!mirror.op||mirror.op.kind!=='values'||mirror.op.column!==column)return null;
 const keep=new Set(mirror.op.values);
 return {off:new Set(data.values.filter(v=>!keep.has(v.text)).map(v=>v.text)),blanksOn:mirror.op.blanks};
}
