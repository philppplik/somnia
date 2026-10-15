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

export const MAX_AUTOFILL_COUNT=100_000;
export const AUTOFILL_MODES=['series','copy','formats','values'] as const;
export type AutoFillMode=typeof AUTOFILL_MODES[number];
export type AutoFillDir='down'|'up'|'right'|'left';
export interface AutoFillOp{dir:AutoFillDir;count:number;mode?:'copy'|'formats'|'values'}
const withMode=(mode:unknown):{mode?:'copy'|'formats'|'values'}=>mode==='copy'||mode==='formats'||mode==='values'?{mode}:{};
/** Fill-handle command input: continue the selection for `count` more rows or columns. The Rust bridge re-validates. */
export function parseAutoFillCommand(input:unknown):AutoFillOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Fill must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>!['dir','count','mode'].includes(k)))throw Error('Unknown fill field.');
 if(o.dir!=='down'&&o.dir!=='up'&&o.dir!=='right'&&o.dir!=='left')throw Error('Fill direction must be down, up, right or left.');
 if(typeof o.count!=='number'||!Number.isInteger(o.count)||o.count<1||o.count>MAX_AUTOFILL_COUNT)throw Error('Count must be 1 to 100000.');
 if(o.mode!==undefined&&!(AUTOFILL_MODES as readonly unknown[]).includes(o.mode))throw Error('Mode must be series, copy, formats or values.');
 return {dir:o.dir,count:o.count,...withMode(o.mode)};
}
/** Where a fill-handle drag ends: the cell under the pointer, compared with the selection. The longest pull past one edge wins (ties prefer down, right, up, left); null when the pointer is inside the selection or the pull is too big. */
export function fillDragOp(range:{r0:number;c0:number;r1:number;c1:number},to:{row:number;col:number},totalRows:number,totalCols:number,mode:AutoFillMode):AutoFillOp|null{
 const pulls:[AutoFillDir,number,number][]=[['down',to.row-range.r1,totalRows-1-range.r1],['right',to.col-range.c1,totalCols-1-range.c1],['up',range.r0-to.row,range.r0],['left',range.c0-to.col,range.c0]];
 let best:[AutoFillDir,number,number]|null=null;for(const p of pulls)if(p[1]>0&&(!best||p[1]>best[1]))best=p;
 if(!best)return null;
 const count=Math.min(best[1],best[2]);if(count<1||count>MAX_AUTOFILL_COUNT)return null;
 const lane=best[0]==='down'||best[0]==='up'?range.c1-range.c0+1:range.r1-range.r0+1;if(count*lane>MAX_FILL_CELLS)return null;
 return {dir:best[0],count,...withMode(mode)};
}
