import type {SheetOp} from './protocol';
/** Sheet add/rename/duplicate/move/delete: validation for untrusted command input. The Rust bridge and the engine re-validate every field. */
export const MAX_SHEET_NAME=31,MAX_SHEETS=255;
/** The tab colors the panel offers (name key, color). */
export const TAB_COLORS=[['red','#D32F2F'],['orange','#F57C00'],['yellow','#F9A825'],['green','#2E7D32'],['blue','#1565C0'],['purple','#6A1B9A'],['gray','#616161']] as const;
/** A tab color from the bridge, or null when it is not a plain #RRGGBB. */
export const safeTabColor=(v:unknown):string|null=>typeof v==='string'&&/^#[0-9A-Fa-f]{6}$/.test(v)?v:null;
const FORBIDDEN=/[:\\/?*[\]]/;
/** Mirrors the engine's name rules so the panel can explain a bad name before sending it (uniqueness is checked by the engine). */
export function sheetNameProblem(raw:string):'blank'|'long'|'chars'|'apostrophe'|'reserved'|null{
 const n=raw.trim();if(!n)return 'blank';if([...n].length>MAX_SHEET_NAME)return 'long';if(FORBIDDEN.test(n)||/[\u0000-\u001f\u007f]/.test(n))return 'chars';if(n.startsWith("'")||n.endsWith("'"))return 'apostrophe';if(n.toLowerCase()==='history')return 'reserved';return null;}
export function parseSheetOp(input:unknown):SheetOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Sheet operation must be an object.');
 const o=input as Record<string,unknown>;const only=(...allowed:string[])=>{if(Object.keys(o).some(k=>!allowed.includes(k)))throw Error('Unknown sheet field.');};
 const name=()=>{if(typeof o.name!=='string'||sheetNameProblem(o.name))throw Error('Invalid sheet name.');return o.name.trim();};
 switch(o.kind){
  case 'add':only('kind','name');return o.name===undefined?{kind:'add'}:{kind:'add',name:name()};
  case 'rename':only('kind','name');return {kind:'rename',name:name()};
  case 'duplicate':case 'delete':only('kind');return {kind:o.kind};
  case 'move':only('kind','to');if(typeof o.to!=='number'||!Number.isInteger(o.to)||o.to<0||o.to>=MAX_SHEETS)throw Error('Invalid sheet position.');return {kind:'move',to:o.to};
  case 'hide':only('kind');return {kind:'hide'};
  case 'unhide':only('kind','index');if(typeof o.index!=='number'||!Number.isInteger(o.index)||o.index<0||o.index>=MAX_SHEETS)throw Error('Invalid sheet position.');return {kind:'unhide',index:o.index};
  case 'tabColor':only('kind','color');if(o.color!=='none'&&(typeof o.color!=='string'||!/^#[0-9A-Fa-f]{6}$/.test(o.color)))throw Error('The tab color must be #RRGGBB or none.');return {kind:'tabColor',color:o.color==='none'?'none':(o.color as string).toUpperCase()};
  default:throw Error('Unsupported sheet operation.');}
}
