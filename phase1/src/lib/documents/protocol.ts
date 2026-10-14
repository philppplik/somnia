/** Typed RPC between the main thread and the Documents worker. Bytes move by transfer. */
export interface PageSize{width:number;height:number}
export interface OpenedDocument{pages:number;pageSizes:PageSize[];text:string;cacheHits:number;cacheMisses:number;openMs:number;layoutMs:number}
export interface HitResult{block:number|null;off?:number;editable:boolean}
export interface CaretBox{page:number;x:number;top:number;height:number}
export type Tri='on'|'off'|'mixed';
/** Effective bold/italic/underline over a selection (style and direct formatting). */
export interface FormatState{bold:Tri;italic:Tri;underline:Tri;strike?:Tri;smallCaps?:Tri;allCaps?:Tri;doubleStrike?:Tri;/** Shared character spacing in points, or null when mixed. */spacing?:number|null;/** Shared values, or null when the selection mixes them. */vertAlign?:VertAlign|null;highlight?:HighlightName|'other'|null;/** Shared link target (empty for none), or null when mixed. */link?:string|null;/** Shared value over the selection, or null when it mixes values. */font?:string|null;size?:number|null;/** `RRGGBB`, `auto`, or null when mixed. */color?:string|null}
export type VertAlign='baseline'|'superscript'|'subscript';
export const HIGHLIGHTS=['none','yellow','green','cyan','pink','gray'] as const;export type HighlightName=typeof HIGHLIGHTS[number];
export const MAX_LINK_CHARS=2048;
/** A link target the engine accepts: http, https or mailto, no spaces or control characters, at most 2048 characters. Empty removes a link. Returns the reason it is refused, or null. */
export function linkProblem(v:unknown):string|null{
 if(typeof v!=='string')return 'The link is not valid.';
 if(v==='')return null;
 if(Array.from(v).length>MAX_LINK_CHARS||/[\s\u0000-\u001f\u007f-\u009f]/.test(v)||!/^(https?:\/\/|mailto:)./i.test(v))return 'A link starts with http://, https:// or mailto: and has no spaces.';
 return null;
}
export interface FormatPatch{bold?:boolean;italic?:boolean;underline?:boolean;font?:string;size?:number;color?:string;strike?:boolean;smallCaps?:boolean;allCaps?:boolean;doubleStrike?:boolean;/** Extra space after each character in points (-5 to 30). */spacing?:number;vertAlign?:VertAlign;highlight?:HighlightName;link?:string;/** Character style id; an empty string removes it. */charStyle?:string;/** Remove direct character formatting (links stay). Only `true`. */clear?:true}
export const MIN_FONT_PT=1,MAX_FONT_PT=400,MAX_FONT_NAME=64;
/** Selection endpoints: top-level paragraph index and UTF-8 byte offset. */
export interface DocPos{block:number;off:number}
export const MAX_FORMAT_BLOCKS=2000;
export const MIN_SPACING_PT=-5,MAX_SPACING_PT=30;
const FLAG_KEYS=['bold','italic','underline','strike','smallCaps','allCaps','doubleStrike'];
/** Validates a format patch: flags are booleans, font is short printable text, size is 1-400 pt, color is auto or RRGGBB. */
/** A style id: letters, digits, underscore and hyphen, at most 80 characters (the engine checks that the style exists). */
export const STYLE_ID_RE=/^[\p{L}\p{N}_-]{1,80}$/u;
export function checkFormatPatch(patch:unknown){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Format change is not valid.');
 const o=patch as Record<string,unknown>;const keys=Object.keys(o);if(!keys.length)throw new Error('Format change is not valid.');
 for(const k of keys){const v=o[k];
  if(FLAG_KEYS.includes(k)){if(typeof v!=='boolean')throw new Error('Format change is not valid.');}
  else if(k==='font'){if(typeof v!=='string'||!v||[...v].length>MAX_FONT_NAME||/[\u0000-\u001f\u007f]/.test(v))throw new Error('Font name is not valid.');}
  else if(k==='size'){if(typeof v!=='number'||!Number.isFinite(v)||v<MIN_FONT_PT||v>MAX_FONT_PT)throw new Error(`Font size must be between ${MIN_FONT_PT} and ${MAX_FONT_PT} pt.`);}
  else if(k==='spacing'){if(typeof v!=='number'||!Number.isFinite(v)||v<MIN_SPACING_PT||v>MAX_SPACING_PT)throw new Error(`Character spacing must be between ${MIN_SPACING_PT} and ${MAX_SPACING_PT} pt.`);}
  else if(k==='color'){if(typeof v!=='string'||!(v==='auto'||/^[0-9a-fA-F]{6}$/.test(v)))throw new Error('Colour must be automatic or six hex digits.');}
  else if(k==='vertAlign'){if(v!=='baseline'&&v!=='superscript'&&v!=='subscript')throw new Error('Format change is not valid.');}
  else if(k==='highlight'){if(!(HIGHLIGHTS as readonly unknown[]).includes(v))throw new Error('Highlight colour is not valid.');}
  else if(k==='link'){const bad=linkProblem(v);if(bad)throw new Error(bad);}
  else if(k==='charStyle'){if(typeof v!=='string'||!STYLE_ID_RE.test(v)&&v!=='')throw new Error('Style is not valid.');}
  else if(k==='clear'){if(v!==true)throw new Error('Format change is not valid.');}
  else throw new Error('Format change is not valid.');
 }
}
export type ParaAlign='left'|'center'|'right'|'justify';
/** Whole-paragraph formatting in points; line spacing is a multiple of single. */
export const TAB_ALIGNS=['left','center','right','decimal','bar'] as const;
export const TAB_LEADERS=['none','dot','hyphen','underscore','middleDot'] as const;
export const MAX_TAB_STOPS=20;
export interface TabStopSpec{pos:number;align:typeof TAB_ALIGNS[number];leader:typeof TAB_LEADERS[number]}
/** The first problem with a tab stop list, or null when the engine will accept it. */
export function tabsProblem(v:unknown):string|null{
 if(!Array.isArray(v))return 'Tab stops must be a list.';
 if(v.length>MAX_TAB_STOPS)return `A paragraph has at most ${MAX_TAB_STOPS} tab stops.`;
 const pos:number[]=[];
 for(const t of v){
  if(!t||typeof t!=='object'||Array.isArray(t))return 'A tab stop is not valid.';
  const o=t as Record<string,unknown>;if(Object.keys(o).some(k=>k!=='pos'&&k!=='align'&&k!=='leader'))return 'A tab stop is not valid.';
  if(typeof o.pos!=='number'||!Number.isFinite(o.pos)||o.pos<0||o.pos>1440)return 'A tab stop position is 0 to 1440 points.';
  if(!(TAB_ALIGNS as readonly unknown[]).includes(o.align))return 'A tab stop alignment is not valid.';
  if(!(TAB_LEADERS as readonly unknown[]).includes(o.leader))return 'A tab stop leader is not valid.';
  pos.push(o.pos);
 }
 pos.sort((a,b)=>a-b);
 for(let i=1;i<pos.length;i++)if(pos[i]-pos[i-1]<0.5)return 'Tab stops must be at least 0.5 points apart.';
 return null;
}
export interface ParaPatch{tabs?:TabStopSpec[];align?:ParaAlign;indentLeft?:number;indentFirst?:number;spaceBefore?:number;spaceAfter?:number;lineSpacing?:number;indentRight?:number;pageBreakBefore?:boolean;keepNext?:boolean;keepLines?:boolean;widowControl?:boolean;/** `RRGGBB`, or `none` to clear. */shading?:string;/** A box border on all four sides, or `none`. */border?:'none'|ParaBorder;/** Lines the first letter spans (0 = off, at most 10). */dropCap?:number}
export const MAX_DROP_CAP=10;
export const BORDER_STYLES=['single','double','dotted','dashed','thick'] as const;
export interface ParaBorder{style:typeof BORDER_STYLES[number];width:number;color:string}
/** Why the shading or border value is refused, or null. */
export function paraLookProblem(k:'shading'|'border',v:unknown):string|null{
 if(k==='shading')return v==='none'||(typeof v==='string'&&/^[0-9a-fA-F]{6}$/.test(v))?null:'Shading is none or six hex digits.';
 if(v==='none')return null;
 if(!v||typeof v!=='object'||Array.isArray(v))return 'The border is not valid.';
 const o=v as Record<string,unknown>;if(Object.keys(o).some(x=>x!=='style'&&x!=='width'&&x!=='color'))return 'The border is not valid.';
 if(!(BORDER_STYLES as readonly unknown[]).includes(o.style))return 'The border style is not valid.';
 if(typeof o.width!=='number'||!Number.isFinite(o.width)||o.width<0.25||o.width>12)return 'Border width is 0.25 to 12 points.';
 return typeof o.color==='string'&&/^[0-9a-fA-F]{6}$/.test(o.color)?null:'Border colour must be six hex digits.';
}
export const PARA_FLAG_KEYS=['pageBreakBefore','keepNext','keepLines','widowControl'] as const;
/** Shared effective value over the paragraphs, or null when they differ (line spacing: also null for exact/at-least heights). */
export interface ParaState{align:ParaAlign|null;indentLeft:number|null;indentFirst:number|null;spaceBefore:number|null;spaceAfter:number|null;lineSpacing:number|null;indentRight?:number|null;/** Resolved tab stops when shared, else null. */tabs?:TabStopSpec[]|null;/** Shared flags, or null when the paragraphs differ. */pageBreakBefore?:boolean|null;keepNext?:boolean|null;keepLines?:boolean|null;widowControl?:boolean|null;/** Shared shading (`RRGGBB` or `none`) and whether a box border is set; null when mixed. */shading?:string|null;border?:'box'|'none'|null;dropCap?:number|null;/** Paragraph style id (`Normal`, `Heading2`, ...) when shared. */style?:string|null;list?:'none'|'bullet'|'numbered'|null;/** The shared list style, `other` for a list from a file that matches none, `none` outside lists, null when mixed. */listStyle?:ListStyleId|'other'|'none'|null;listLevel?:number|null}
const PARA_RANGES:Record<string,[number,number]>={indentLeft:[0,1440],indentRight:[0,1440],indentFirst:[-1440,1440],spaceBefore:[0,1584],spaceAfter:[0,1584],lineSpacing:[0.5,10]};
export function checkParaPatch(patch:unknown){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Paragraph change is not valid.');
 const o=patch as Record<string,unknown>;const keys=Object.keys(o);if(!keys.length)throw new Error('Paragraph change is not valid.');
 for(const k of keys){const v=o[k];
  if(k==='align'){if(v!=='left'&&v!=='center'&&v!=='right'&&v!=='justify')throw new Error('Alignment is not valid.');}
  else if(k==='dropCap'){if(typeof v!=='number'||!Number.isInteger(v)||v<0||v>MAX_DROP_CAP)throw new Error(`Drop cap is 0 to ${MAX_DROP_CAP} lines.`);}
  else if(k==='shading'||k==='border'){const bad=paraLookProblem(k,v);if(bad)throw new Error(bad);}
  else if(k==='tabs'){const bad=tabsProblem(v);if(bad)throw new Error(bad);}
  else if((PARA_FLAG_KEYS as readonly string[]).includes(k)){if(typeof v!=='boolean')throw new Error('Paragraph change is not valid.');}
  else if(PARA_RANGES[k]){const [lo,hi]=PARA_RANGES[k];if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)throw new Error(`${k} must be between ${lo} and ${hi}.`);}
  else throw new Error('Paragraph change is not valid.');
 }
}
export const DOC_STYLES=['Normal','Title','Subtitle','Heading1','Heading2','Heading3','Heading4','Quote'] as const;
export type DocStyleId=typeof DOC_STYLES[number];
/** The list styles a user can pick (bullet, dash, square, 1., 1), A., a), i., I.A.1., 1.1.1.). */
export const LIST_STYLES=['bullet','dash','square','numbered','numberedParen','upperLetter','lowerLetter','lowerRoman','outline','legal'] as const;
export type ListStyleId=typeof LIST_STYLES[number];
export type ListKindId=ListStyleId|'none';
export const isListKind=(v:unknown):v is ListKindId=>v==='none'||(LIST_STYLES as readonly unknown[]).includes(v);
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
 |{id:number;kind:'paraStyle';first:number;last:number;style:string}
 |{id:number;kind:'setList';first:number;last:number;list:ListKindId}
 |{id:number;kind:'insertToc';block:number;levels:number;title:string;pages:boolean}
 |{id:number;kind:'updateToc';block:number}
 |{id:number;kind:'removeToc';block:number}
 |{id:number;kind:'listStyles'}
 |{id:number;kind:'upsertStyle';patch:StylePatch}
 |{id:number;kind:'deleteStyle';styleId:string}
 |{id:number;kind:'restartList';first:number;last:number}
 |{id:number;kind:'continueList';first:number;last:number}
 |{id:number;kind:'listLevel';first:number;last:number;delta:number}
 |{id:number;kind:'tableEdit';block:number;op:TableOp}
 |{id:number;kind:'tableStyle';block:number;scope:TableStyleScope;style:TableStyle}
 |{id:number;kind:'colWidth';block:number;width:number}
 |{id:number;kind:'insertImage';block:number;bytes:ArrayBuffer;alt:string}
 |{id:number;kind:'imageEdit';block:number;op:ImageOp}
 |{id:number;kind:'listOptions';block:number}
 |{id:number;kind:'setListOptions';block:number;patch:ListOptionsPatch}
 |{id:number;kind:'propertiesState'}
 |{id:number;kind:'setProperties';patch:PropertiesPatch}
 |{id:number;kind:'pageSetupState'}
 |{id:number;kind:'setPageSetup';setup:PageSetupPatch}
 |{id:number;kind:'commentsState'}
 |{id:number;kind:'addComment';block:number;start:number;end:number;text:string;author:string;date:string}
 |{id:number;kind:'replyComment';parent:number;text:string;author:string;date:string}
 |{id:number;kind:'resolveComment';commentId:number;resolved:boolean}
 |{id:number;kind:'deleteComment';commentId:number}
 |{id:number;kind:'headerFooterState'}
 |{id:number;kind:'setHeaderFooter';header?:string;footer?:string;pageNumber?:boolean}
 |{id:number;kind:'insertTable';block:number;rows:number;cols:number}
 |{id:number;kind:'save';date?:string;author?:string}
 |{id:number;kind:'exportPdf';options?:PdfOptions;date?:string}
 |{id:number;kind:'close'};
