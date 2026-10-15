/** Worker protocol for the Sheets Studio spreadsheet engine (GridCraft headless, isolated WASM). */
export type CellValue={t:'Empty'}|{t:'Number';v:number}|{t:'Text';v:string}|{t:'Bool';v:boolean}|{t:'Error';v:unknown}|{t:'Array';v?:unknown};
export interface SheetMeta{index:number;name:string;visibility:string}
export interface WorkbookInfo{sheets:SheetMeta[];warnings:string[]}
export interface SheetInfo{sheet:number;rows:number;cols:number;canUndo:boolean;canRedo:boolean}
export interface RangeCell{address:string;value:CellValue;formula:string|null}
export interface CellStyle{bold:boolean;italic:boolean;strike:boolean;underline:boolean;color:string|null;fill:string|null;h:'left'|'center'|'right'|'general';wrap:boolean;indent?:number;v?:'top'|'middle'|'bottom';fmt:string;font:string;size:number;borders:{l:BorderSide|null;r:BorderSide|null;t:BorderSide|null;b:BorderSide|null}}
export interface BorderSide{w:number;style:'solid'|'dashed'|'dotted'|'double';color:string}
export interface ViewCell extends RangeCell{text:string;numeric:boolean;fmtColor:string|null;style:CellStyle;cfBar?:[number,string,boolean]|null;cfIcon?:[string,number]|null}
export interface ViewResult{sheet:number;row:number;col:number;rows:number;cols:number;cells:ViewCell[]}
export interface SheetLayout{sheet:number;defaultColWidth:number;defaultRowHeight:number;cols:{i:number;w:number;hidden:boolean}[];rows:{i:number;h:number;hidden:boolean}[];showGridlines:boolean;zoom?:number;protection?:ProtectionInfo|null;workbookLocked?:boolean;freeze:{rows:number;cols:number}|null;merges:{r0:number;c0:number;r1:number;c1:number}[]}
export interface RangeResult{sheet:number;row:number;col:number;rows:number;cols:number;cells:RangeCell[]}
/** Typed formatting operations; the Rust bridge keeps the same closed allowlist and re-validates every field. */
/** Tables and a small PivotTable. Names come from the sheet's own first row; the Rust bridge re-validates everything. */
export type TableOp={kind:'create';name?:string;style?:string}|{kind:'totals'|'banded';table:string;on:boolean}|{kind:'style';table:string;style:string}|{kind:'rename';table:string;newName:string}|{kind:'convert';table:string};
export interface TableInfo{name:string;range:string;header:boolean;totals:boolean;banded:boolean;style:string}
export interface TablesInfo{tables:TableInfo[];styles:string[]}
export type PivotFunc='sum'|'count'|'average'|'max'|'min';
export type PivotOp={kind:'create';rows:string;columns?:string;values:string;func?:PivotFunc}|{kind:'refresh'};
export interface PivotField{name:string;numeric:boolean}
/** Page setup and file export. Every field is validated again by the Rust bridge. */
export type PaperName='Letter'|'Legal'|'A4'|'A3'|'A5'|'Tabloid'|'Executive';
export interface PageSetupOp{orientation?:'portrait'|'landscape';paper?:PaperName;margins?:'normal'|'wide'|'narrow';scale?:number;fitWidth?:number;fitHeight?:number;centerH?:boolean;centerV?:boolean;gridlines?:boolean;headings?:boolean;header?:string;footer?:string;printArea?:string|null;titleRows?:string|null;titleCols?:string|null}
export interface PageInfo{orientation:'portrait'|'landscape';paper:string;margins:number[];scale:number;fitWidth:number;fitHeight:number;centerH:boolean;centerV:boolean;gridlines:boolean;headings:boolean;header:string;footer:string;printArea:string|null;titleRows:string|null;titleCols:string|null}
/** Sheet protection: the password is write-only, the sheet only reports whether one is set. */
export type ProtectPermission='formatCells'|'formatColumns'|'formatRows'|'insertColumns'|'insertRows'|'deleteColumns'|'deleteRows'|'sort'|'autofilter';
export type ProtectOp={kind:'protect';password?:string;allow?:ProtectPermission[]}|{kind:'unprotect';password?:string}|{kind:'lock';locked:boolean}|{kind:'workbook';on:boolean};
/** What-if analysis. References are plain cells of the current sheet; the bridge re-validates. */
export type WhatIfOp={kind:'goalSeek';set:string;to:number;changing:string}|{kind:'scenarioAdd';name:string;changing:string;values?:(string|number|boolean|null)[];comment?:string;replace?:boolean}|{kind:'scenarioShow';name:string}|{kind:'scenarioDelete';name:string}|{kind:'scenarioSummary';resultCells?:string}|{kind:'dataTable';range:string;rowInput?:string;columnInput?:string};
export interface ScenarioInfo{name:string;changing:string;comment:string;values:string[]}
/** Pictures and shapes. Anchors are in points; the bridge re-validates. */
export type ShapeName='rectangle'|'roundedRectangle'|'ellipse'|'triangle'|'line'|'arrow'|'textBox';
export type ObjectOp={kind:'shape';shape:ShapeName;fill?:string;line?:string;width?:number;height?:number;text?:string}|{kind:'move';object:'image'|'shape';id:number;width?:number;height?:number;here?:boolean}|{kind:'delete';object:'image'|'shape';id:number}|{kind:'place';object:'image'|'shape';id:number;row:number;col:number;dx:number;dy:number;width?:number;height?:number}|{kind:'order';object:'image'|'shape';id:number;to:'front'|'forward'|'backward'|'back'}|{kind:'turn';id:number};
export interface PictureOp{base64:string;alt?:string;width?:number}
interface ObjectBase{id:number;row:number;col:number;dx:number;dy:number;width:number;height:number}
export interface ImageObject extends ObjectBase{mime:string;alt:string;bytes:number}
export interface ShapeObject extends ObjectBase{kind:string;fill:string|null;line:string|null;text:string}
export interface ObjectsInfo{images:ImageObject[];shapes:ShapeObject[]}
export interface ProtectionInfo{password:boolean;allow:ProtectPermission[]}
/** Charts and sparklines. The bridge draws them as primitives (parsed and bounded in chartOps.ts); the Rust side re-validates every operation. */
export type ChartType='column'|'bar'|'line'|'pie'|'doughnut'|'area'|'scatter'|'radar'|'histogram'|'waterfall'|'funnel'|'treemap';
export type ChartLegend='none'|'bottom'|'top'|'left'|'right';
export type ChartOp={kind:'create';type?:ChartType;subtype?:string;title?:string}|{kind:'set';chart:number;type?:ChartType;subtype?:string;title?:string;legend?:ChartLegend;dataLabels?:boolean;gridlines?:boolean;style?:number;xTitle?:string;yTitle?:string;at?:string;width?:number;height?:number}|{kind:'switch'|'delete';chart:number};
export interface SparklineOp{type?:'line'|'column'|'winLoss';markers?:boolean}
export interface ChartInfo{id:number;kind:string;title:string|null;row:number;col:number;dx:number;dy:number;width:number;height:number;legend:string;dataLabels:boolean;gridlines:boolean;style:number;series:number}
type Rgba=[number,number,number,number];type Stroke={c:Rgba;w:number}|null;
export type Prim={t:'rect';x:number;y:number;w:number;h:number;fill:Rgba|null;stroke:Stroke;radius:number}|{t:'line';pts:[number,number][];color:Rgba;width:number;dash:boolean}|{t:'polygon';pts:[number,number][];fill:Rgba;stroke:Stroke}|{t:'wedge';cx:number;cy:number;ro:number;ri:number;a0:number;a1:number;fill:Rgba;stroke:Stroke}|{t:'circle';cx:number;cy:number;r:number;fill:Rgba|null;stroke:Stroke}|{t:'text';x:number;y:number;text:string;size:number;color:Rgba;bold:boolean;align:'start'|'middle'|'end';valign:'hanging'|'central'|'auto';rotation:number};
export interface ChartScene{width:number;height:number;prims:Prim[]}
export interface SparklineScene extends ChartScene{row:number;col:number}
export type ViewOp={zoom:number}|{gridlines:boolean};
export interface ViewOpResult{zoom:number;gridlines:boolean}
export interface ExportOp{format:'pdf'|'csv'|'tsv'|'html';scope:'sheet'|'all'|'selection';fit?:boolean}
export interface ExportResult{format:ExportOp['format'];base64:string;bytes:number;pages:number|null}
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
export type CfBarColor='blue'|'green'|'orange'|'red';
export type CfIconSet='3Arrows'|'3TrafficLights1'|'3Symbols'|'3Flags'|'4Arrows'|'4Rating'|'5Arrows'|'5Rating'|'5Quarters';
export type CfFlag='blanks'|'noBlanks'|'errors'|'noErrors'|'duplicate'|'unique'|'aboveAverage'|'belowAverage';
export type CfTextMode='contains'|'notContains'|'beginsWith'|'endsWith';
/** Highlight rules: a closed set of shapes, no formulas. */
export type CfOp={kind:'cell';operator:CfOperator;value:string|number;value2?:string|number;style:CfStyle}|{kind:'text';mode:CfTextMode;text:string;style:CfStyle}|{kind:'flag';flag:CfFlag;style:CfStyle}|{kind:'top';rank:number;bottom:boolean;percent:boolean;style:CfStyle}|{kind:'scale';scale:CfScale}|{kind:'bar';color:CfBarColor;gradient?:boolean}|{kind:'icons';set:CfIconSet;reverse?:boolean}|{kind:'clear'}|{kind:'clearAll'};
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
 |{id:number;op:'pivotFields';sheet:number;row:number;col:number;rows:number;cols:number}
 |{id:number;op:'pivotCreate';sheet:number;row:number;col:number;rows:number;cols:number;pivot:{rows:string;columns?:string;values:string;func?:PivotFunc}}
 |{id:number;op:'pivotRefresh'}
 |{id:number;op:'tables';sheet:number}
 |{id:number;op:'tableOp';sheet:number;row:number;col:number;rows:number;cols:number;table:TableOp}
 |{id:number;op:'viewOp';sheet:number;view:ViewOp}
 |{id:number;op:'charts';sheet:number}
 |{id:number;op:'chartScene';sheet:number;chart:number}
 |{id:number;op:'sparklines';sheet:number}
 |{id:number;op:'chartOp';sheet:number;row:number;col:number;rows:number;cols:number;chart:ChartOp}
 |{id:number;op:'sparklineOp';sheet:number;row:number;col:number;rows:number;cols:number;sparkline:SparklineOp}
 |{id:number;op:'objects';sheet:number}
 |{id:number;op:'imageData';sheet:number;image:number}
 |{id:number;op:'pictureOp';sheet:number;row:number;col:number;bytes:Uint8Array;alt:string;width:number}
 |{id:number;op:'objectOp';sheet:number;row:number;col:number;object:ObjectOp}
 |{id:number;op:'whatIfOp';sheet:number;whatIf:WhatIfOp}
 |{id:number;op:'scenarios';sheet:number}
 |{id:number;op:'protectOp';sheet:number;row:number;col:number;rows:number;cols:number;protect:ProtectOp}
 |{id:number;op:'pageInfo';sheet:number}
 |{id:number;op:'pageSetup';sheet:number;page:PageSetupOp}
 |{id:number;op:'exportFile';sheet:number;row:number;col:number;rows:number;cols:number;export:ExportOp}
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
