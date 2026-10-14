/** Typed RPC between the main thread and the Documents worker. Bytes move by transfer. */
export interface PageSize{width:number;height:number}
export interface OpenedDocument{pages:number;pageSizes:PageSize[];text:string;cacheHits:number;cacheMisses:number;openMs:number;layoutMs:number}
export interface HitResult{block:number|null;off?:number;editable:boolean}
export interface CaretBox{page:number;x:number;top:number;height:number}
export type Tri='on'|'off'|'mixed';
/** Effective bold/italic/underline over a selection (style and direct formatting). */
export interface FormatState{bold:Tri;italic:Tri;underline:Tri;/** Shared value over the selection, or null when it mixes values. */font?:string|null;size?:number|null;/** `RRGGBB`, `auto`, or null when mixed. */color?:string|null}
export interface FormatPatch{bold?:boolean;italic?:boolean;underline?:boolean;font?:string;size?:number;color?:string}
export const MIN_FONT_PT=1,MAX_FONT_PT=400,MAX_FONT_NAME=64;
/** Selection endpoints: top-level paragraph index and UTF-8 byte offset. */
export interface DocPos{block:number;off:number}
export const MAX_FORMAT_BLOCKS=2000;
const FLAG_KEYS=['bold','italic','underline'];
/** Validates a format patch: flags are booleans, font is short printable text, size is 1-400 pt, color is auto or RRGGBB. */
export function checkFormatPatch(patch:unknown){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Format change is not valid.');
 const o=patch as Record<string,unknown>;const keys=Object.keys(o);if(!keys.length)throw new Error('Format change is not valid.');
 for(const k of keys){const v=o[k];
  if(FLAG_KEYS.includes(k)){if(typeof v!=='boolean')throw new Error('Format change is not valid.');}
  else if(k==='font'){if(typeof v!=='string'||!v||[...v].length>MAX_FONT_NAME||/[\u0000-\u001f\u007f]/.test(v))throw new Error('Font name is not valid.');}
  else if(k==='size'){if(typeof v!=='number'||!Number.isFinite(v)||v<MIN_FONT_PT||v>MAX_FONT_PT)throw new Error(`Font size must be between ${MIN_FONT_PT} and ${MAX_FONT_PT} pt.`);}
  else if(k==='color'){if(typeof v!=='string'||!(v==='auto'||/^[0-9a-fA-F]{6}$/.test(v)))throw new Error('Colour must be automatic or six hex digits.');}
  else throw new Error('Format change is not valid.');
 }
}
export type ParaAlign='left'|'center'|'right'|'justify';
/** Whole-paragraph formatting in points; line spacing is a multiple of single. */
export interface ParaPatch{align?:ParaAlign;indentLeft?:number;indentFirst?:number;spaceBefore?:number;spaceAfter?:number;lineSpacing?:number}
/** Shared effective value over the paragraphs, or null when they differ (line spacing: also null for exact/at-least heights). */
export interface ParaState{align:ParaAlign|null;indentLeft:number|null;indentFirst:number|null;spaceBefore:number|null;spaceAfter:number|null;lineSpacing:number|null;/** Paragraph style id (`Normal`, `Heading2`, ...) when shared. */style?:string|null;list?:'none'|'bullet'|'numbered'|null;listLevel?:number|null}
const PARA_RANGES:Record<string,[number,number]>={indentLeft:[0,1440],indentFirst:[-1440,1440],spaceBefore:[0,1584],spaceAfter:[0,1584],lineSpacing:[0.5,10]};
export function checkParaPatch(patch:unknown){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Paragraph change is not valid.');
 const o=patch as Record<string,unknown>;const keys=Object.keys(o);if(!keys.length)throw new Error('Paragraph change is not valid.');
 for(const k of keys){const v=o[k];
  if(k==='align'){if(v!=='left'&&v!=='center'&&v!=='right'&&v!=='justify')throw new Error('Alignment is not valid.');}
  else if(PARA_RANGES[k]){const [lo,hi]=PARA_RANGES[k];if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)throw new Error(`${k} must be between ${lo} and ${hi}.`);}
  else throw new Error('Paragraph change is not valid.');
 }
}
export const DOC_STYLES=['Normal','Title','Subtitle','Heading1','Heading2','Heading3','Heading4','Quote'] as const;
export type DocStyleId=typeof DOC_STYLES[number];
export type ListKindId='bullet'|'numbered'|'none';
export type Rect5=[number,number,number,number,number];
export type DocumentsRequest=
 |{id:number;kind:'init';wasmUrl:string}
 |{id:number;kind:'open';bytes:ArrayBuffer}
 |{id:number;kind:'render';page:number;scale:number}
 |{id:number;kind:'insert';block:number;utf8Offset:number;text:string}
 |{id:number;kind:'blocks'}
 |{id:number;kind:'replace';block:number;hunks:import('./edit').Hunk[]}
 |{id:number;kind:'hit';page:number;x:number;y:number}
 |{id:number;kind:'caret';block:number;off:number}
 |{id:number;kind:'rects';block:number;a:number;b:number}
 |{id:number;kind:'split';block:number;off:number}
 |{id:number;kind:'merge';block:number}
 |{id:number;kind:'snapshot'}
 |{id:number;kind:'restore';snap:number}
 |{id:number;kind:'format';start:DocPos;end:DocPos;patch:FormatPatch}
 |{id:number;kind:'formatState';start:DocPos;end:DocPos}
 |{id:number;kind:'paraFormat';first:number;last:number;patch:ParaPatch}
 |{id:number;kind:'paraState';first:number;last:number}
 |{id:number;kind:'paraStyle';first:number;last:number;style:DocStyleId}
 |{id:number;kind:'setList';first:number;last:number;list:ListKindId}
 |{id:number;kind:'listLevel';first:number;last:number;delta:number}
 |{id:number;kind:'tableEdit';block:number;op:TableOp}
 |{id:number;kind:'headerFooterState'}
 |{id:number;kind:'setHeaderFooter';header?:string;footer?:string;pageNumber?:boolean}
 |{id:number;kind:'insertTable';block:number;rows:number;cols:number}
 |{id:number;kind:'save'}
 |{id:number;kind:'close'};