export type DocumentsResponse=
 |{id:number;ok:true;kind:'ready';initMs:number}
 |{id:number;ok:true;kind:'opened';document:OpenedDocument}
 |{id:number;ok:true;kind:'rendered';png:ArrayBuffer;renderMs:number}
 |{id:number;ok:true;kind:'edited';document:OpenedDocument}
 |{id:number;ok:true;kind:'blocks';blocks:import('./edit').DocBlock[]}
 |{id:number;ok:true;kind:'comments';comments:CommentItem[]}
 |{id:number;ok:true;kind:'headerFooter';state:HeaderFooterState}
 |{id:number;ok:true;kind:'properties';state:PropertiesState}
 |{id:number;ok:true;kind:'styles';items:StyleItem[]}
 |{id:number;ok:true;kind:'styleSaved';styleId:string;document:OpenedDocument}
 |{id:number;ok:true;kind:'listOptions';state:ListOptionsState}
 |{id:number;ok:true;kind:'pageSetup';state:PageSetupState}
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
/** The largest PDF the app accepts from the engine (the engine enforces the same bound). */
export const MAX_PDF_BYTES=100*1024*1024;
export const MIN_SCALE=0.1,MAX_SCALE=2;

/** Row and column operations around the caret's table cell. */
export const TABLE_OPS=['row_above','row_below','delete_row','col_left','col_right','delete_col','merge_right','split_cell','merge_down','split_down'] as const;
export type TableOp=typeof TABLE_OPS[number];

