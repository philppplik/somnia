import type {FilterCondition,FilterOp} from './protocol';
/** Row filter: validation for untrusted command input. The Rust bridge and the engine re-validate every field. */
export const FILTER_CONDITIONS:readonly FilterCondition[]=['=','<>','>','<','>=','<=','beginsWith','endsWith','contains','notContains'];
export const MAX_FILTER_VALUE=255,MAX_FILTER_COLUMN=16383;
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
  case 'clear':only('kind','column');return {kind:'clear',column:column()};
  case 'clearAll':case 'off':only('kind');return {kind:o.kind};
  default:throw Error('Unsupported filter operation.');}
}
