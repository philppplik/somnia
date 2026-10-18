import type {FilterCondition,FilterOp,RangeCell} from './protocol';
/** Row filter: validation for untrusted command input. The Rust bridge and the engine re-validate every field. */
export const FILTER_CONDITIONS:readonly FilterCondition[]=['=','<>','>','<','>=','<=','beginsWith','endsWith','contains','notContains'];
export const MAX_FILTER_VALUE=255,MAX_FILTER_COLUMN=16383,MAX_FILTER_PICKS=200,MAX_FILTER_SCAN_ROWS=10000;
export interface DistinctValues{values:{text:string;count:number}[];blanks:number;truncated:boolean}
/** The distinct values of one column (text as the filter compares it: texts as typed, numbers in plain form, TRUE/FALSE), commonest first up to 200. Errors and arrays are skipped. */
export function distinctValues(cells:readonly RangeCell[],rows:number):DistinctValues{
 const seen=new Map<string,number>();let blanks=0;
 for(const c of cells.slice(0,rows)){
  const v=c.value;
  if(v.t==='Empty'||(v.t==='Text'&&v.v==='')){blanks++;continue;}
  const text=v.t==='Text'?v.v:v.t==='Number'&&Number.isFinite(v.v)?String(v.v):v.t==='Bool'?(v.v?'TRUE':'FALSE'):null;
  if(text===null||filterValueProblem(text))continue;
  seen.set(text,(seen.get(text)??0)+1);
 }
 const all=[...seen.entries()].map(([text,count])=>({text,count})).sort((a,b)=>b.count-a.count||a.text.localeCompare(b.text));
 return {values:all.slice(0,MAX_FILTER_PICKS),blanks,truncated:all.length>MAX_FILTER_PICKS};
}
export function filterValueProblem(raw:string):'blank'|'long'|'chars'|null{
 if(raw.length===0)return 'blank';if([...raw].length>MAX_FILTER_VALUE)return 'long';if(/[\u0000-\u001f\u007f]/.test(raw))return 'chars';return null;
}
export function parseFilterCommand(input:unknown):FilterOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Filter must be an object.');
 const o=input as Record<string,unknown>;const only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown filter field.');};
 const column=()=>{if(typeof o.column!=='number'||!Number.isInteger(o.column)||o.column<0||o.column>MAX_FILTER_COLUMN)throw Error('Invalid filter column.');return o.column;};
 switch(o.kind){
  case 'custom':{only('kind','column','op','value');const c=column();if(typeof o.op!=='string'||!(FILTER_CONDITIONS as readonly string[]).includes(o.op))throw Error('Unsupported filter condition.');
   if(typeof o.value!=='string'||filterValueProblem(o.value))throw Error('Invalid filter value.');return {kind:'custom',column:c,op:o.op as FilterCondition,value:o.value};}
  case 'values':{only('kind','column','values','blanks');const c=column();
   if(!Array.isArray(o.values)||o.values.length>MAX_FILTER_PICKS||o.values.some(v=>typeof v!=='string'||filterValueProblem(v)))throw Error('Invalid filter values.');
   if(typeof o.blanks!=='boolean')throw Error('Blanks must be true or false.');
   if(o.values.length===0&&!o.blanks)throw Error('Pick at least one value.');
   return {kind:'values',column:c,values:[...new Set(o.values as string[])],blanks:o.blanks};}
  case 'range':{only('kind','column','from','to');const c=column();
   if(typeof o.from!=='number'||!Number.isFinite(o.from)||typeof o.to!=='number'||!Number.isFinite(o.to))throw Error('Range bounds must be finite numbers.');
   if(!(o.from<o.to))throw Error('The range start must be below the range end.');
   return {kind:'range',column:c,from:o.from,to:o.to};}
  case 'top':{only('kind','column','count','bottom','percent');const c=column();
   if(typeof o.count!=='number'||!Number.isInteger(o.count)||o.count<1||o.count>1000)throw Error('The count must be 1 to 1000.');
   if(typeof o.bottom!=='boolean'||typeof o.percent!=='boolean')throw Error('Bottom and percent must be true or false.');
   if(o.percent&&o.count>100)throw Error('A percentage is at most 100.');
   return {kind:'top',column:c,count:o.count,bottom:o.bottom,percent:o.percent};}
  case 'color':{only('kind','column','row','by');const c=column();
   if(typeof o.row!=='number'||!Number.isInteger(o.row)||o.row<0||o.row>1048575)throw Error('The colour row is outside the sheet.');
   if(o.by!=='fill'&&o.by!=='font')throw Error('Colour must come from fill or font.');return {kind:'color',column:c,row:o.row,by:o.by};}
  case 'aboveAverage':{only('kind','column','above');const c=column();if(typeof o.above!=='boolean')throw Error('Above must be true or false.');return {kind:'aboveAverage',column:c,above:o.above};}
  case 'clear':only('kind','column');return {kind:'clear',column:column()};
  case 'clearAll':case 'off':only('kind');return {kind:o.kind};
  default:throw Error('Unsupported filter operation.');}
}

/** One rendered row of a value list: label to show, row count, and the filter-identity values it stands for. */
export interface FilterValueRow{key:string;label:string;count:number;values:string[]}
/**
 * Display-text labels for a date-formatted column. `textByValue` maps the plain
 * filter identity (String(serial)) to the cell's formatted display text; rows group
 * every identity sharing one display text (a day-granular format merges times of a
 * day), counts add up, and applying a ticked row keeps all its identities - exactly
 * how the list reads. Returns null when any listed identity has no display text
 * (mixed or non-date column): the caller then renders the plain list, no guessing.
 */
export function groupDisplayLabels(data:DistinctValues,textByValue:ReadonlyMap<string,string>):FilterValueRow[]|null{
 const map=new Map<string,FilterValueRow>();
 for(const v of data.values){
  const label=textByValue.get(v.text);if(label===undefined)return null;
  let row=map.get(label);if(!row){row={key:label,label,count:0,values:[]};map.set(label,row);}
  row.count+=v.count;row.values.push(v.text);
 }
 return [...map.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
}
/** The plain rows of a non-date column: identity and label are the same text. */
export const plainRows=(data:DistinctValues):FilterValueRow[]=>data.values.map(v=>({key:v.text,label:v.text,count:v.count,values:[v.text]}));
