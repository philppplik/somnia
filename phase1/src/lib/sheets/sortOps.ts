import type {SortOp} from './protocol';
/** Sorting: validation for untrusted command input. The Rust bridge and the engine re-validate every field. */
export const MAX_SORT_KEYS=3,MAX_SORT_CELLS=1_000_000;
/** True when the block is large enough to sort (two rows, and a body row below a header). */
export function sortBlockProblem(rows:number,cols:number,header:boolean):'small'|'large'|'header'|null{
 if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<2||cols<1)return 'small';
 if(rows*cols>MAX_SORT_CELLS)return 'large';
 if(header&&rows<3)return 'header';return null;
}
/** Guess whether the first row is a header: text over a column that holds a number below it. Only a default; the user decides. */
export function guessHeader(first:readonly string[],second:readonly string[]):boolean{
 const num=(v:string)=>v.trim()!==''&&Number.isFinite(Number(v.replace(/,/g,'')));
 return first.some((v,i)=>v.trim()!==''&&!num(v)&&num(second[i]??''))&&!first.some(num);
}
export function parseSortCommand(input:unknown,cols?:number):SortOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Sort must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>!['column','order','header'].includes(k)))throw Error('Unknown sort field.');
 if(typeof o.column!=='number'||!Number.isInteger(o.column)||o.column<0||o.column>=16384||(cols!==undefined&&o.column>=cols))throw Error('Invalid sort column.');
 if(o.order!=='asc'&&o.order!=='desc')throw Error('Sort order must be asc or desc.');
 if(typeof o.header!=='boolean')throw Error('Header must be true or false.');
 return {header:o.header,keys:[{column:o.column,order:o.order}]};
}
