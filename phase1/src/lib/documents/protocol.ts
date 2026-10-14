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
 |{id:number;kind:'colWidth';block:number;width:number}
 |{id:number;kind:'insertImage';block:number;bytes:ArrayBuffer;alt:string}
 |{id:number;kind:'imageEdit';block:number;op:ImageOp}
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
export const MIN_COL_PT=20,MAX_COL_PT=1000;
/** Size presets offered by the Insert table menu. */
export const TABLE_PRESETS:readonly (readonly [number,number])[]=[[2,2],[3,3],[4,3],[5,4],[6,5]];

/** Limits for inserted pictures (PNG or JPEG, checked by file signature). */
export const MAX_IMAGE_BYTES=5*1024*1024,MAX_IMAGE_SIDE=8000,MAX_IMAGE_PIXELS=25_000_000,MAX_IMAGES=200,MIN_IMAGE_PT=10,MAX_IMAGE_PT=2000;
export const IMAGE_WIDTH_PERCENTS=[25,50,75,100] as const;
export type ImageOp={op:'resize';width:number}|{op:'fit';percent:number}|{op:'alt';alt:string}|{op:'remove'};
/** PNG/JPEG pixel size read from the header only; null for anything else or a damaged header. */
export function sniffImage(b:Uint8Array):{type:'png'|'jpeg';w:number;h:number}|null{
 const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(b.length>=24&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((v,i)=>b[i]===v)&&b[12]===0x49&&b[13]===0x48&&b[14]===0x44&&b[15]===0x52)return{type:'png',w:dv.getUint32(16),h:dv.getUint32(20)};
 if(b.length>=4&&b[0]===0xff&&b[1]===0xd8){
  let i=2;
  while(i+4<=b.length){
   if(b[i]!==0xff)return null;const m=b[i+1];
   if(m===0xff){i++;continue;}
   if(m===0xd9||m===0xda)return null;
   if(m===0x01||(m>=0xd0&&m<=0xd7)){i+=2;continue;}
   const len=dv.getUint16(i+2);if(len<2)return null;
   if(m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc){if(i+9>b.length)return null;return{type:'jpeg',w:dv.getUint16(i+7),h:dv.getUint16(i+5)};}
   i+=2+len;
  }
 }
 return null;
}
/** The first problem with a picture, or null when it may be inserted. */
export function imageProblem(b:Uint8Array):'empty'|'size'|'type'|'dimensions'|null{
 if(b.length===0)return 'empty';if(b.length>MAX_IMAGE_BYTES)return 'size';
 const s=sniffImage(b);if(!s)return 'type';
 if(s.w<1||s.h<1||s.w>MAX_IMAGE_SIDE||s.h>MAX_IMAGE_SIDE||s.w*s.h>MAX_IMAGE_PIXELS)return 'dimensions';return null;
}
/** Header/footer text limit and the shape of the engine's report on the default header and footer. */
export const MAX_HF_CHARS=500;
export interface HeaderFooterState{header:{text:string;editable:boolean};footer:{text:string;pageNumber:boolean;editable:boolean}}
/** A header/footer text the engine accepts: at most 500 characters and no control characters or line breaks. */
export const validHfText=(v:unknown):v is string=>typeof v==='string'&&Array.from(v).length<=MAX_HF_CHARS&&!/[\u0000-\u001f\u007f-\u009f\ufffc\u2028\u2029]/u.test(v);
