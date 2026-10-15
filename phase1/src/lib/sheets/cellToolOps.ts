import type {CellToolOp,FunctionInfo} from './protocol';
/** Cell styles, AutoSum, checkboxes, format painter and the function picker: validation of untrusted input. The Rust bridge re-validates. */
export const CELL_STYLE_GROUPS={
 status:['Normal','Good','Bad','Neutral'],
 data:['Calculation','Check Cell','Explanatory Text','Input','Linked Cell','Note','Output','Warning Text'],
 titles:['Title','Heading 1','Heading 2','Heading 3','Heading 4','Total'],
 numbers:['Currency','Comma','Percent','Currency [0]','Comma [0]'],
} as const;
export const CELL_STYLES:readonly string[]=Object.values(CELL_STYLE_GROUPS).flat();
export const MAX_STYLE_NAME=60,MAX_CUSTOM_STYLES=50;
/** A name for a new custom style: trimmed, 1 to 60 characters, no control characters, never a built-in name. */
export function cleanStyleName(input:unknown):string|null{
 if(typeof input!=='string')return null;const n=input.trim();
 if(!n||[...n].length>MAX_STYLE_NAME||/[\u0000-\u001f\u007f]/.test(n))return null;
 if(CELL_STYLES.some(b=>b.toLowerCase()===n.toLowerCase()))return null;return n;
}
export function parseCustomStyles(input:unknown):string[]{
 if(!input||typeof input!=='object'||!Array.isArray((input as {styles?:unknown}).styles))throw Error('Invalid style list.');
 const l=(input as {styles:unknown[]}).styles;if(l.length>MAX_CUSTOM_STYLES)throw Error('Too many styles.');
 return l.map(x=>{if(typeof x!=='string'||!x||[...x].length>MAX_STYLE_NAME)throw Error('Invalid style name.');return x;});
}
export const AUTOSUM_FUNCTIONS=['SUM','AVERAGE','COUNT','MAX','MIN'] as const;
export const SIMPLE_CELL_TOOLS=['insertCheckbox','toggleCheckbox','pickFormat','pasteFormat'] as const;
export const CELL_TOOL_MAX_CELLS=1_000_000;
export const CHECKBOX_MAX_CELLS=100_000;
export const MAX_FUNCTIONS=1000;
export const MAX_FUNCTION_RESULTS=200;
export function parseCellToolCommand(input:unknown):CellToolOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Cell tool must be an object.');
 const o=input as Record<string,unknown>,only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown cell tool field.');};
 if(o.kind==='style'){only('kind','name');if(typeof o.name!=='string'||!(CELL_STYLES.includes(o.name)||cleanStyleName(o.name)===o.name))throw Error('Unknown cell style.');return {kind:'style',name:o.name};}
 if(o.kind==='newStyle'){only('kind','name');const n=cleanStyleName(o.name);if(!n)throw Error('Invalid style name.');return {kind:'newStyle',name:n};}
 if(o.kind==='deleteStyle'){only('kind','name');const n=cleanStyleName(o.name);if(!n)throw Error('Invalid style name.');return {kind:'deleteStyle',name:n};}
 if(o.kind==='renameStyle'){only('kind','name','newName');const n=cleanStyleName(o.name),m=cleanStyleName(o.newName);if(!n||!m)throw Error('Invalid style name.');return {kind:'renameStyle',name:n,newName:m};}
 if(o.kind==='autoSum'){only('kind','function');if(!(AUTOSUM_FUNCTIONS as readonly unknown[]).includes(o.function))throw Error('Unsupported function.');return {kind:'autoSum',function:o.function as typeof AUTOSUM_FUNCTIONS[number]};}
 if((SIMPLE_CELL_TOOLS as readonly unknown[]).includes(o.kind)){only('kind');return {kind:o.kind as typeof SIMPLE_CELL_TOOLS[number]};}
 throw Error('Unsupported cell tool.');
}
/** Why a block cannot take the tool (null when it can), so the panel can explain before sending. */
export function cellToolProblem(op:CellToolOp,rows:number,cols:number):'cells'|'many'|null{
 if(rows<1||cols<1||rows*cols>CELL_TOOL_MAX_CELLS)return 'cells';
 if((op.kind==='insertCheckbox'||op.kind==='toggleCheckbox')&&rows*cols>CHECKBOX_MAX_CELLS)return 'many';
 return null;
}
/** Value of the tool select: `style:Good`, `sum:SUM` or a plain tool name. */
export function toolFromChoice(choice:string):CellToolOp|null{
 const [head,...rest]=choice.split(':'),tail=rest.join(':');
 try{return head==='style'||head==='custom'?parseCellToolCommand({kind:'style',name:tail}):head==='sum'?parseCellToolCommand({kind:'autoSum',function:tail}):parseCellToolCommand({kind:head});}catch{return null;}
}
const str=(v:unknown,n:number)=>typeof v==='string'?v.slice(0,n):'';
/** The engine's function library: closed shape, bounded text, never trusted blindly. */
export function parseFunctionCatalog(input:unknown):FunctionInfo[]{
 if(!input||typeof input!=='object'||!Array.isArray((input as {functions?:unknown}).functions))throw Error('Invalid function list.');
 const list=(input as {functions:unknown[]}).functions;if(list.length>MAX_FUNCTIONS)throw Error('Too many functions.');
 return list.map(f=>{if(!f||typeof f!=='object')throw Error('Invalid function.');const o=f as Record<string,unknown>,name=str(o.name,64);if(!isFunctionName(name))throw Error('Invalid function name.');
  return {name,category:str(o.category,32)||'Other',signature:str(o.signature,200),description:str(o.description,300)};});
}
export function isFunctionName(name:unknown):name is string{return typeof name==='string'&&/^[A-Za-z][A-Za-z0-9._]{0,63}$/.test(name);}
/** What starts in the cell editor: the formula opener only, the person finishes the arguments. */
export function functionFormulaStart(name:unknown):string{if(!isFunctionName(name))throw Error('Invalid function name.');return '='+name.toUpperCase()+'(';}
/** Search (name or description) and category filter, bounded, in name order. */
export function filterFunctions(list:readonly FunctionInfo[],category:string,search:string):FunctionInfo[]{
 const q=search.trim().toLowerCase();
 return list.filter(f=>(!category||f.category===category)&&(!q||f.name.toLowerCase().includes(q)||f.description.toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,MAX_FUNCTION_RESULTS);
}
export function functionCategories(list:readonly FunctionInfo[]):string[]{return [...new Set(list.map(f=>f.category))].sort();}
