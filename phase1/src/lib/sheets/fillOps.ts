import type {FillDirection} from './protocol';
/** Fill down/right: validation for untrusted command input. The Rust bridge and the engine re-validate. */
export const MAX_FILL_CELLS=1_000_000;
export const FILL_DIRECTIONS:readonly FillDirection[]=['down','right','up','left'];
/** Why the selected block cannot be filled in this direction, or null. `row`/`col` are the block origin. */
export function fillBlockProblem(row:number,col:number,rows:number,cols:number,dir:FillDirection):'small'|'large'|'edge'|null{
 if(![row,col,rows,cols].every(Number.isInteger)||row<0||col<0||rows<1||cols<1)return 'small';
 if(rows*cols>MAX_FILL_CELLS)return 'large';
 const vertical=dir==='down'||dir==='up',span=vertical?rows:cols,start=vertical?row:col;
 if(span>=2)return null;
 return (dir==='down'||dir==='right')&&start>0?null:'edge';
}
export function parseFillCommand(input:unknown):{dir:FillDirection}{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Fill must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>k!=='dir'))throw Error('Unknown fill field.');
 if(typeof o.dir!=='string'||!(FILL_DIRECTIONS as readonly string[]).includes(o.dir))throw Error('Fill direction must be down, right, up or left.');
 return {dir:o.dir as FillDirection};
}