/** Bounds of a new table. */
export const MAX_NEW_TABLE_ROWS=20,MAX_NEW_TABLE_COLS=10;
export const MIN_COL_PT=20,MAX_COL_PT=1000;
/** Table styling for one cell or the whole table. Colours are RRGGBB; rowHeight 0 means automatic. */
export type TableStyleScope='cell'|'table';
export interface TableStyle{fill?:string;border?:'none'|{width:number;color:string};rowHeight?:number;padding?:number}
export const MIN_BORDER_PT=0.25,MAX_BORDER_PT=12,MAX_ROW_PT=400,MAX_PAD_PT=72;
const HEX6=/^[0-9A-Fa-f]{6}$/;
/** The first problem with a table style, or null when the engine will accept it. */
export function tableStyleProblem(s:unknown):string|null{
 if(!s||typeof s!=='object'||Array.isArray(s))return 'The table style is not valid.';
 const o=s as Record<string,unknown>;const keys=Object.keys(o);
 if(keys.length===0)return 'Nothing to change.';
 for(const k of keys){
  const v=o[k];
  if(k==='fill'){if(v!=='none'&&!(typeof v==='string'&&HEX6.test(v)))return 'The fill must be a colour or none.';}
  else if(k==='border'){
   if(v==='none')continue;
   if(!v||typeof v!=='object'||Array.isArray(v))return 'The border is not valid.';
   const b=v as Record<string,unknown>;if(Object.keys(b).some(x=>x!=='width'&&x!=='color'))return 'The border is not valid.';
   if(typeof b.width!=='number'||!Number.isFinite(b.width)||b.width<MIN_BORDER_PT||b.width>MAX_BORDER_PT)return `A border is ${MIN_BORDER_PT} to ${MAX_BORDER_PT} points wide.`;
   if(b.color!=='auto'&&!(typeof b.color==='string'&&HEX6.test(b.color)))return 'The border colour is not valid.';
  }
  else if(k==='rowHeight'){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>MAX_ROW_PT||(v>0&&v<1))return `A row height is 0 (automatic) or 1 to ${MAX_ROW_PT} points.`;}
  else if(k==='padding'){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>MAX_PAD_PT)return `Padding is 0 to ${MAX_PAD_PT} points.`;}
  else return 'The table style is not valid.';
 }
 return null;
}
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
/** Page setup in points. `size` is "custom" when the page matches none of the offered sizes. */
export const PAGE_SIZE_IDS=['a4','letter','legal','a5'] as const;
export type PageSizeId=typeof PAGE_SIZE_IDS[number];
export interface PageMargins{top:number;bottom:number;left:number;right:number}
export interface PageColumns{count:number;space:number;separator:boolean}
export interface PageSetupState{size:PageSizeId|'custom';landscape:boolean;width:number;height:number;margins:PageMargins;columns:PageColumns&{uneven:boolean};/** Line numbering, or null when off. */lineNumbers?:LineNumberState|null}
export const LINE_RESTARTS=['page','section','continuous'] as const;
export interface LineNumberState{countBy:number;restart:typeof LINE_RESTARTS[number]}
export interface PageSetupPatch{size?:PageSizeId;landscape?:boolean;margins?:Partial<PageMargins>;columns?:Partial<PageColumns>;/** null turns line numbers off. */lineNumbers?:null|Partial<LineNumberState>}
export const MAX_MARGIN_PT=288,MAX_COLUMNS=4,MAX_COLUMN_SPACE_PT=144;
/** The first problem with a page setup change, or null when the engine will accept the shape (the text-area minimum is the engine's call). */
export function pageSetupProblem(p:unknown):string|null{
 if(!p||typeof p!=='object'||Array.isArray(p))return 'The page setup is not valid.';
 const o=p as Record<string,unknown>;const keys=Object.keys(o);if(keys.length===0)return 'Nothing to change.';
 for(const k of keys){
  const v=o[k];
  if(k==='size'){if(!(PAGE_SIZE_IDS as readonly unknown[]).includes(v))return 'The page size is not valid.';}
  else if(k==='landscape'){if(typeof v!=='boolean')return 'The orientation is not valid.';}
  else if(k==='margins'){
   if(!v||typeof v!=='object'||Array.isArray(v))return 'The margins are not valid.';
   const m=v as Record<string,unknown>;const ks=Object.keys(m);if(ks.length===0)return 'The margins are not valid.';
   for(const mk of ks){if(!['top','bottom','left','right'].includes(mk))return 'The margins are not valid.';const x=m[mk];if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>MAX_MARGIN_PT)return `A margin is 0 to ${MAX_MARGIN_PT} points.`;}
  }
  else if(k==='columns'){
   if(!v||typeof v!=='object'||Array.isArray(v))return 'The columns are not valid.';
   const c=v as Record<string,unknown>;const ks=Object.keys(c);if(ks.length===0)return 'The columns are not valid.';
   for(const ck of ks){
    const x=c[ck];
    if(ck==='count'){if(typeof x!=='number'||!Number.isInteger(x)||x<1||x>MAX_COLUMNS)return `Columns are 1 to ${MAX_COLUMNS}.`;}
    else if(ck==='space'){if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>MAX_COLUMN_SPACE_PT)return `The column spacing is 0 to ${MAX_COLUMN_SPACE_PT} points.`;}
    else if(ck==='separator'){if(typeof x!=='boolean')return 'The column line is not valid.';}
    else return 'The columns are not valid.';
   }
  }
  else if(k==='lineNumbers'){
   if(v===null)continue;
   if(!v||typeof v!=='object'||Array.isArray(v))return 'The line numbers are not valid.';
   const l=v as Record<string,unknown>;if(Object.keys(l).length===0)return 'The line numbers are not valid.';
   for(const lk of Object.keys(l)){
    const x=l[lk];
    if(lk==='countBy'){if(typeof x!=='number'||!Number.isInteger(x)||x<1||x>100)return 'Line numbers count by 1 to 100.';}
    else if(lk==='restart'){if(!(LINE_RESTARTS as readonly unknown[]).includes(x))return 'The line number restart is not valid.';}
    else return 'The line numbers are not valid.';
   }
  }
  else return 'The page setup is not valid.';
 }
 return null;
}
export interface HeaderFooterState{header:{text:string;editable:boolean};footer:{text:string;pageNumber:boolean;editable:boolean}}
/** A header/footer text the engine accepts: at most 500 characters and no control characters or line breaks. */
export const validHfText=(v:unknown):v is string=>typeof v==='string'&&Array.from(v).length<=MAX_HF_CHARS&&!/[\u0000-\u001f\u007f-\u009f\ufffc\u2028\u2029]/u.test(v);