export type DocumentsResponse=
 |{id:number;ok:true;kind:'ready';initMs:number}
 |{id:number;ok:true;kind:'opened';document:OpenedDocument}
 |{id:number;ok:true;kind:'rendered';png:ArrayBuffer;renderMs:number}
 |{id:number;ok:true;kind:'edited';document:OpenedDocument}
 |{id:number;ok:true;kind:'blocks';blocks:import('./edit').DocBlock[]}
 |{id:number;ok:true;kind:'headerFooter';state:HeaderFooterState}
 |{id:number;ok:true;kind:'hit';hit:HitResult|null}
 |{id:number;ok:true;kind:'caret';caret:CaretBox|null}
 |{id:number;ok:true;kind:'rects';rects:Rect5[]}
 |{id:number;ok:true;kind:'snapshot';snap:number}
 |{id:number;ok:true;kind:'formatState';state:FormatState}
 |{id:number;ok:true;kind:'paraState';state:ParaState}
 |{id:number;ok:true;kind:'saved';bytes:ArrayBuffer;saveMs:number}
 |{id:number;ok:true;kind:'closed'}
 |{id:number;ok:false;error:string};
export const MAX_DOCX_BYTES=16*1024*1024;
export const MIN_SCALE=0.1,MAX_SCALE=2;

/** Row and column operations around the caret's table cell. */
export const TABLE_OPS=['row_above','row_below','delete_row','col_left','col_right','delete_col','merge_right','split_cell','merge_down','split_down'] as const;
export type TableOp=typeof TABLE_OPS[number];

/** Bounds of a new table. */
export const MAX_NEW_TABLE_ROWS=20,MAX_NEW_TABLE_COLS=10;
/** Size presets offered by the Insert table menu. */
export const TABLE_PRESETS:readonly (readonly [number,number])[]=[[2,2],[3,3],[4,3],[5,4],[6,5]];

/** Header/footer text limit and the shape of the engine's report on the default header and footer. */
export const MAX_HF_CHARS=500;
export interface HeaderFooterState{header:{text:string;editable:boolean};footer:{text:string;pageNumber:boolean;editable:boolean}}
/** A header/footer text the engine accepts: at most 500 characters and no control characters or line breaks. */
export const validHfText=(v:unknown):v is string=>typeof v==='string'&&Array.from(v).length<=MAX_HF_CHARS&&!/[\u0000-\u001f\u007f-\u009f\ufffc\u2028\u2029]/u.test(v);
