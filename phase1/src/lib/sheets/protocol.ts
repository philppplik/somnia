/** Worker protocol for the Sheets Studio spreadsheet engine (GridCraft headless, isolated WASM). */
export type CellValue={t:'Empty'}|{t:'Number';v:number}|{t:'Text';v:string}|{t:'Bool';v:boolean}|{t:'Error';v:unknown}|{t:'Array';v?:unknown};
export interface SheetMeta{index:number;name:string;visibility:string}
export interface WorkbookInfo{sheets:SheetMeta[];warnings:string[]}
export interface SheetInfo{sheet:number;rows:number;cols:number;canUndo:boolean;canRedo:boolean}
export interface RangeCell{address:string;value:CellValue;formula:string|null}
export interface CellStyle{bold:boolean;italic:boolean;strike:boolean;underline:boolean;color:string|null;fill:string|null;h:'left'|'center'|'right'|'general';wrap:boolean;indent?:number;v?:'top'|'middle'|'bottom';fmt:string;font:string;size:number;borders:{l:BorderSide|null;r:BorderSide|null;t:BorderSide|null;b:BorderSide|null}}
export interface BorderSide{w:number;style:'solid'|'dashed'|'dotted'|'double';color:string}
export interface ViewCell extends RangeCell{text:string;numeric:boolean;fmtColor:string|null;style:CellStyle}
export interface ViewResult{sheet:number;row:number;col:number;rows:number;cols:number;cells:ViewCell[]}
export interface SheetLayout{sheet:number;defaultColWidth:number;defaultRowHeight:number;cols:{i:number;w:number;hidden:boolean}[];rows:{i:number;h:number;hidden:boolean}[];showGridlines:boolean;freeze:{rows:number;cols:number}|null;merges:{r0:number;c0:number;r1:number;c1:number}[]}
export interface RangeResult{sheet:number;row:number;col:number;rows:number;cols:number;cells:RangeCell[]}
/** Typed formatting operations; the Rust bridge keeps the same closed allowlist and re-validates every field. */
export type FormatOp=
 |{kind:'bold'|'italic'|'underline'|'strike';on:boolean}
 |{kind:'fontName';name:string}
 |{kind:'fontSize';size:number}
 |{kind:'fontColor';color:string}
 |{kind:'fillColor';color:string}
 |{kind:'numFmt';preset:NumFmtPreset;decimals?:number;symbol?:string}
 |{kind:'decimals';delta:1|-1;at?:{row:number;col:number}}
 |{kind:'hAlign';align:'left'|'center'|'right'}
 |{kind:'vAlign';align:'top'|'middle'|'bottom'}
 |{kind:'wrap';on:boolean}
 |{kind:'indent';delta:1|-1}
 |{kind:'borders';preset:BorderPreset;style?:BorderLineStyle;color?:string};
export type BorderPreset='none'|'all'|'outside'|'thickOutside'|'inside'|'insideHorizontal'|'insideVertical'|'top'|'bottom'|'left'|'right'|'thickBottom'|'doubleBottom'|'topBottom'|'topThickBottom'|'topDoubleBottom';
export type BorderLineStyle='thin'|'medium'|'thick'|'dashed'|'dotted'|'double'|'hair';
export type NumFmtPreset='general'|'number'|'comma'|'percent'|'currency'|'date'|'time'|'scientific'|'text';
export type SheetOp={kind:'add';name?:string}|{kind:'rename';name:string}|{kind:'duplicate'}|{kind:'delete'}|{kind:'move';to:number};
export type SheetsRequest=
 |{id:number;op:'init';wasmUrl:string}
 |{id:number;op:'open';bytes:ArrayBuffer}
 |{id:number;op:'info';sheet:number}
 |{id:number;op:'range';sheet:number;row:number;col:number;rows:number;cols:number}
 |{id:number;op:'view';sheet:number;row:number;col:number;rows:number;cols:number}
 |{id:number;op:'layout';sheet:number}
 |{id:number;op:'set';sheet:number;address:string;input:string}
 |{id:number;op:'setValues';sheet:number;row:number;col:number;values:string[][]}
 |{id:number;op:'clear';sheet:number;row:number;col:number;rows:number;cols:number}
 |{id:number;op:'format';sheet:number;row:number;col:number;rows:number;cols:number;format:FormatOp}
 |{id:number;op:'sheets'}
 |{id:number;op:'editSheet';sheet:number;line:SheetOp}
 |{id:number;op:'undo'}|{id:number;op:'redo'}|{id:number;op:'save'}|{id:number;op:'close'};
export type SheetsResponse=
 |{id:number;ok:true;op:'result';result:unknown;ms:number}
 |{id:number;ok:true;op:'bytes';bytes:ArrayBuffer;ms:number}
 |{id:number;ok:false;error:string};
export const MAX_INPUT_BYTES=32*1024*1024;
export const MAX_CELL_BYTES=32_767;
export const MAX_READ_CELLS=10_000;
