/** Worker protocol for the Sheets Studio spreadsheet engine (GridCraft headless, isolated WASM). */
export type CellValue={t:'Empty'}|{t:'Number';v:number}|{t:'Text';v:string}|{t:'Bool';v:boolean}|{t:'Error';v:unknown}|{t:'Array';v?:unknown};
export interface SheetMeta{index:number;name:string;visibility:string}
export interface WorkbookInfo{sheets:SheetMeta[];warnings:string[]}
export interface SheetInfo{sheet:number;rows:number;cols:number;canUndo:boolean;canRedo:boolean}
export interface RangeCell{address:string;value:CellValue;formula:string|null}
export interface CellStyle{bold:boolean;italic:boolean;strike:boolean;underline:boolean;color:string|null;fill:string|null;h:'left'|'center'|'right'|'general';wrap:boolean;fmt:string}
export interface ViewCell extends RangeCell{text:string;numeric:boolean;fmtColor:string|null;style:CellStyle}
export interface ViewResult{sheet:number;row:number;col:number;rows:number;cols:number;cells:ViewCell[]}
export interface SheetLayout{sheet:number;defaultColWidth:number;defaultRowHeight:number;cols:{i:number;w:number;hidden:boolean}[];rows:{i:number;h:number;hidden:boolean}[];showGridlines:boolean;merges:{r0:number;c0:number;r1:number;c1:number}[]}
export interface RangeResult{sheet:number;row:number;col:number;rows:number;cols:number;cells:RangeCell[]}
export type SheetsRequest=
 |{id:number;op:'init';wasmUrl:string}
 |{id:number;op:'open';bytes:ArrayBuffer}
 |{id:number;op:'info';sheet:number}
 |{id:number;op:'range';sheet:number;row:number;col:number;rows:number;cols:number}
 |{id:number;op:'view';sheet:number;row:number;col:number;rows:number;cols:number}
 |{id:number;op:'layout';sheet:number}
 |{id:number;op:'set';sheet:number;address:string;input:string}
 |{id:number;op:'undo'}|{id:number;op:'redo'}|{id:number;op:'save'}|{id:number;op:'close'};
export type SheetsResponse=
 |{id:number;ok:true;op:'result';result:unknown;ms:number}
 |{id:number;ok:true;op:'bytes';bytes:ArrayBuffer;ms:number}
 |{id:number;ok:false;error:string};
export const MAX_INPUT_BYTES=32*1024*1024;
export const MAX_CELL_BYTES=32_767;
export const MAX_READ_CELLS=10_000;
