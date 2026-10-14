import type {CellStyle,FormatOp} from './protocol';
/** Formatting model for the Sheets studio: validation, toggling and the fixed choice lists. The engine bridge re-validates everything. */
export const FORMAT_MAX_CELLS=1_000_000;
export const FONT_NAMES=['Calibri','Arial','Verdana','Tahoma','Georgia','Times New Roman','Courier New','Consolas'] as const;
export const FONT_SIZES=[8,9,10,11,12,14,16,18,20,24,28,36,48,72] as const;
export const MIN_FONT_SIZE=1,MAX_FONT_SIZE=409;
export const DEFAULT_TEXT_COLOR='#000000';
export const DEFAULT_FILL_COLOR='#FFF2CC';
const HEX=/^#[0-9a-fA-F]{6}$/;
export const isHexColor=(v:unknown):v is string=>typeof v==='string'&&HEX.test(v);
export const TOGGLE_KINDS=['bold','italic','underline','strike'] as const;
export type ToggleKind=typeof TOGGLE_KINDS[number];
/** Parses untrusted command input into a FormatOp or throws. Unknown keys and kinds are refused. */
export function parseFormatOp(input:unknown):FormatOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Format must be an object.');
 const o=input as Record<string,unknown>;const keys=Object.keys(o);const only=(...allowed:string[])=>{if(keys.some(k=>!allowed.includes(k)))throw Error('Unknown format field.');};
 switch(o.kind){
  case 'bold':case 'italic':case 'underline':case 'strike':only('kind','on');if(typeof o.on!=='boolean')throw Error('`on` must be true or false.');return {kind:o.kind,on:o.on};
  case 'fontName':{only('kind','name');const n=typeof o.name==='string'?o.name.trim():'';if(!n||[...n].length>64||/[\u0000-\u001f\u007f]/.test(n))throw Error('Invalid font name.');return {kind:'fontName',name:n};}
  case 'fontSize':only('kind','size');if(typeof o.size!=='number'||!Number.isFinite(o.size)||o.size<MIN_FONT_SIZE||o.size>MAX_FONT_SIZE)throw Error('Font size must be between 1 and 409.');return {kind:'fontSize',size:o.size};
  case 'fontColor':only('kind','color');if(o.color!=='auto'&&!isHexColor(o.color))throw Error('Color must be #RRGGBB or auto.');return {kind:'fontColor',color:o.color as string};
  case 'fillColor':only('kind','color');if(o.color!=='none'&&!isHexColor(o.color))throw Error('Color must be #RRGGBB or none.');return {kind:'fillColor',color:o.color as string};
  default:throw Error('Unsupported format operation.');}
}
/** Excel-style toggle: the active cell decides whether the whole selection turns on or off. */
export function toggleOp(kind:ToggleKind,style:CellStyle|undefined):FormatOp{return {kind,on:!(style?.[kind])};}
/** Rectangle size guard shared with the grid (the engine allows more, but a single UI action stays bounded). */
export const formatRectOk=(cells:number)=>Number.isInteger(cells)&&cells>=1&&cells<=FORMAT_MAX_CELLS;
