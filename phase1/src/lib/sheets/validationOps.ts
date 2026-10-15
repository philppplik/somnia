import type {CfOperator,ValidationOp} from './protocol';
import {CF_OPERATORS} from './cfOps';
/** Data validation: validation for untrusted command input. The Rust bridge and the engine re-validate every field. */
export const MAX_LIST_ITEMS=100,MAX_ITEM_CHARS=64,MAX_SOURCE_CELLS=500;
const itemProblem=(t:string)=>t.length===0||[...t].length>MAX_ITEM_CHARS||/[\u0000-\u001f\u007f,"]/.test(t);
/** Splits "a, b, c" into trimmed items; null when empty, too many, or an item is unusable. */
export function parseItemList(raw:string):string[]|null{
 const items=raw.split(',').map(x=>x.trim()).filter(x=>x!=='');
 if(items.length===0||items.length>MAX_LIST_ITEMS||items.some(itemProblem))return null;
 return [...new Set(items)];
}
const num=(v:unknown,what:string)=>{if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>=1e15)throw Error(`Invalid ${what}.`);return v;};
export function parseValidationCommand(input:unknown):ValidationOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Validation must be an object.');
 const o=input as Record<string,unknown>;const only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown validation field.');};
 const compare=()=>{if(typeof o.operator!=='string'||!(CF_OPERATORS as readonly string[]).includes(o.operator))throw Error('Unsupported comparison.');const two=o.operator==='between'||o.operator==='notBetween';if(two!==(o.value2!==undefined))throw Error(two?'Between needs two numbers.':'Only between takes two numbers.');return {operator:o.operator as CfOperator,two};};
 switch(o.kind){
  case 'list':{only('kind','items');if(!Array.isArray(o.items)||o.items.length===0||o.items.length>MAX_LIST_ITEMS||o.items.some(x=>typeof x!=='string'||itemProblem(x.trim())))throw Error('Invalid list items.');return {kind:'list',items:(o.items as string[]).map(x=>x.trim())};}
  case 'listRange':{only('kind','source');if(typeof o.source!=='string'||!/^[A-Z]{1,3}[1-9][0-9]{0,6}(:[A-Z]{1,3}[1-9][0-9]{0,6})?$/.test(o.source))throw Error('The source must be a range on this sheet.');return {kind:'listRange',source:o.source};}
  case 'number':{only('kind','whole','operator','value','value2');if(typeof o.whole!=='boolean')throw Error('Whole must be true or false.');const c=compare();const out:ValidationOp={kind:'number',whole:o.whole,operator:c.operator,value:num(o.value,'number')};if(c.two)out.value2=num(o.value2,'second number');return out;}
  case 'length':{only('kind','operator','value','value2');const c=compare();const out:ValidationOp={kind:'length',operator:c.operator,value:num(o.value,'length')};if(c.two)out.value2=num(o.value2,'second length');return out;}
  case 'clear':only('kind');return {kind:'clear'};
  default:throw Error('Unsupported validation kind.');}
}
export const VALIDATION_CHOICES=['list','listRange','whole','decimal','length'] as const;
export type ValidationChoice=typeof VALIDATION_CHOICES[number];
/** Panel inputs to an op; null while incomplete or invalid. */
export function buildValidationOp(choice:ValidationChoice,operator:CfOperator,a:string,b:string):ValidationOp|null{
 const n=(v:string)=>v.trim()!==''&&Number.isFinite(Number(v))?Number(v):NaN;
 const two=operator==='between'||operator==='notBetween';
 try{
  if(choice==='list'){const items=parseItemList(a);return items?parseValidationCommand({kind:'list',items}):null;}
  if(choice==='listRange')return parseValidationCommand({kind:'listRange',source:a.trim().toUpperCase().replace(/\$/g,'')});
  const base={operator,value:n(a),...(two?{value2:n(b)}:{})};
  return parseValidationCommand(choice==='length'?{kind:'length',...base}:{kind:'number',whole:choice==='whole',...base});
 }catch{return null;}
}
