import type {DataToolOp} from './protocol';
/** Flash Fill and Consolidate: validation of untrusted command input. The Rust bridge re-validates. */
export const CONSOLIDATE_FUNCTIONS=['sum','count','countNums','average','max','min','product'] as const;
export const MAX_CONSOLIDATE_SOURCES=20,MAX_SOURCE_CHARS=255;
const SOURCE=/^(?:(?:'[^'\u0000-\u001f]{1,31}'|[^'!:;\[\]*?/\\\s\u0000-\u001f]{1,31})!)?\$?[A-Za-z]{1,3}\$?[0-9]{1,7}(?::\$?[A-Za-z]{1,3}\$?[0-9]{1,7})?$/;
/** True for one range such as `B2:D9` or `East!A1:C3` (a sheet name with spaces needs single quotes). */
export function isSourceRange(text:unknown):text is string{return typeof text==='string'&&text.length<=MAX_SOURCE_CHARS&&SOURCE.test(text.trim());}
/** Splits the semicolon separated field of the panel; null when it is empty, too long or has a bad range. */
export function parseSourceList(text:string):string[]|null{
 const parts=text.split(';').map(x=>x.trim()).filter(Boolean);
 if(parts.length===0||parts.length>MAX_CONSOLIDATE_SOURCES||!parts.every(isSourceRange))return null;return parts;
}
export function parseDataToolCommand(input:unknown):DataToolOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Data tool must be an object.');
 const o=input as Record<string,unknown>,only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown data tool field.');};
 if(o.kind==='flashFill'){only('kind');return {kind:'flashFill'};}
 if(o.kind==='consolidate'){
  only('kind','function','sources','topRow','leftColumn');
  if(!(CONSOLIDATE_FUNCTIONS as readonly unknown[]).includes(o.function))throw Error('Unsupported function.');
  if(!Array.isArray(o.sources)||o.sources.length<1||o.sources.length>MAX_CONSOLIDATE_SOURCES||!o.sources.every(isSourceRange))throw Error('Give 1 to 20 valid source ranges.');
  for(const k of ['topRow','leftColumn'])if(o[k]!==undefined&&typeof o[k]!=='boolean')throw Error(k+' must be true or false.');
  return {kind:'consolidate',function:o.function as typeof CONSOLIDATE_FUNCTIONS[number],sources:o.sources.map(x=>(x as string).trim()),topRow:o.topRow===true,leftColumn:o.leftColumn===true};
 }
 throw Error('Unsupported data tool.');
}
/** Why the selection cannot take the tool (null when it can). Flash Fill needs a column to its left. */
export function dataToolProblem(op:DataToolOp,col:number):'left'|null{return op.kind==='flashFill'&&col<1?'left':null;}
