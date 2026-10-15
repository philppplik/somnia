import type {OutlineInfo,OutlineOp} from './protocol';
/** Outline groups and subtotals: validation of untrusted command input. The Rust bridge and the engine re-validate. */
export const MAX_OUTLINE_ROWS=10_000,MAX_OUTLINE_COLS=200,MAX_SUBTOTAL_ROWS=2000,MAX_SUBTOTAL_VALUES=8;
export const SUBTOTAL_FUNCS=['sum','count','average','max','min','product'] as const;
export type SubtotalFunc=typeof SUBTOTAL_FUNCS[number];
export type OutlineCommand={kind:'group'|'ungroup'|'hide'|'show';axis:'rows'|'cols'}|{kind:'subtotal';groupBy:string;function:SubtotalFunc;columns:string[]};
const LETTERS=/^[A-Z]{1,3}$/;
const colIndex=(s:string)=>[...s].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1;
export function parseOutlineCommand(input:unknown):OutlineCommand{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Outline operation must be an object.');
 const o=input as Record<string,unknown>,only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown outline field.');};
 switch(o.kind){
  case 'group':case 'ungroup':case 'hide':case 'show':only('kind','axis');if(o.axis!=='rows'&&o.axis!=='cols')throw Error('The axis must be rows or cols.');return {kind:o.kind,axis:o.axis};
  case 'subtotal':{only('kind','groupBy','function','columns');
   const letter=(v:unknown)=>{if(typeof v!=='string'||!LETTERS.test(v.trim().toUpperCase()))throw Error('Columns must be letters like C.');return v.trim().toUpperCase();};
   const fn=o.function===undefined?'sum':o.function;if(!SUBTOTAL_FUNCS.includes(fn as SubtotalFunc))throw Error('Unsupported subtotal function.');
   if(!Array.isArray(o.columns)||o.columns.length<1||o.columns.length>MAX_SUBTOTAL_VALUES)throw Error('Pick 1 to 8 value columns.');
   return {kind:'subtotal',groupBy:letter(o.groupBy),function:fn as SubtotalFunc,columns:[...new Set(o.columns.map(letter))]};}
  default:throw Error('Unsupported outline operation.');
 }
}
/** Turns a command into the bridge op (column offsets inside the selection); throws when the selection does not fit. */
export function toBridgeOp(cmd:OutlineCommand,sel:{r0:number;r1:number;c0:number;c1:number}):OutlineOp{
 const rows=sel.r1-sel.r0+1,cols=sel.c1-sel.c0+1;
 if(cmd.kind!=='subtotal'){
  if(cmd.axis==='rows'?rows>MAX_OUTLINE_ROWS:cols>MAX_OUTLINE_COLS)throw Error('Too many lines selected.');
  return {kind:cmd.kind,axis:cmd.axis};
 }
 if(rows<3||rows>MAX_SUBTOTAL_ROWS||cols>MAX_OUTLINE_COLS)throw Error('Select a header row and at least two data rows (at most 2,000 rows).');
 const off=(l:string)=>{const o=colIndex(l)-sel.c0;if(o<0||o>=cols)throw Error('A column is outside the selection.');return o;};
 return {kind:'subtotal',groupBy:off(cmd.groupBy),function:cmd.function,columns:cmd.columns.map(off)};
}
/** Panel text "C, D" into column letters; null when anything is not a column letter or the list is empty or too long. */
export function parseColumnList(text:string):string[]|null{
 const parts=text.split(/[\s,;]+/).filter(Boolean).map(p=>p.toUpperCase());
 if(parts.length<1||parts.length>MAX_SUBTOTAL_VALUES||parts.some(p=>!LETTERS.test(p)))return null;
 return [...new Set(parts)];
}
export function parseOutlineInfo(raw:unknown):OutlineInfo{
 const part=(v:unknown)=>{const r=v as Record<string,unknown>|null;const n=(x:unknown,max:number)=>typeof x==='number'&&Number.isInteger(x)&&x>=0?Math.min(x,max):0;return {lines:n(r?.lines,1_048_576),deepest:n(r?.deepest,7),hidden:n(r?.hidden,1_048_576)};};
 const r=raw as Record<string,unknown>|null;return {rows:part(r?.rows),cols:part(r?.cols)};
}
