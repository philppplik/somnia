import {writeXlsx} from '../office/xlsx';
import type {Cell} from '../office/xlsx';
import {MAX_TABLE_ROWS,MAX_TABLE_COLS} from '../slides/deckPackage';
/** CA1: Slides table -> Sheets round trip. Pure diff/xlsx parts live here; session wiring in the components. */
export interface TableDiff{edits:{row:number;col:number;text:string}[];skippedRows:number;skippedCols:number}
/** Cell-by-cell diff, bounded to the table's current extent; growth is reported, never silently applied. */
export function diffTableCells(current:readonly (readonly string[])[],next:readonly (readonly string[])[],maxEdits=MAX_TABLE_ROWS*MAX_TABLE_COLS):TableDiff{
 const edits:TableDiff['edits']=[];let skippedRows=0,skippedCols=0;
 for(let r=0;r<next.length;r++){
  if(r>=current.length){if(next[r].some(c=>String(c??'')!==''))skippedRows++;continue;}
  for(let c=0;c<next[r].length;c++){
   if(c>=current[r].length){if(String(next[r][c]??'')!=='')skippedCols++;continue;}
   const text=String(next[r][c]??'');
   if(text!==current[r][c]&&edits.length<maxEdits)edits.push({row:r,col:c,text});
  }
 }
 return{edits,skippedRows,skippedCols};
}
/** Serializes table cells as a one-sheet workbook with the header row bolded via inline strings. */
export function tableToXlsx(cells:readonly (readonly string[])[],sheetName:string):Uint8Array{
 const rows:Cell[][]=cells.map(row=>row.map(text=>/^-?\d+(\.\d+)?$/.test(text.trim())&&text.trim()!==''?Number(text):text));
 return writeXlsx([{name:sheetName.slice(0,31)||'Table 1',rows}]);
}