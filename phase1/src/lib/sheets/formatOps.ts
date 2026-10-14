import type {BorderLineStyle,BorderPreset,CellStyle,FormatOp,NumFmtPreset} from './protocol';
/** Formatting model for the Sheets studio: validation, toggling and the fixed choice lists. The engine bridge re-validates everything. */
export const FORMAT_MAX_CELLS=1_000_000;
export const FONT_NAMES=['Calibri','Arial','Verdana','Tahoma','Georgia','Times New Roman','Courier New','Consolas'] as const;
export const FONT_SIZES=[8,9,10,11,12,14,16,18,20,24,28,36,48,72] as const;
export const MIN_FONT_SIZE=1,MAX_FONT_SIZE=409;
export const DEFAULT_TEXT_COLOR='#000000';
export const DEFAULT_FILL_COLOR='#FFF2CC';
const HEX=/^#[0-9a-fA-F]{6}$/;
export const isHexColor=(v:unknown):v is string=>typeof v==='string'&&HEX.test(v);
export const NUM_PRESETS=['general','number','comma','percent','currency','date','time','scientific','text'] as const;
export const DECIMAL_PRESETS:readonly NumFmtPreset[]=['number','comma','percent','currency','scientific'];
export const CURRENCY_SYMBOLS=['$','€','£','¥','CHF'] as const;
export const MAX_DECIMALS=10;
/** Same codes the Rust bridge generates (kept in sync by tests on both sides). */
export function numFmtCode(preset:NumFmtPreset,decimals=preset==='percent'?0:2,symbol:string='$'):string{
 const dec=decimals>0?'.'+'0'.repeat(decimals):'';
 switch(preset){case 'general':return 'General';case 'number':return '0'+dec;case 'comma':return '#,##0'+dec;case 'percent':return '0'+dec+'%';case 'currency':return `"${symbol}"#,##0${dec}`;case 'date':return 'yyyy-mm-dd';case 'time':return 'hh:mm:ss';case 'scientific':return '0'+dec+'E+00';case 'text':return '@';}}
export interface NumFmtInfo{preset:NumFmtPreset|'custom';decimals:number;symbol:string}
/** Recognizes the codes this studio writes; anything else (a file's own format) is 'custom' and stays untouched until the user picks a preset. */
export function detectNumFmt(code:string):NumFmtInfo{
 const base={decimals:2,symbol:'$'};
 if(code==='General')return {...base,preset:'general'};if(code==='@')return {...base,preset:'text'};
 if(code==='yyyy-mm-dd')return {...base,preset:'date'};if(code==='hh:mm:ss')return {...base,preset:'time'};
 const d=(x:string)=>x.length?x.length-1:0;let m:RegExpExecArray|null;
 if((m=/^0(\.0{1,10})?$/.exec(code)))return {...base,preset:'number',decimals:d(m[1]??'')};
 if((m=/^#,##0(\.0{1,10})?$/.exec(code)))return {...base,preset:'comma',decimals:d(m[1]??'')};
 if((m=/^0(\.0{1,10})?%$/.exec(code)))return {...base,preset:'percent',decimals:d(m[1]??'')};
 if((m=/^0(\.0{1,10})?E\+00$/.exec(code)))return {...base,preset:'scientific',decimals:d(m[1]??'')};
 if((m=/^"(\$|€|£|¥|CHF)"#,##0(\.0{1,10})?$/.exec(code)))return {preset:'currency',decimals:d(m[2]??''),symbol:m[1]};
 return {...base,preset:'custom'};}
export const H_ALIGNS=['left','center','right'] as const,V_ALIGNS=['top','middle','bottom'] as const;
export const BORDER_PRESETS:readonly BorderPreset[]=['none','all','outside','thickOutside','inside','insideHorizontal','insideVertical','top','bottom','left','right','thickBottom','doubleBottom','topBottom','topThickBottom','topDoubleBottom'];
export const BORDER_STYLES:readonly BorderLineStyle[]=['thin','medium','thick','dashed','dotted','double','hair'];
export const DEFAULT_BORDER_COLOR='#000000';
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
  case 'numFmt':{only('kind','preset','decimals','symbol');if(typeof o.preset!=='string'||!(NUM_PRESETS as readonly string[]).includes(o.preset))throw Error('Unsupported number format.');const preset=o.preset as NumFmtPreset;
   const out:FormatOp={kind:'numFmt',preset};
   if(o.decimals!==undefined){if(!DECIMAL_PRESETS.includes(preset))throw Error('This number format has no decimals.');if(typeof o.decimals!=='number'||!Number.isInteger(o.decimals)||o.decimals<0||o.decimals>MAX_DECIMALS)throw Error('Decimals must be a whole number from 0 to 10.');out.decimals=o.decimals;}
   if(o.symbol!==undefined){if(preset!=='currency'||typeof o.symbol!=='string'||!(CURRENCY_SYMBOLS as readonly string[]).includes(o.symbol))throw Error('Unsupported currency symbol.');out.symbol=o.symbol;}
   return out;}
  case 'decimals':only('kind','delta');if(o.delta!==1&&o.delta!==-1)throw Error('Delta must be 1 or -1.');return {kind:'decimals',delta:o.delta};
  case 'hAlign':case 'vAlign':{only('kind','align');const list:readonly unknown[]=o.kind==='hAlign'?H_ALIGNS:V_ALIGNS;if(!list.includes(o.align))throw Error('Unsupported alignment.');return {kind:o.kind,align:o.align} as FormatOp;}
  case 'wrap':only('kind','on');if(typeof o.on!=='boolean')throw Error('`on` must be true or false.');return {kind:'wrap',on:o.on};
  case 'indent':only('kind','delta');if(o.delta!==1&&o.delta!==-1)throw Error('Delta must be 1 or -1.');return {kind:'indent',delta:o.delta};
  case 'borders':{only('kind','preset','style','color');if(!(BORDER_PRESETS as readonly unknown[]).includes(o.preset))throw Error('Unsupported border preset.');const out:FormatOp={kind:'borders',preset:o.preset as BorderPreset};
   if(o.style!==undefined){if(!(BORDER_STYLES as readonly unknown[]).includes(o.style))throw Error('Unsupported border style.');out.style=o.style as BorderLineStyle;}
   if(o.color!==undefined){if(o.color!=='auto'&&!isHexColor(o.color))throw Error('Color must be #RRGGBB or auto.');out.color=o.color as string;}
   return out;}
  default:throw Error('Unsupported format operation.');}
}
/** Excel-style toggle: the active cell decides whether the whole selection turns on or off. */
export function toggleOp(kind:ToggleKind,style:CellStyle|undefined):FormatOp{return {kind,on:!(style?.[kind])};}
/** Rectangle size guard shared with the grid (the engine allows more, but a single UI action stays bounded). */
export const formatRectOk=(cells:number)=>Number.isInteger(cells)&&cells>=1&&cells<=FORMAT_MAX_CELLS;
