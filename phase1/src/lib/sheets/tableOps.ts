import type {PivotField,PivotFunc,PivotOp,TableInfo,TableOp,TablesInfo} from './protocol';
import {nameProblem} from './names';
/** Tables and PivotTables: validation of untrusted command input and of bridge answers. The Rust bridge re-validates. */
export const PIVOT_FUNCS:readonly PivotFunc[]=['sum','count','average','max','min'];
export const MAX_PIVOT_FIELD=255,MAX_TABLES=200;
const STYLE=/^TableStyle(Light|Medium|Dark)[0-9]{1,2}$/;
const fieldBad=(f:unknown)=>typeof f!=='string'||f.trim()===''||[...f].length>MAX_PIVOT_FIELD||/[\u0000-\u001f\u007f]/.test(f);
/** null when a block can feed a table or pivot: a header row plus at least one data row, at most 1,000,000 cells. */
export function tableBlockProblem(rows:number,cols:number):'small'|'large'|null{
 if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<2||cols<1)return 'small';return rows*cols>1_000_000?'large':null;
}
export function parseTableCommand(input:unknown):TableOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Table operation must be an object.');
 const o=input as Record<string,unknown>,only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown table field.');};
 const table=()=>{if(typeof o.table!=='string'||o.table.trim()===''||[...o.table].length>64)throw Error('A table name is needed.');return o.table.trim();};
 const style=(v:unknown)=>{if(typeof v!=='string'||!STYLE.test(v))throw Error('Unsupported table style.');return v;};
 switch(o.kind){
  case 'create':{only('kind','name','style');const out:TableOp={kind:'create'};if(o.name!==undefined){if(typeof o.name!=='string'||nameProblem(o.name.trim())==='length'||nameProblem(o.name.trim())==='chars')throw Error('Invalid table name.');out.name=o.name.trim();}if(o.style!==undefined)out.style=style(o.style);return out;}
  case 'totals':case 'banded':case 'bandedCols':case 'firstCol':case 'lastCol':only('kind','table','on');if(typeof o.on!=='boolean')throw Error('`on` must be true or false.');return {kind:o.kind,table:table(),on:o.on};
  case 'style':only('kind','table','style');return {kind:'style',table:table(),style:style(o.style)};
  case 'rename':{only('kind','table','newName');if(typeof o.newName!=='string'||nameProblem(o.newName.trim())!==null)throw Error('Invalid table name.');return {kind:'rename',table:table(),newName:o.newName.trim()};}
  case 'convert':case 'resize':only('kind','table');return {kind:o.kind,table:table()};
  default:throw Error('Unsupported table operation.');
 }
}
export function parsePivotCommand(input:unknown):PivotOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Pivot operation must be an object.');
 const o=input as Record<string,unknown>,only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown pivot field.');};
 if(o.kind==='refresh'){only('kind');return {kind:'refresh'};}
 if(o.kind==='create'){only('kind','rows','columns','values','func');if(fieldBad(o.rows)||fieldBad(o.values))throw Error('Pick a row field and a value field.');
  const out:PivotOp={kind:'create',rows:(o.rows as string).trim(),values:(o.values as string).trim()};
  if(o.columns!==undefined){if(fieldBad(o.columns))throw Error('Invalid column field.');out.columns=(o.columns as string).trim();if(out.columns===out.rows)throw Error('Rows and columns need different fields.');}
  if(o.func!==undefined){if(!(PIVOT_FUNCS as readonly unknown[]).includes(o.func))throw Error('Unsupported summary function.');out.func=o.func as PivotFunc;}
  return out;}
 throw Error('Unsupported pivot operation.');
}
export function parseTables(raw:{tables:unknown;styles:unknown}):TablesInfo{
 const tables:TableInfo[]=[];
 if(Array.isArray(raw.tables))for(const t of raw.tables.slice(0,MAX_TABLES)){const r=t as Record<string,unknown>|null;if(r&&typeof r.name==='string'&&typeof r.range==='string')tables.push({name:r.name,range:r.range,header:r.header===true,totals:r.totals===true,banded:r.banded===true,bandedCols:r.bandedCols===true,firstCol:r.firstCol===true,lastCol:r.lastCol===true,style:typeof r.style==='string'?r.style:'',columns:Array.isArray(r.columns)?r.columns.filter((c):c is string=>typeof c==='string'&&c.length>0&&c.length<=255).slice(0,200):[]});}
 return {tables,styles:Array.isArray(raw.styles)?raw.styles.filter((s):s is string=>typeof s==='string'&&STYLE.test(s)).slice(0,100):[]};
}
export function parsePivotFields(raw:{fields:unknown}):PivotField[]{
 if(!Array.isArray(raw.fields))return [];const out:PivotField[]=[];
 for(const f of raw.fields.slice(0,200)){const r=f as Record<string,unknown>|null;if(r&&typeof r.name==='string')out.push({name:r.name,numeric:r.numeric===true});}
 return out;
}
