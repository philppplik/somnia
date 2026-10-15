import type {CfOperator,InvalidCells,ValidationOp,ValidationRuleInfo} from './protocol';
import {CF_OPERATORS} from './cfOps';
/** Data validation: validation for untrusted command input. The Rust bridge and the engine re-validate every field. */
const OPTION_KEYS=['allowBlank','dropdown','errorStyle','errorMessage'];
export const MAX_ERROR_CHARS=255;
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
 const o=input as Record<string,unknown>;const only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)&&!OPTION_KEYS.includes(x)))throw Error('Unknown validation field.');};
 const opts=(out:object,dropdown:boolean)=>{
  const w=out as Record<string,unknown>;if(o.allowBlank!==undefined){if(typeof o.allowBlank!=='boolean')throw Error('`allowBlank` must be true or false.');w.allowBlank=o.allowBlank;}
  if(o.dropdown!==undefined){if(!dropdown||typeof o.dropdown!=='boolean')throw Error('`dropdown` only applies to lists and must be true or false.');w.dropdown=o.dropdown;}
  if(o.errorStyle!==undefined){if(o.errorStyle!=='stop'&&o.errorStyle!=='warning')throw Error('Unsupported alert style.');w.errorStyle=o.errorStyle;}
  if(o.errorMessage!==undefined){if(typeof o.errorMessage!=='string'||[...o.errorMessage].length>MAX_ERROR_CHARS||/[\u0000-\u001f\u007f]/.test(o.errorMessage))throw Error('Invalid error message.');w.errorMessage=o.errorMessage.trim();}
  return out as ValidationOp;};
 const compare=()=>{if(typeof o.operator!=='string'||!(CF_OPERATORS as readonly string[]).includes(o.operator))throw Error('Unsupported comparison.');const two=o.operator==='between'||o.operator==='notBetween';if(two!==(o.value2!==undefined))throw Error(two?'Between needs two numbers.':'Only between takes two numbers.');return {operator:o.operator as CfOperator,two};};
 const compare2=()=>{if(typeof o.operator!=='string'||!(CF_OPERATORS as readonly string[]).includes(o.operator))throw Error('Unsupported comparison.');const two=o.operator==='between'||o.operator==='notBetween';if(two!==(o.value2!==undefined))throw Error(two?'Between needs two values.':'Only between takes two values.');return two;};
 switch(o.kind){
  case 'list':{only('kind','items');if(!Array.isArray(o.items)||o.items.length===0||o.items.length>MAX_LIST_ITEMS||o.items.some(x=>typeof x!=='string'||itemProblem(x.trim())))throw Error('Invalid list items.');return opts({kind:'list',items:(o.items as string[]).map(x=>x.trim())},true);}
  case 'listRange':{only('kind','source');if(typeof o.source!=='string'||!/^[A-Z]{1,3}[1-9][0-9]{0,6}(:[A-Z]{1,3}[1-9][0-9]{0,6})?$/.test(o.source))throw Error('The source must be a range on this sheet.');return opts({kind:'listRange',source:o.source},true);}
  case 'number':{only('kind','whole','operator','value','value2');if(typeof o.whole!=='boolean')throw Error('Whole must be true or false.');const c=compare();const out:ValidationOp={kind:'number',whole:o.whole,operator:c.operator,value:num(o.value,'number')};if(c.two)out.value2=num(o.value2,'second number');return opts(out,false);}
  case 'length':{only('kind','operator','value','value2');const c=compare();const out:ValidationOp={kind:'length',operator:c.operator,value:num(o.value,'length')};if(c.two)out.value2=num(o.value2,'second length');return opts(out,false);}
  case 'date':case 'time':{only('kind','operator','value','value2');const two=compare2();const out:Record<string,unknown>={kind:o.kind,operator:o.operator,value:o.kind==='date'?isoDate(o.value):hhmm(o.value)};if(two)out.value2=o.kind==='date'?isoDate(o.value2):hhmm(o.value2);return opts(out,false);}
  case 'clear':if(Object.keys(o).some(x=>x!=='kind'))throw Error('Unknown validation field.');return {kind:'clear'};
  default:throw Error('Unsupported validation kind.');}
}
/** A real calendar date as YYYY-MM-DD, 1900 to 9999. */
export function isoDate(v:unknown):string{
 if(typeof v!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v))throw Error('Use a date like 2026-01-31.');
 const y=Number(v.slice(0,4)),m=Number(v.slice(5,7)),d=Number(v.slice(8,10)),leap=(y%4===0&&y%100!==0)||y%400===0,days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
 if(y<1900||m<1||m>12||d<1||d>days)throw Error('That date does not exist.');return v;
}
/** A time of day as HH:MM (24 hours). */
export function hhmm(v:unknown):string{if(typeof v!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v))throw Error('Use a time like 09:30.');return v;}
export const VALIDATION_CHOICES=['list','listRange','whole','decimal','length','date','time'] as const;
export type ValidationChoice=typeof VALIDATION_CHOICES[number];
/** Panel inputs to an op; null while incomplete or invalid. */
export interface ValidationExtras{allowBlank:boolean;dropdown:boolean;errorStyle:'stop'|'warning';errorMessage:string}
export const DEFAULT_VALIDATION_EXTRAS:ValidationExtras={allowBlank:true,dropdown:true,errorStyle:'stop',errorMessage:''};
export function buildValidationOp(choice:ValidationChoice,operator:CfOperator,a:string,b:string,extras:ValidationExtras=DEFAULT_VALIDATION_EXTRAS):ValidationOp|null{
 const n=(v:string)=>v.trim()!==''&&Number.isFinite(Number(v))?Number(v):NaN;
 const two=operator==='between'||operator==='notBetween';
 const more:Record<string,unknown>={...(extras.allowBlank?{}:{allowBlank:false}),...(extras.errorStyle==='stop'?{}:{errorStyle:extras.errorStyle}),...(extras.errorMessage.trim()?{errorMessage:extras.errorMessage}:{})};
 const drop=extras.dropdown?{}:{dropdown:false};
 try{
  if(choice==='list'){const items=parseItemList(a);return items?parseValidationCommand({kind:'list',items,...drop,...more}):null;}
  if(choice==='listRange')return parseValidationCommand({kind:'listRange',source:a.trim().toUpperCase().replace(/\$/g,''),...drop,...more});
  if(choice==='date'||choice==='time')return parseValidationCommand({kind:choice,operator,value:a.trim(),...(two?{value2:b.trim()}:{}),...more});
  const base={operator,value:n(a),...(two?{value2:n(b)}:{}),...more};
  return parseValidationCommand(choice==='length'?{kind:'length',...base}:{kind:'number',whole:choice==='whole',...base});
 }catch{return null;}
}
/** The bridge's answer for one cell's rule, bounded; null when the cell has none. */
export function parseValidationRule(raw:unknown):ValidationRuleInfo|null{
 const r=(raw as {rule?:unknown}|null)?.rule as Record<string,unknown>|null|undefined;if(!r||typeof r!=='object')return null;
 const t=(v:unknown,n=255)=>typeof v==='string'?v.slice(0,n):'';
 return {kind:t(r.kind,24),operator:t(r.operator,24),f1:t(r.f1),f2:typeof r.f2==='string'?r.f2.slice(0,255):null,allowBlank:r.allowBlank!==false,dropdown:r.dropdown!==false,errorStyle:t(r.errorStyle,24),errorMessage:t(r.errorMessage),ranges:Array.isArray(r.ranges)?r.ranges.filter((x):x is string=>typeof x==='string').slice(0,8).map(x=>x.slice(0,40)):[]};
}
export const MAX_INVALID_CELLS=500;
export function parseInvalidCells(raw:unknown):InvalidCells{
 const r=raw as {invalid?:unknown;truncated?:unknown}|null;const list=Array.isArray(r?.invalid)?(r!.invalid as unknown[]):[];
 return {cells:list.filter((x):x is string=>typeof x==='string'&&/^[A-Z]{1,3}[0-9]{1,7}$/.test(x)).slice(0,MAX_INVALID_CELLS),truncated:r?.truncated===true};
}
