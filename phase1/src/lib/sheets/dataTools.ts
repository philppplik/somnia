import type {DedupeOp,SplitDelimiter,SplitOp} from './protocol';
/** Remove duplicates and text to columns: validation for untrusted command input. The Rust bridge re-validates. */
export const SPLIT_DELIMITERS:readonly SplitDelimiter[]=[',',';','\t',' ','|'];
export const MAX_SPLIT_PARTS=20,MAX_DEDUPE_CELLS=1_000_000,MAX_SPLIT_ROWS=10_000;
export function dedupeBlockProblem(rows:number,cols:number,header:boolean):'small'|'large'|'header'|null{
 if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<2||cols<1)return 'small';if(rows*cols>MAX_DEDUPE_CELLS)return 'large';if(header&&rows<3)return 'header';return null;
}
export function splitBlockProblem(rows:number,cols:number):'columns'|'large'|null{
 if(!Number.isInteger(rows)||!Number.isInteger(cols)||cols!==1||rows<1)return 'columns';return rows>MAX_SPLIT_ROWS?'large':null;
}
export function parseDedupeCommand(input:unknown,cols?:number):DedupeOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Remove duplicates must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>k!=='header'&&k!=='columns'))throw Error('Unknown field.');
 if(typeof o.header!=='boolean')throw Error('Header must be true or false.');
 if(!Array.isArray(o.columns)||o.columns.length===0||o.columns.length>16384)throw Error('Pick at least one column.');
 const seen=new Set<number>();for(const c of o.columns){if(typeof c!=='number'||!Number.isInteger(c)||c<0||c>=16384||(cols!==undefined&&c>=cols)||seen.has(c))throw Error('Invalid column.');seen.add(c);}
 return {header:o.header,columns:o.columns as number[]};
}
/** "3, 8, 12" -> [3,8,12]; null when empty, not ascending, out of 1..255 or too many. */
export function parseWidths(raw:string):number[]|null{
 const parts=raw.split(',').map(x=>x.trim()).filter(x=>x!=='');if(parts.length===0||parts.length>MAX_SPLIT_PARTS-1)return null;
 const out:number[]=[];for(const p of parts){if(!/^[0-9]{1,3}$/.test(p))return null;const n=Number(p);if(n<1||n>255||(out.length>0&&out[out.length-1]>=n))return null;out.push(n);}return out;
}
export function parseSplitCommand(input:unknown):SplitOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Split must be an object.');
 const o=input as Record<string,unknown>;const only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown split field.');};
 if(o.kind==='delimited'){only('kind','delimiters','treatConsecutive');if(!Array.isArray(o.delimiters)||o.delimiters.length===0||o.delimiters.length>SPLIT_DELIMITERS.length||o.delimiters.some(d=>typeof d!=='string'||!(SPLIT_DELIMITERS as readonly string[]).includes(d))||new Set(o.delimiters).size!==o.delimiters.length)throw Error('Unsupported delimiter.');if(typeof o.treatConsecutive!=='boolean')throw Error('treatConsecutive must be true or false.');return {kind:'delimited',delimiters:o.delimiters as SplitDelimiter[],treatConsecutive:o.treatConsecutive};}
 if(o.kind==='fixed'){only('kind','widths');if(!Array.isArray(o.widths)||o.widths.length===0||o.widths.length>MAX_SPLIT_PARTS-1)throw Error('Invalid widths.');let last=0;for(const w of o.widths){if(typeof w!=='number'||!Number.isInteger(w)||w<=last||w>255)throw Error('Widths must ascend from 1 to 255.');last=w;}return {kind:'fixed',widths:o.widths as number[]};}
 throw Error('Unsupported split kind.');
}
