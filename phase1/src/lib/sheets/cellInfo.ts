/** Cell info: validation of the bridge answer (display only, closed shape, bounded texts). */
export const CELL_TYPES=['empty','number','text','bool','error','other'] as const;
export interface CellInfo{address:string;type:typeof CELL_TYPES[number];display:string;formula:string|null;numberFormat:string;locked:boolean;hiddenFormula:boolean;sheetProtected:boolean;merged:string|null;table:string|null;validation:string|null;highlightRules:number;note:'note'|'comment'|null;link:string|null;spill:{anchor:string;range:string}|null;reads:number;readBy:number}
const obj=(v:unknown)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid cell info.');return v as Record<string,unknown>;};
const str=(v:unknown,max:number)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v))throw Error('Invalid cell info text.');return v;};
const opt=(v:unknown,max:number)=>v==null?null:str(v,max);
const bool=(v:unknown)=>{if(typeof v!=='boolean')throw Error('Invalid cell info flag.');return v;};
const num=(v:unknown)=>{if(typeof v!=='number'||!Number.isInteger(v)||v<0||v>1e9)throw Error('Invalid cell info count.');return v;};
export function parseCellInfo(input:unknown):CellInfo{
 const o=obj(input);if(!(CELL_TYPES as readonly unknown[]).includes(o.type))throw Error('Invalid cell type.');
 if(o.note!=null&&o.note!=='note'&&o.note!=='comment')throw Error('Invalid note kind.');
 let spill:CellInfo['spill']=null;if(o.spill!=null){const s=obj(o.spill);spill={anchor:str(s.anchor,16),range:str(s.range,40)};}
 return {address:str(o.address,16),type:o.type as CellInfo['type'],display:str(o.display,200),formula:opt(o.formula,500),numberFormat:str(o.numberFormat,64),locked:bool(o.locked),hiddenFormula:bool(o.hiddenFormula),sheetProtected:bool(o.sheetProtected),merged:opt(o.merged,40),table:opt(o.table,64),validation:opt(o.validation,24),highlightRules:num(o.highlightRules),note:(o.note??null) as CellInfo['note'],link:opt(o.link,200),spill,reads:num(o.reads),readBy:num(o.readBy)};
}
