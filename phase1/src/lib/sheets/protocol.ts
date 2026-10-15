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
export type NegativeStyle='minus'|'red'|'paren'|'redParen';
export type ZeroStyle='show'|'dash';
export type DatePatternId='ymd'|'dmyDot'|'mdy'|'dmy'|'long'|'weekday'|'short'|'monthYear'|'time24'|'time12'|'dateTime';
/** Defined names: the block is the active selection. `delete` acts on the workbook name, or on the active sheet's own name. */
export type NameOp={kind:'define';name:string;scope:'workbook'|'sheet';replace?:boolean}|{kind:'delete';name:string;scope:'workbook'|'sheet'};
export interface NameInfo{name:string;refersTo:string;scope:string;comment:string}
export type FormatOp=
 |{kind:'bold'|'italic'|'underline'|'strike';on:boolean}
 |{kind:'fontName';name:string}
 |{kind:'fontSize';size:number}
 |{kind:'fontColor';color:string}
 |{kind:'fillColor';color:string}
 |{kind:'numFmt';preset:NumFmtPreset;decimals?:number;symbol?:string}
 |{kind:'numFmtCustom';grouping?:boolean;percent?:boolean;decimals?:number;prefix?:string;suffix?:string;negative?:NegativeStyle;zero?:ZeroStyle}
 |{kind:'dateFmt';pattern:DatePatternId}
 |{kind:'decimals';delta:1|-1;at?:{row:number;col:number}}
 |{kind:'hAlign';align:'left'|'center'|'right'}
 |{kind:'vAlign';align:'top'|'middle'|'bottom'}
 |{kind:'wrap';on:boolean}
 |{kind:'indent';delta:1|-1}
 |{kind:'borders';preset:BorderPreset;style?:BorderLineStyle;color?:string};