/** A comment as the engine lists it: imported and new ones, with the quoted text when its anchor sits in one paragraph. */
export interface CommentItem{id:number;parent:number|null;author:string;initials:string;date:string;resolved:boolean;text:string;quote:string|null;block:number|null}
export const MAX_COMMENT_CHARS=2000,COMMENT_AUTHOR='Somnia user';
/** Why a comment text is refused (empty, too long, control characters), or null when it is fine. Line breaks are allowed. */
export function commentProblem(text:unknown):string|null{
 if(typeof text!=='string')return 'The comment needs text.';
 const t=text.trim();if(!t)return 'The comment needs text.';
 if(Array.from(t).length>MAX_COMMENT_CHARS)return `A comment is limited to ${MAX_COMMENT_CHARS} characters.`;
 if(/[\u0000-\u0009\u000b-\u001f\u007f]/.test(t))return 'The comment has characters that are not allowed.';
 return null;
}

/** Document properties saved in the file (File info). */
export const PROPERTY_KEYS=['title','subject','creator','keywords','description','category'] as const;
export type PropertyKey=typeof PROPERTY_KEYS[number];
export type PropertiesState=Record<PropertyKey,string>;
export type PropertiesPatch=Partial<PropertiesState>;
export const MAX_PROPERTY_CHARS=255,MAX_DESCRIPTION_CHARS=2000;
/** The first problem with a properties change, or null when the engine will accept it. Plain text only; the description may have line breaks. */
export function propertiesProblem(p:unknown):string|null{
 if(!p||typeof p!=='object'||Array.isArray(p))return 'The properties are not valid.';
 const keys=Object.keys(p);if(keys.length===0)return 'Nothing to change.';
 for(const k of keys){
  if(!(PROPERTY_KEYS as readonly string[]).includes(k))return `Unknown property ${k}.`;
  const v=(p as Record<string,unknown>)[k];if(typeof v!=='string')return `Property ${k} must be text.`;
  const max=k==='description'?MAX_DESCRIPTION_CHARS:MAX_PROPERTY_CHARS;
  if(Array.from(v.trim()).length>max)return `Property ${k} is limited to ${max} characters.`;
  if((k==='description'?/[\u0000-\u0009\u000b-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(v.trim()))return `Property ${k} has characters that are not allowed.`;
 }
 return null;
}

/** Number formats a list level can use. */
export const LIST_NUM_FORMATS=['decimal','upperRoman','lowerRoman','upperLetter','lowerLetter','decimalZero','bullet'] as const;
export type ListNumFormat=typeof LIST_NUM_FORMATS[number];
export interface ListLevelOptions{format:ListNumFormat|'other';text:string;start:number;indent:number;hanging:number}
/** The nine levels of a list; `level` is the level of the asked paragraph. */
export interface ListOptionsState{level:number;levels:ListLevelOptions[]}
/** One level change: start value, number format and label text such as "%1." or "%1.%2" are each optional. */
export interface ListOptionsPatch{level:number;start?:number;format?:ListNumFormat;text?:string;indent?:number;hanging?:number}
export const MAX_LIST_START=9999,MAX_LIST_LABEL=32,MAX_LIST_INDENT_PT=720;
/** The first problem with a list level change, or null when the engine will accept it. `current` is the level's present format, used when the patch leaves the format out. */
export function listOptionsProblem(p:unknown,current?:ListNumFormat|'other',cur?:{indent:number;hanging:number}):string|null{
 if(!p||typeof p!=='object'||Array.isArray(p))return 'The list options are not valid.';
 const o=p as Record<string,unknown>;
 for(const k of Object.keys(o))if(k!=='level'&&k!=='start'&&k!=='format'&&k!=='text'&&k!=='indent'&&k!=='hanging')return `Unknown list option ${k}.`;
 const level=o.level;if(typeof level!=='number'||!Number.isInteger(level)||level<0||level>8)return 'The level must be 1 to 9.';
 if(o.start!==undefined&&(typeof o.start!=='number'||!Number.isInteger(o.start)||o.start<0||o.start>MAX_LIST_START))return `The start value must be 0 to ${MAX_LIST_START}.`;
 if(o.format!==undefined&&!(LIST_NUM_FORMATS as readonly unknown[]).includes(o.format))return 'The number format is not offered.';
 for(const k of ['indent','hanging'])if(o[k]!==undefined&&(typeof o[k]!=='number'||!Number.isFinite(o[k])||(o[k] as number)<0||(o[k] as number)>MAX_LIST_INDENT_PT))return `The ${k} must be 0 to ${MAX_LIST_INDENT_PT} points.`;
 if((o.indent!==undefined||o.hanging!==undefined)&&((o.hanging as number|undefined)??cur?.hanging??0)>((o.indent as number|undefined)??cur?.indent??MAX_LIST_INDENT_PT))return 'The hanging indent cannot be larger than the indent.';
 if(Object.keys(o).length===1)return 'Nothing to change.';
 if(o.text!==undefined){
  if(typeof o.text!=='string'||Array.from(o.text).length>MAX_LIST_LABEL||/[\u0000-\u001f\u007f]/.test(o.text))return 'The label has characters that are not allowed.';
  const fmt=(o.format??current) as string|undefined;
  if(fmt==='bullet'){if(Array.from(o.text).length!==1||o.text==='%')return 'A bullet is a single character.';}
  else{
   let own=false;const t=o.text;
   for(let i=0;i<t.length;i++){if(t[i]!=='%')continue;const c=t[i+1];if(c===undefined||!/^[0-9]$/.test(c)||Number(c)<1||Number(c)>level+1)return `A label can only use %1 to %${level+1}.`;if(Number(c)===level+1)own=true;i++;}
   if(!own)return `The label must contain %${level+1}.`;
  }
 }
 return null;
}

/** A contents list: heading levels 1 to `levels`, an optional title, and page numbers. */
export interface TocOptions{levels:number;title:string;pages:boolean}
export const MAX_TOC_TITLE=100,MAX_TOC_LEVELS=9;
/** The first problem with contents list options, or null when the engine will accept them. */
export function tocProblem(o:unknown):string|null{
 if(!o||typeof o!=='object'||Array.isArray(o))return 'The contents options are not valid.';
 const t=o as Record<string,unknown>;
 for(const k of Object.keys(t))if(k!=='levels'&&k!=='title'&&k!=='pages')return `Unknown contents option ${k}.`;
 if(typeof t.levels!=='number'||!Number.isInteger(t.levels)||t.levels<1||t.levels>MAX_TOC_LEVELS)return `Use 1 to ${MAX_TOC_LEVELS} heading levels.`;
 if(typeof t.title!=='string'||Array.from(t.title).length>MAX_TOC_TITLE||/[\u0000-\u001f\u007f-\u009f\ufffc\u2028\u2029]/u.test(t.title))return `The title is limited to ${MAX_TOC_TITLE} characters, without line breaks.`;
 if(typeof t.pages!=='boolean')return 'The page numbers option is not valid.';
 return null;
}

/** A style as the styles editor shows it (null = inherited from the base style). */
export interface StyleItem{id:string;name:string;kind:'paragraph'|'character';builtin:boolean;basedOn:string|null;font:string|null;size:number|null;bold:boolean|null;italic:boolean|null;color:string|null;align:ParaAlign|null;spaceBefore:number|null;spaceAfter:number|null;lineSpacing:number|null}
/** A style change: with `id` it modifies that style (only the given fields), without it creates one (`name` and `kind` required). `null` clears a property. */
export interface StylePatch{id?:string;name?:string;kind?:'paragraph'|'character';basedOn?:string|null;font?:string|null;size?:number|null;bold?:boolean|null;italic?:boolean|null;color?:string|null;align?:ParaAlign|null;spaceBefore?:number|null;spaceAfter?:number|null;lineSpacing?:number|null}
export const MAX_STYLE_NAME=60;
const STYLE_KEYS=['id','name','kind','basedOn','font','size','bold','italic','color','align','spaceBefore','spaceAfter','lineSpacing'];
/** The first problem with a style change, or null when the engine will accept the shape (name clashes and base chains are the engine's call). */
export function stylePatchProblem(p:unknown):string|null{
 if(!p||typeof p!=='object'||Array.isArray(p))return 'The style is not valid.';
 const o=p as Record<string,unknown>;
 for(const k of Object.keys(o))if(!STYLE_KEYS.includes(k))return `Unknown style field ${k}.`;
 if(o.id!==undefined&&(typeof o.id!=='string'||!STYLE_ID_RE.test(o.id)))return 'The style is not valid.';
 if(o.id===undefined){
  if(typeof o.name!=='string')return 'A new style needs a name.';
  if(o.kind!=='paragraph'&&o.kind!=='character')return 'The style kind is not valid.';
 }
 else if(Object.keys(o).length===1)return 'Nothing to change.';
 if(o.name!==undefined&&(typeof o.name!=='string'||o.name.trim()===''||Array.from(o.name.trim()).length>MAX_STYLE_NAME||/[\u0000-\u001f\u007f-\u009f]/.test(o.name)))return `A style name is 1 to ${MAX_STYLE_NAME} characters.`;
 if(o.basedOn!==undefined&&o.basedOn!==null&&(typeof o.basedOn!=='string'||!STYLE_ID_RE.test(o.basedOn)))return 'The base style is not valid.';
 if(o.font!==undefined&&o.font!==null&&(typeof o.font!=='string'||o.font===''||Array.from(o.font).length>MAX_FONT_NAME||/[\u0000-\u001f\u007f]/.test(o.font)))return 'Font name is not valid.';
 const num=(k:string,lo:number,hi:number)=>{const v=o[k];return v===undefined||v===null||(typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi);};
 if(!num('size',MIN_FONT_PT,MAX_FONT_PT))return `Font size must be between ${MIN_FONT_PT} and ${MAX_FONT_PT} pt.`;
 if(!num('spaceBefore',0,1584)||!num('spaceAfter',0,1584))return 'Spacing is 0 to 1584 points.';
 if(!num('lineSpacing',0.5,5))return 'Line spacing is 0.5 to 5.';
 for(const k of ['bold','italic'])if(o[k]!==undefined&&o[k]!==null&&typeof o[k]!=='boolean')return 'Bold and italic are on, off or inherited.';
 if(o.color!==undefined&&o.color!==null&&(typeof o.color!=='string'||!/^[0-9a-fA-F]{6}$/.test(o.color)))return 'Colour must be six hex digits.';
 if(o.align!==undefined&&o.align!==null&&!['left','center','right','justify'].includes(o.align as string))return 'The alignment is not valid.';
 if(o.kind==='character'||o.id===undefined&&o.kind!=='paragraph')for(const k of ['align','spaceBefore','spaceAfter','lineSpacing'])if(o[k]!==undefined)return 'Paragraph settings belong to paragraph styles.';
 return null;
}

/** PDF export options: 0-based page indexes in output order (all pages when absent), tracked-change markup, tagged PDF. */
export interface PdfOptions{pages?:number[];markup?:boolean;tagged?:boolean}
export const MAX_PDF_PAGES=2000;
/**
 * Pages typed as "1-3, 5" (1-based, ascending ranges or single pages, separated by commas) as 0-based indexes.
 * Empty text means all pages (an empty list). Null when a part is not a number or range, runs backwards, repeats a page, or is outside 1..max.
 */
export function parsePdfPages(text:string,max:number):number[]|null{
 const t=text.trim();if(t==='')return[];
 if(t.length>400)return null;
 const out:number[]=[];const seen=new Set<number>();
 for(const part of t.split(',')){
  const m=/^\s*(\d{1,6})\s*(?:-\s*(\d{1,6}))?\s*$/.exec(part);if(!m)return null;
  const a=Number(m[1]),b=m[2]===undefined?a:Number(m[2]);
  if(a<1||b<a||b>max)return null;
  for(let p=a;p<=b;p++){if(seen.has(p))return null;seen.add(p);out.push(p-1);if(out.length>MAX_PDF_PAGES)return null;}
 }
 return out;
}
/** The first problem with PDF options, or null. `pages` is checked against the page count when it is known. */
export function pdfOptionsProblem(o:unknown,pageCount?:number):string|null{
 if(o===undefined)return null;
 if(!o||typeof o!=='object'||Array.isArray(o))return 'The PDF options are not valid.';
 const r=o as Record<string,unknown>;
 for(const k of Object.keys(r)){
  if(k==='markup'||k==='tagged'){if(typeof r[k]!=='boolean')return `PDF option ${k} must be true or false.`;}
  else if(k==='pages'){
   const p=r[k];if(!Array.isArray(p)||p.length<1||p.length>MAX_PDF_PAGES)return 'PDF pages must list 1 to 2000 pages.';
   const seen=new Set<number>();
   for(const x of p){if(typeof x!=='number'||!Number.isInteger(x)||x<0||x>=MAX_PDF_PAGES*100||seen.has(x)||(pageCount!==undefined&&x>=pageCount))return 'A PDF page is not valid.';seen.add(x);}
  }else return `Unknown PDF option ${k}.`;
 }
 return null;
}

/** The save time the host stamps into a saved file's properties: UTC ISO 8601 such as 2026-10-14T18:00:00.000Z. */
export const SAVE_DATE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