export type BorderPreset='none'|'all'|'outside'|'thickOutside'|'inside'|'insideHorizontal'|'insideVertical'|'top'|'bottom'|'left'|'right'|'thickBottom'|'doubleBottom'|'topBottom'|'topThickBottom'|'topDoubleBottom';
export type BorderLineStyle='thin'|'medium'|'thick'|'dashed'|'dotted'|'double'|'hair';
export type LineAxis='rows'|'cols';
export type LineEditKind='insertBefore'|'insertAfter'|'delete';
export type LineOp={kind:'size';px:number}|{kind:'autofit'|'hide'|'unhide'};
export type NumFmtPreset='general'|'number'|'comma'|'percent'|'currency'|'date'|'time'|'scientific'|'text';
/** Sort rows of an explicit block; `column` is a 0-based offset inside the block. */
export type SortOp={header:boolean;keys:{column:number;order:'asc'|'desc'}[];matchCase?:boolean};
/** Row filter on one absolute sheet column; the block only creates the filter. */
export type FilterCondition='='|'<>'|'>'|'<'|'>='|'<='|'beginsWith'|'endsWith'|'contains'|'notContains';
export type FilterOp={kind:'custom';column:number;op:FilterCondition;value:string}|{kind:'clear';column:number}|{kind:'clearAll'}|{kind:'off'};
/** Native owner state: revision plus an identity token that changes on every edit, undo, redo and reopen. */
export interface SheetsNativeState{revision:number;token:string}
/** Immutable owner receipt for one reviewed cell edit or its exact undo. `applied` is the logical delta: 1 changed, 0 true no-op. */
export interface SheetsEditReceipt{sheet:number;address:string;beforeRevision:number;afterRevision:number;applied:0|1;undoable:boolean;token:string;readback:{address:string;value:unknown;formula:string|null}}
export type CfStyle='lightRed'|'yellow'|'green'|'redText';
export type CfScale='greenYellowRed'|'redYellowGreen'|'whiteBlue'|'whiteRed';
export type CfOperator='greater'|'less'|'equal'|'notEqual'|'greaterOrEqual'|'lessOrEqual'|'between'|'notBetween';
export type CfFlag='blanks'|'noBlanks'|'errors'|'noErrors'|'duplicate'|'unique'|'aboveAverage'|'belowAverage';
export type CfTextMode='contains'|'notContains'|'beginsWith'|'endsWith';
/** Highlight rules: a closed set of shapes, no formulas. */
export type CfOp={kind:'cell';operator:CfOperator;value:string|number;value2?:string|number;style:CfStyle}|{kind:'text';mode:CfTextMode;text:string;style:CfStyle}|{kind:'flag';flag:CfFlag;style:CfStyle}|{kind:'top';rank:number;bottom:boolean;percent:boolean;style:CfStyle}|{kind:'scale';scale:CfScale}|{kind:'clear'}|{kind:'clearAll'};
/** Data validation: a closed set of shapes, no custom formulas. */
export type ValidationOp={kind:'list';items:string[]}|{kind:'listRange';source:string}|{kind:'number';whole:boolean;operator:CfOperator;value:number;value2?:number}|{kind:'length';operator:CfOperator;value:number;value2?:number}|{kind:'clear'};
/** Find and replace inside the selected block. Literal text, no wildcards. */
export interface ReplaceOp{what:string;with:string;matchCase:boolean;wholeCell:boolean;inFormulas:boolean}
/** Remove duplicate rows (compared on block-relative column offsets) and split one column of text. */
export interface DedupeOp{header:boolean;columns:number[]}
export type SplitDelimiter=','|';'|'\t'|' '|'|';
export type SplitOp={kind:'delimited';delimiters:SplitDelimiter[];treatConsecutive:boolean}|{kind:'fixed';widths:number[]};
/** One note, comment or link on the active cell. Text is 1 to 2000 characters; the Rust bridge re-validates everything. */
export type AnnotateOp={kind:'note'|'comment'|'reply';text:string}|{kind:'resolve';resolved:boolean}|{kind:'remove'}|{kind:'unlink'}|{kind:'link';target:string;text?:string;tooltip?:string};
export interface CellNote{author:string;text:string;threaded:boolean;resolved:boolean;replies:[string,string][]}
export interface CellLink{target:string;tooltip:string|null}
export interface CellAnnotations{note:CellNote|null;link:CellLink|null}
export type FillDirection='down'|'right'|'up'|'left';
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
 |{id:number;op:'resize';sheet:number;axis:LineAxis;first:number;count:number;line:LineOp}
 |{id:number;op:'editLines';sheet:number;axis:LineAxis;first:number;count:number;line:{kind:'insert'|'delete'}}
 |{id:number;op:'freeze';sheet:number;rows:number;cols:number}
 |{id:number;op:'nativeState'}
 |{id:number;op:'setReviewed';sheet:number;address:string;token:string;old:string;input:string}
 |{id:number;op:'undoReviewed';sheet:number;address:string;token:string}
 |{id:number;op:'sheets'}
 |{id:number;op:'validation';sheet:number;row:number;col:number;rows:number;cols:number;validation:ValidationOp}
 |{id:number;op:'validationItems';sheet:number;row:number;col:number}
 |{id:number;op:'replace';sheet:number;row:number;col:number;rows:number;cols:number;replace:ReplaceOp}
 |{id:number;op:'findCount';sheet:number;row:number;col:number;rows:number;cols:number;replace:ReplaceOp}
 |{id:number;op:'dedupe';sheet:number;row:number;col:number;rows:number;cols:number;dedupe:DedupeOp}
 |{id:number;op:'split';sheet:number;row:number;col:number;rows:number;cols:number;split:SplitOp}
 |{id:number;op:'annotate';sheet:number;row:number;col:number;annotate:AnnotateOp}
 |{id:number;op:'annotations';sheet:number;row:number;col:number}
 |{id:number;op:'defineName';sheet:number;row:number;col:number;rows:number;cols:number;name:{name:string;scope:'workbook'|'sheet';replace?:boolean}}
 |{id:number;op:'deleteName';sheet:number;name:{name:string;scope:'workbook'|'sheet'}}
 |{id:number;op:'names'}
 |{id:number;op:'cf';sheet:number;row:number;col:number;rows:number;cols:number;cf:CfOp}
 |{id:number;op:'fill';sheet:number;row:number;col:number;rows:number;cols:number;dir:FillDirection}
 |{id:number;op:'filter';sheet:number;row:number;col:number;rows:number;cols:number;filter:FilterOp}
 |{id:number;op:'sort';sheet:number;row:number;col:number;rows:number;cols:number;sort:SortOp}
 |{id:number;op:'editSheet';sheet:number;line:SheetOp}
 |{id:number;op:'undo'}|{id:number;op:'redo'}|{id:number;op:'save'}|{id:number;op:'close'};
export type SheetsResponse=
 |{id:number;ok:true;op:'result';result:unknown;ms:number}
 |{id:number;ok:true;op:'bytes';bytes:ArrayBuffer;ms:number}
 |{id:number;ok:false;error:string};
export const MAX_INPUT_BYTES=32*1024*1024;
export const MAX_CELL_BYTES=32_767;
export const MAX_READ_CELLS=10_000;
